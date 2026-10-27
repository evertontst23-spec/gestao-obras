-- =====================================================================
-- 0022 — Verificação de estoque em lote
--  Em vez de registrar item por item, o almoxarifado decide vários itens de uma vez:
--  'cotacao' = nenhum tem estoque (todos vão para cotação);
--  'estoque' = todos estão disponíveis em estoque na quantidade pedida.
--  Tudo ou nada: se um item falhar (ex.: saldo insuficiente), nenhum é alterado.
-- =====================================================================
create or replace function itens_verificar_estoque_lote(p_itens uuid[], p_modo text, p_observacao text default null)
returns int language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; n int := 0;
begin
  if meu_papel() not in ('almoxarifado','admin') then raise exception 'Apenas o almoxarifado registra a verificação de estoque'; end if;
  if p_modo not in ('cotacao','estoque') then raise exception 'Modo inválido'; end if;
  for i in select * from solicitacao_itens where id = any(p_itens) and status = 'aprovado' order by criado_em loop
    perform item_verificar_estoque(i.id, case when p_modo = 'estoque' then i.quantidade else 0 end, p_observacao);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nenhum item aguardando verificação de estoque'; end if;
  return n;
end $$;
revoke execute on function itens_verificar_estoque_lote(uuid[], text, text) from public, anon;
grant execute on function itens_verificar_estoque_lote(uuid[], text, text) to authenticated;
