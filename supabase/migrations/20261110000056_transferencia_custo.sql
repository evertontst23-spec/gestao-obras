-- =====================================================================
-- 0056 — Transferência de custo entre obras (centros de custo)
--  Um valor em reais sai do custo de uma obra e entra no de outra (ex.: mão de obra da Praça da Foice que
--  trabalhou na Praça da Bandeira). Não é conta a pagar: não mexe no caixa nem no total da empresa.
--  Obra vazia = Administração central (sem obra). Cancelável com motivo; nada é apagado.
-- =====================================================================
create sequence transferencia_custo_numero_seq;
create table transferencias_custo (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint not null unique default nextval('transferencia_custo_numero_seq'),
  origem_obra_id       uuid references obras(id),
  destino_obra_id      uuid references obras(id),
  categoria            text not null check (categoria in ('material','mao_de_obra','encargos','beneficios','equipamentos','servicos_terceiros','impostos','administrativo','outras_despesas')),
  valor                numeric(14,2) not null check (valor > 0),
  competencia          date not null,
  motivo               text not null check (length(trim(motivo)) >= 5),
  status               text not null default 'ativa' check (status in ('ativa','cancelada')),
  motivo_cancelamento  text,
  cancelado_por        uuid references perfis(id),
  cancelado_em         timestamptz,
  criado_por           uuid references perfis(id) default auth.uid(),
  criado_em            timestamptz not null default now(),
  check (origem_obra_id is distinct from destino_obra_id)
);
create index on transferencias_custo (competencia);

create or replace function custo_transferir(p_origem uuid, p_destino uuid, p_categoria text, p_valor numeric, p_competencia date, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_de text; v_para text;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro transferem custo entre obras'; end if;
  if p_origem is not distinct from p_destino then raise exception 'Origem e destino iguais'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo da transferência'; end if;
  insert into transferencias_custo (origem_obra_id, destino_obra_id, categoria, valor, competencia, motivo)
  values (p_origem, p_destino, p_categoria, round(p_valor, 2), date_trunc('month', coalesce(p_competencia, hoje()))::date, trim(p_motivo))
  returning id into v_id;
  v_de := coalesce((select nome from obras where id = p_origem), 'Administração central');
  v_para := coalesce((select nome from obras where id = p_destino), 'Administração central');
  perform _notificar_papeis(array['admin','financeiro'], 'transferencia_custo',
    format('Custo transferido entre obras: %s', _brl(round(p_valor, 2))),
    format('%s → %s • %s', v_de, v_para, trim(p_motivo)), '/financeiro/transferencias');
  return v_id;
end $$;

create or replace function custo_transferencia_cancelar(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro cancelam'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  update transferencias_custo set status = 'cancelada', motivo_cancelamento = trim(p_motivo), cancelado_por = auth.uid(), cancelado_em = now()
   where id = p_id and status = 'ativa';
  if not found then raise exception 'Transferência não encontrada ou já cancelada'; end if;
end $$;

create view v_transferencias_custo with (security_invoker = true) as
select t.*, coalesce(oo.nome, 'Administração central') as origem_nome, oo.codigo as origem_codigo,
       coalesce(od.nome, 'Administração central') as destino_nome, od.codigo as destino_codigo, p.nome as criado_por_nome
  from transferencias_custo t left join obras oo on oo.id = t.origem_obra_id left join obras od on od.id = t.destino_obra_id
  left join perfis p on p.id = t.criado_por;

create trigger tg_transf_custo_nodelete before delete on transferencias_custo for each row execute function _tg_bloquear_exclusao();
create trigger tg_transf_custo_audit after insert or update on transferencias_custo for each row execute function _tg_auditoria();
alter table transferencias_custo enable row level security;
revoke all on transferencias_custo from anon;
grant select on transferencias_custo, v_transferencias_custo to authenticated;
create policy transf_custo_sel on transferencias_custo for select to authenticated
  using (tem_papel('admin','financeiro') or (origem_obra_id is not null and membro_obra(origem_obra_id)) or (destino_obra_id is not null and membro_obra(destino_obra_id)));

revoke execute on function custo_transferir(uuid, uuid, text, numeric, date, text) from public, anon;
revoke execute on function custo_transferencia_cancelar(uuid, text) from public, anon;
grant execute on function custo_transferir(uuid, uuid, text, numeric, date, text), custo_transferencia_cancelar(uuid, text) to authenticated;
