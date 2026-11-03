-- =====================================================================
-- TESTE: tirar itens da cotação e voltar item para verificação de estoque
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.como(u text) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: era esperado erro "%" em: %', p_trecho, p_sql;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if position(lower(p_trecho) in lower(sqlerrm)) = 0 then
    raise exception 'FALHOU: erro diferente do esperado. Esperado "%", recebido "%"', p_trecho, sqlerrm;
  end if;
  raise notice 'ok — bloqueado: %', sqlerrm;
end $$;
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- pedido com 3 itens, todos sem estoque → fila
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 5, 'normal', null, 'Teste tirar da cotação',
  '[{"material":"Item A teste","unidade":"un","quantidade":1},{"material":"Item B teste","unidade":"un","quantidade":2},{"material":"Item C teste","unidade":"un","quantidade":3}]'::jsonb) as sm \gset
select id as a from solicitacao_itens where solicitacao_id = :'sm' and material = 'Item A teste' \gset
select id as b from solicitacao_itens where solicitacao_id = :'sm' and material = 'Item B teste' \gset
select id as cc from solicitacao_itens where solicitacao_id = :'sm' and material = 'Item C teste' \gset
select item_verificar_estoque(:'a', 0, null); select item_verificar_estoque(:'b', 0, null); select item_verificar_estoque(:'cc', 0, null);

-- C foi para a fila por engano: volta para verificação
select item_voltar_verificacao(:'cc', 'Tem no almoxarifado');
select pg_temp.confere((select status = 'aprovado' from solicitacao_itens where id = :'cc'), 'item volta para verificar estoque');

-- comprador cota A e B, mas B entrou sem querer
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select cotacao_criar(null, format('[{"solicitacao_item_id":"%s"},{"solicitacao_item_id":"%s"}]', :'a', :'b')::jsonb) as cot \gset
select id as ia from cotacao_itens where cotacao_id = :'cot' and solicitacao_item_id = :'a' \gset
select id as ib from cotacao_itens where cotacao_id = :'cot' and solicitacao_item_id = :'b' \gset
select cotacao_proposta_salvar(:'cot', 'e2000000-0000-0000-0000-000000000001', 2, null, 5,
  format('[{"cotacao_item_id":"%s","preco_unitario":10},{"cotacao_item_id":"%s","preco_unitario":100}]', :'ia', :'ib')::jsonb) as p \gset
select pg_temp.confere((select valor_total = 215 from cotacao_propostas where id = :'p'), 'proposta com os dois itens');
select pg_temp.espera_erro(format($$select item_voltar_verificacao(%L)$$, :'b'), 'tire-o da cotação antes');
select pg_temp.espera_erro(format($$select cotacao_remover_itens(%L, array[%L, %L]::uuid[])$$, :'cot', :'ia', :'ib'), 'Excluir cotação');
select cotacao_remover_itens(:'cot', array[:'ib']::uuid[], 'Entrou sem querer');
select pg_temp.confere((select cotacao_id is null and status = 'em_cotacao' from solicitacao_itens where id = :'b'), 'item retirado volta para a fila de cotação');
select pg_temp.confere((select valor_total = 15 from cotacao_propostas where id = :'p'), 'proposta recalculada sem o item retirado');
select pg_temp.confere((select total_itens = 1 from v_cotacoes where id = :'cot'), 'cotação continua com o outro item');
-- B pode ir para outra cotação; a proposta da primeira pode ser corrigida só com A
select cotacao_criar(null, format('[{"solicitacao_item_id":"%s"}]', :'b')::jsonb) as cot2 \gset
select cotacao_proposta_salvar(:'cot', 'e2000000-0000-0000-0000-000000000001', 2, null, 0, format('[{"cotacao_item_id":"%s","preco_unitario":12}]', :'ia')::jsonb);
select pg_temp.confere((select valor_total = 12 from cotacao_propostas where id = :'p'), 'proposta salva só com os itens que ficaram');
-- aprovar e desfazer OC não traz o item retirado
select cotacao_enviar_aprovacao(:'cot', :'p');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select cotacao_decidir(:'cot', true) as oc \gset
select pg_temp.confere((select count(*) = 1 from oc_itens where oc_id = :'oc'), 'OC só com o item que ficou');
select oc_desfazer(:'oc', 'teste retirado') as cot3 \gset
select pg_temp.confere((select count(*) = 1 from cotacao_itens where cotacao_id = :'cot3'), 'desfazer OC não traz o item retirado');
\echo ''
\echo '=========== TESTES DE TIRAR ITENS DA COTAÇÃO PASSARAM ==========='
