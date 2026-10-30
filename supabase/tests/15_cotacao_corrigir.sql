-- =====================================================================
-- TESTE: corrigir cotação sem perder o trabalho
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

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select solicitacao_id as sm from solicitacao_itens where material = 'Pá' limit 1 \gset
select format('[%s]', string_agg(format('{"solicitacao_item_id":"%s"}', id), ',')) as itens from solicitacao_itens where solicitacao_id = :'sm' \gset
select cotacao_criar(null, :'itens'::jsonb) as c1 \gset
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":50}', id), ',')) as precos from cotacao_itens where cotacao_id = :'c1' \gset
select cotacao_proposta_salvar(:'c1', 'e2000000-0000-0000-0000-000000000001', 5, '28 dias', 0, :'precos'::jsonb) as p1 \gset
select cotacao_proposta_salvar(:'c1', 'e2000000-0000-0000-0000-000000000002', 5, 'à vista', 0, :'precos'::jsonb) as p2 \gset
-- valor digitado errado: corrige salvando de novo o mesmo fornecedor
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":5}', id), ',')) as precos2 from cotacao_itens where cotacao_id = :'c1' \gset
select cotacao_proposta_salvar(:'c1', 'e2000000-0000-0000-0000-000000000001', 5, '28 dias', 0, :'precos2'::jsonb);
select pg_temp.confere((select valor_total = 25 from cotacao_propostas where id = :'p1'), 'corrigir o valor da proposta (mesmo fornecedor) atualiza o total');
select cotacao_proposta_excluir(:'p2');
select pg_temp.confere((select count(*) = 1 from cotacao_propostas where cotacao_id = :'c1'), 'proposta errada pode ser excluída');

select cotacao_enviar_aprovacao(:'c1', :'p1');
select cotacao_voltar_correcao(:'c1', 'Faltou o frete');
select pg_temp.confere((select status = 'em_cotacao' and proposta_escolhida_id is null from cotacoes where id = :'c1'), 'cotação aguardando aprovação volta para correção');

select cotacao_cancelar(:'c1', 'Errei o valor');
select pg_temp.confere((select bool_and(cotacao_id is null and status = 'em_cotacao') from solicitacao_itens where solicitacao_id = :'sm'), 'cancelar devolve os itens para a fila');
select cotacao_reabrir(:'c1');
select pg_temp.confere((select status = 'em_cotacao' from cotacoes where id = :'c1')
  and (select bool_and(cotacao_id = :'c1') from solicitacao_itens where solicitacao_id = :'sm')
  and (select count(*) = 1 from cotacao_propostas where cotacao_id = :'c1'), 'reabrir traz de volta os itens e as propostas');

select cotacao_cancelar(:'c1', 'Vou refazer');
select cotacao_criar(null, :'itens'::jsonb) as c2 \gset
select pg_temp.confere(:'c2' is not null, 'itens de cotação cancelada podem entrar em nova cotação');
select pg_temp.espera_erro(format($$select cotacao_reabrir(%L)$$, :'c1'), 'já estão em outra cotação');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select cotacao_reabrir(%L)$$, :'c1'), 'Apenas o comprador');
\echo ''
\echo '=========== TESTES DE CORREÇÃO DE COTAÇÃO PASSARAM ==========='
