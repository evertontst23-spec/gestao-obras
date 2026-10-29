-- =====================================================================
-- 0026 — Entrega de EPI aguardando assinatura
--  Quando o EPI já foi entregue em campo sem coletar a assinatura no sistema, a Segurança/Diretoria
--  registra a entrega como PENDENTE (itens, CA, data, baixa no estoque). Ela aparece na ficha do
--  funcionário como "aguardando assinatura" e, quando ele confirma (assinatura ou rosto), vira uma
--  entrega normal da ficha de EPI (NR-06), com data da entrega e código de integridade.
-- =====================================================================
create table epi_pendentes (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id),
  obra_id        uuid references obras(id),
  data           date not null default hoje(),
  motivo         text not null default 'admissao' check (motivo in ('admissao','substituicao','desgaste','perda','dano','periodica','visitante')),
  itens          jsonb not null,           -- [{insumo_id, quantidade}]
  observacoes    text,
  baixa_estoque  boolean not null default true,
  registrado_por uuid not null references perfis(id),
  registrado_em  timestamptz not null default now(),
  entrega_id     uuid references epi_entregas(id),   -- preenchido quando o funcionário confirma
  confirmado_em  timestamptz
);
create index on epi_pendentes (funcionario_id) where entrega_id is null;
alter table epi_pendentes enable row level security;
create policy epip_sel on epi_pendentes for select to authenticated using (ve_registro_func(funcionario_id));
grant select on epi_pendentes to authenticated;

create or replace function epi_registrar_pendente(p_func uuid, p_local uuid, p_itens jsonb, p_motivo text default 'admissao',
                                                  p_data date default null, p_obs text default null, p_baixa boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; ins insumos; q numeric; f funcionarios;
begin
  if not tem_papel('admin','seguranca','almoxarifado') then raise exception 'Apenas Segurança, almoxarifado ou diretoria registram entrega pendente de assinatura'; end if;
  select * into f from funcionarios where id = p_func and ativo;
  if not found then raise exception 'Funcionário não encontrado ou desligado'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Selecione os EPIs entregues'; end if;
  if p_data is not null and p_data > hoje() then raise exception 'A data da entrega não pode ser futura'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    select * into ins from insumos where id = (it->>'insumo_id')::uuid;
    if not found or ins.categoria <> 'EPI' then raise exception 'Item não é um EPI cadastrado'; end if;
    if ins.ca is null then raise exception '% sem CA cadastrado — não pode ser entregue (NR-06)', ins.descricao; end if;
    if ins.ca_validade is not null and ins.ca_validade < coalesce(p_data, hoje()) then raise exception 'CA % de % está vencido', ins.ca, ins.descricao; end if;
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

-- O funcionário confirma: vira entrega da ficha (sem nova baixa no estoque)
create or replace function epi_confirmar_pendente(p_pend uuid, p_confirmacao text, p_assinatura text default null, p_descritor real[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pe epi_pendentes; f funcionarios; v_id uuid; v_num bigint; it jsonb; ins insumos; q numeric; v_dist double precision; v_lista text := '';
begin
  if not tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro') then raise exception 'Sem permissão para registrar entrega de EPI'; end if;
  select * into pe from epi_pendentes where id = p_pend for update;
  if not found then raise exception 'Entrega pendente não encontrada'; end if;
  if pe.entrega_id is not null then raise exception 'Esta entrega já foi confirmada'; end if;
  select * into f from funcionarios where id = pe.funcionario_id;
  if p_confirmacao = 'facial' then
    if f.face_descritor is null then raise exception 'Funcionário sem biometria — use a assinatura'; end if;
    v_dist := _dist_face(f.face_descritor, p_descritor);
    if p_descritor is null or v_dist >= 0.5 then raise exception 'O rosto não confere com % — confirme por assinatura', f.nome; end if;
  elsif p_confirmacao = 'assinatura' then
    if coalesce(p_assinatura,'') = '' then raise exception 'Colete a assinatura do funcionário'; end if;
  else raise exception 'Confirmação inválida'; end if;

  insert into epi_entregas (funcionario_id, obra_id, data, motivo, confirmacao, assinatura_caminho, distancia_facial, observacoes, entregue_por, hash)
  values (pe.funcionario_id, pe.obra_id, pe.data, pe.motivo, p_confirmacao, p_assinatura, round(v_dist::numeric, 4),
          concat_ws(' — ', nullif(pe.observacoes, ''), 'Entregue em ' || to_char(pe.data, 'DD/MM/YYYY') || ', recebimento confirmado em ' || to_char(now() at time zone 'America/Recife', 'DD/MM/YYYY HH24:MI')),
          pe.registrado_por, 'pendente')
  returning id, numero into v_id, v_num;
  for it in select * from jsonb_array_elements(pe.itens) loop
    select * into ins from insumos where id = (it->>'insumo_id')::uuid;
    q := coalesce((it->>'quantidade')::numeric, 1);
    insert into epi_entrega_itens values (v_id, ins.id, q, ins.ca, ins.ca_validade, case when ins.vida_util_dias is not null then pe.data + ins.vida_util_dias end);
    v_lista := v_lista || ins.codigo || ':' || q || ';';
  end loop;
  update epi_entregas set hash = _sha(concat_ws('|', v_id, pe.funcionario_id, now(), v_lista, p_confirmacao, coalesce(p_assinatura,''), coalesce(v_dist::text,''))) where id = v_id;
  update epi_pendentes set entrega_id = v_id, confirmado_em = now() where id = p_pend;
  return v_id;
end $$;

revoke execute on function epi_registrar_pendente(uuid, uuid, jsonb, text, date, text, boolean) from public, anon;
revoke execute on function epi_confirmar_pendente(uuid, text, text, real[]) from public, anon;
grant execute on function epi_registrar_pendente(uuid, uuid, jsonb, text, date, text, boolean) to authenticated;
grant execute on function epi_confirmar_pendente(uuid, text, text, real[]) to authenticated;
