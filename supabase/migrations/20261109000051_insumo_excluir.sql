-- =====================================================================
-- 0051 — Excluir insumo cadastrado errado
--  * Nunca usado (sem pedido, cotação, OC, estoque, EPI ou cautela): é excluído de vez.
--  * Já usado: não pode sumir (quebraria o histórico) — fica desativado (some das listas de escolha).
-- =====================================================================
create or replace function _tg_insumo_nodelete() returns trigger language plpgsql as $$
begin
  if current_setting('app.excluir_insumo', true) = old.id::text then return old; end if;
  raise exception 'Exclusão não permitida em "insumos": use o botão Excluir do cadastro.' using errcode = 'P0001';
end $$;
drop trigger if exists tg_insumos_nodelete on insumos;
create trigger tg_insumos_nodelete before delete on insumos for each row execute function _tg_insumo_nodelete();

create or replace function insumo_excluir(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i insumos; v_usado boolean;
begin
  if not tem_papel('admin','compras') then raise exception 'Apenas compras ou a diretoria excluem insumos'; end if;
  select * into i from insumos where id = p_id for update;
  if not found then raise exception 'Insumo não encontrado'; end if;
  v_usado := exists (select 1 from solicitacao_itens where insumo_id = p_id) or exists (select 1 from cotacao_itens where insumo_id = p_id)
          or exists (select 1 from oc_itens where insumo_id = p_id) or exists (select 1 from estoque_movimentos where insumo_id = p_id)
          or exists (select 1 from epi_entrega_itens where insumo_id = p_id) or exists (select 1 from cautelas where insumo_id = p_id);
  if v_usado then
    update insumos set ativo = false where id = p_id;
    return 'desativado';
  end if;
  insert into auditoria (tabela, registro_id, acao, usuario_id, antes) values ('insumos', p_id::text, 'DELETE', auth.uid(), to_jsonb(i));
  perform set_config('app.excluir_insumo', p_id::text, true);
  delete from insumos where id = p_id;
  perform set_config('app.excluir_insumo', '', true);
  return 'excluido';
end $$;
revoke execute on function insumo_excluir(uuid) from public, anon;
grant execute on function insumo_excluir(uuid) to authenticated;
