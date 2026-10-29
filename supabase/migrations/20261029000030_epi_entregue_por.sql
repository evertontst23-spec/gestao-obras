-- =====================================================================
-- 0030 — Ficha de EPI: quem entregou
--  Além do usuário que lançou no sistema, registra o funcionário que entregou o EPI em campo
--  (almoxarife, técnico de segurança, encarregado…). Vai para cada linha da ficha.
-- =====================================================================
alter table epi_pendentes add column entregue_por_func uuid references funcionarios(id);
alter table epi_entregas  add column entregue_por_func uuid references funcionarios(id);

create or replace function epi_pendente_definir_entregador(p_pend uuid, p_func uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro') then raise exception 'Sem permissão para alterar a entrega de EPI'; end if;
  if p_func is not null and not exists (select 1 from funcionarios where id = p_func and ativo) then raise exception 'Funcionário não encontrado'; end if;
  update epi_pendentes set entregue_por_func = p_func where id = p_pend and entrega_id is null;
  if not found then raise exception 'Entrega pendente não encontrada ou já assinada'; end if;
end $$;
revoke execute on function epi_pendente_definir_entregador(uuid, uuid) from public, anon;
grant execute on function epi_pendente_definir_entregador(uuid, uuid) to authenticated;

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
  insert into epi_entregas (funcionario_id, obra_id, data, motivo, confirmacao, assinatura_caminho, distancia_facial, observacoes, entregue_por, entregue_por_func, hash)
  values (pe.funcionario_id, pe.obra_id, pe.data, pe.motivo, p_confirmacao, p_assinatura, round(v_dist::numeric, 4),
          concat_ws(' — ', nullif(pe.observacoes, ''), 'Recebimento confirmado em ' || to_char(now() at time zone 'America/Recife', 'DD/MM/YYYY HH24:MI')),
          pe.registrado_por, pe.entregue_por_func, 'pendente')
  returning id into v_id;
  insert into epi_entrega_itens values (v_id, ins.id, q, ins.ca, ins.ca_validade, case when ins.vida_util_dias is not null then pe.data + ins.vida_util_dias end);
  update epi_entregas set hash = _sha(concat_ws('|', v_id, pe.funcionario_id, now(), ins.codigo || ':' || q, p_confirmacao, coalesce(p_assinatura,''), coalesce(v_dist::text,''), coalesce(pe.entregue_por_func::text, ''))) where id = v_id;

  update epi_pendentes set confirmados = confirmados || jsonb_build_object(p_insumo::text, v_id) where id = p_pend
    returning jsonb_array_length(itens), (select count(*) from jsonb_object_keys(confirmados)) into v_total, v_feitos;
  if v_feitos >= v_total then update epi_pendentes set entrega_id = v_id, confirmado_em = now() where id = p_pend; end if;
  return v_id;
end $$;
