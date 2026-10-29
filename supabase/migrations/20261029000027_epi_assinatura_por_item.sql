-- =====================================================================
-- 0027 — Ficha de EPI com assinatura por EPI (NR-06)
--  Cada EPI entregue é confirmado individualmente pelo funcionário (assinatura ou rosto), com data
--  da entrega e data/hora da confirmação. A entrega fica registrada como pendente com a baixa no estoque;
--  cada item assinado vira uma linha própria da ficha.
-- =====================================================================
alter table epi_pendentes add column confirmados jsonb not null default '{}';   -- {insumo_id: entrega_id}

-- Registrar entrega (pendente de assinatura) também por quem entrega em campo
create or replace function epi_registrar_pendente(p_func uuid, p_local uuid, p_itens jsonb, p_motivo text default 'admissao',
                                                  p_data date default null, p_obs text default null, p_baixa boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; ins insumos; q numeric; f funcionarios;
begin
  if not tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro') then raise exception 'Sem permissão para entregar EPI'; end if;
  select * into f from funcionarios where id = p_func and ativo;
  if not found then raise exception 'Funcionário não encontrado ou desligado'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Selecione os EPIs entregues'; end if;
  if p_data is not null and p_data > hoje() then raise exception 'A data da entrega não pode ser futura'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    select * into ins from insumos where id = (it->>'insumo_id')::uuid;
    if not found or ins.categoria <> 'EPI' then raise exception 'Item não é um EPI cadastrado'; end if;
    if ins.ca is null then raise exception '% sem CA cadastrado — não pode ser entregue (NR-06)', ins.descricao; end if;
    if ins.ca_validade is not null and ins.ca_validade < coalesce(p_data, hoje()) then raise exception 'CA % de % está vencido', ins.ca, ins.descricao; end if;
    if coalesce((it->>'quantidade')::numeric, 1) <= 0 then raise exception 'Quantidade inválida para %', ins.descricao; end if;
  end loop;
  insert into epi_pendentes (funcionario_id, obra_id, data, motivo, itens, observacoes, baixa_estoque, registrado_por)
  values (p_func, p_local, coalesce(p_data, hoje()), coalesce(p_motivo, 'admissao'), p_itens, p_obs, coalesce(p_baixa, true), auth.uid())
  returning id into v_id;
  if coalesce(p_baixa, true) then
    for it in select * from jsonb_array_elements(p_itens) loop
      q := coalesce((it->>'quantidade')::numeric, 1);
      if _estoque_controlado((it->>'insumo_id')::uuid) then
        perform _movimentar(p_local, (it->>'insumo_id')::uuid, 'saida', q, 'entrega_epi', v_id, 'EPI entregue (aguardando assinatura) — ' || f.nome);
      end if;
    end loop;
  end if;
  return v_id;
end $$;

-- Funcionário assina UM EPI da entrega: vira uma linha da ficha com a própria assinatura
create or replace function epi_confirmar_item(p_pend uuid, p_insumo uuid, p_confirmacao text, p_assinatura text default null, p_descritor real[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pe epi_pendentes; f funcionarios; v_id uuid; it jsonb; ins insumos; q numeric; v_dist double precision; v_total int; v_feitos int;
begin
  if not tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro') then raise exception 'Sem permissão para registrar entrega de EPI'; end if;
  select * into pe from epi_pendentes where id = p_pend for update;
  if not found then raise exception 'Entrega pendente não encontrada'; end if;
  if pe.entrega_id is not null or pe.confirmados ? p_insumo::text then raise exception 'Este EPI já foi assinado'; end if;
  select x into it from jsonb_array_elements(pe.itens) x where (x->>'insumo_id')::uuid = p_insumo limit 1;
  if it is null then raise exception 'Este EPI não faz parte da entrega'; end if;
  select * into f from funcionarios where id = pe.funcionario_id;
  if p_confirmacao = 'facial' then
    if f.face_descritor is null then raise exception 'Funcionário sem biometria — use a assinatura'; end if;
    v_dist := _dist_face(f.face_descritor, p_descritor);
    if p_descritor is null or v_dist >= 0.5 then raise exception 'O rosto não confere com % — confirme por assinatura', f.nome; end if;
  elsif p_confirmacao = 'assinatura' then
    if coalesce(p_assinatura,'') = '' then raise exception 'Colete a assinatura do funcionário'; end if;
  else raise exception 'Confirmação inválida'; end if;

  select * into ins from insumos where id = p_insumo;
  q := coalesce((it->>'quantidade')::numeric, 1);
  insert into epi_entregas (funcionario_id, obra_id, data, motivo, confirmacao, assinatura_caminho, distancia_facial, observacoes, entregue_por, hash)
  values (pe.funcionario_id, pe.obra_id, pe.data, pe.motivo, p_confirmacao, p_assinatura, round(v_dist::numeric, 4),
          concat_ws(' — ', nullif(pe.observacoes, ''), 'Recebimento confirmado em ' || to_char(now() at time zone 'America/Recife', 'DD/MM/YYYY HH24:MI')),
          pe.registrado_por, 'pendente')
  returning id into v_id;
  insert into epi_entrega_itens values (v_id, ins.id, q, ins.ca, ins.ca_validade, case when ins.vida_util_dias is not null then pe.data + ins.vida_util_dias end);
  update epi_entregas set hash = _sha(concat_ws('|', v_id, pe.funcionario_id, now(), ins.codigo || ':' || q, p_confirmacao, coalesce(p_assinatura,''), coalesce(v_dist::text,''))) where id = v_id;

  update epi_pendentes set confirmados = confirmados || jsonb_build_object(p_insumo::text, v_id) where id = p_pend
    returning jsonb_array_length(itens), (select count(*) from jsonb_object_keys(confirmados)) into v_total, v_feitos;
  if v_feitos >= v_total then update epi_pendentes set entrega_id = v_id, confirmado_em = now() where id = p_pend; end if;
  return v_id;
end $$;

revoke execute on function epi_confirmar_item(uuid, uuid, text, text, real[]) from public, anon;
grant execute on function epi_confirmar_item(uuid, uuid, text, text, real[]) to authenticated;
