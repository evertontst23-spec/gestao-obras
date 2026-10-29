-- =====================================================================
-- 0028 — Anular entrega de EPI
--  Registro assinado não é apagado (rastreabilidade). Quando foi lançado errado ou refeito em outro
--  formato, a Segurança/Diretoria anula com motivo: some da ficha e das contagens, mas fica no histórico.
-- =====================================================================
alter table epi_entregas add column anulada_em timestamptz, add column anulada_por uuid references perfis(id), add column anulada_motivo text;

create or replace function epi_anular_entrega(p_entrega uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','seguranca') then raise exception 'Apenas Segurança do Trabalho ou diretoria anulam entrega de EPI'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo da anulação'; end if;
  update epi_entregas set anulada_em = now(), anulada_por = auth.uid(), anulada_motivo = trim(p_motivo)
   where id = p_entrega and anulada_em is null;
  if not found then raise exception 'Entrega não encontrada ou já anulada'; end if;
end $$;
revoke execute on function epi_anular_entrega(uuid, text) from public, anon;
grant execute on function epi_anular_entrega(uuid, text) to authenticated;

create or replace view v_epi_situacao with (security_invoker = true) as
select distinct on (e.funcionario_id, i.insumo_id)
       e.funcionario_id, i.insumo_id, ins.codigo, ins.descricao, i.ca, e.data as ultima_entrega, i.proxima_troca,
       (i.proxima_troca is not null and i.proxima_troca < hoje()) as troca_vencida,
       (funcionario_basico(e.funcionario_id)).nome as funcionario_nome,
       (funcionario_basico(e.funcionario_id)).obra_id as obra_id,
       (funcionario_basico(e.funcionario_id)).ativo as ativo
  from epi_entregas e
  join epi_entrega_itens i on i.entrega_id = e.id
  join insumos ins on ins.id = i.insumo_id
 where e.anulada_em is null
 order by e.funcionario_id, i.insumo_id, e.data desc, e.criado_em desc;
