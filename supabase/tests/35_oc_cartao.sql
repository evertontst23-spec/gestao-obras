-- =====================================================================
-- TESTE: OC paga no cartão de crédito
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
select id as ins from insumos where ativo and categoria <> 'EPI' order by codigo limit 1 \gset
select cotacao_criar('10000000-0000-0000-0000-000000000001', format('[{"insumo_id":"%s","quantidade":2}]', :'ins')::jsonb, 'Teste cartão') as c \gset
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":7}', id), ',')) as pr from cotacao_itens where cotacao_id = :'c' \gset
select cotacao_proposta_salvar(:'c', 'e2000000-0000-0000-0000-000000000001', 1, null, 0, :'pr'::jsonb) as p \gset
select cotacao_enviar_aprovacao(:'c', :'p');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select cotacao_decidir(:'c', true, null, 'retirada', 'João motorista') as oc \gset
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro(format($$select oc_liberar_coleta(%L, 'cartao', null, null, hoje() - 1)$$, :'oc'), 'fatura');
select oc_liberar_coleta(:'oc', 'cartao', null, null, hoje() + 20);
select pg_temp.confere((select status = 'pronta_coleta' and pagamento = 'cartao' from ordens_compra where id = :'oc'), 'OC liberada como paga no cartão');
select pg_temp.confere((select status = 'aberto' and forma_pagamento = 'Cartão de crédito' and vencimento = hoje() + 20 from lancamentos where oc_id = :'oc' and origem = 'oc'),
  'despesa fica em aberto vencendo na fatura');
select oc_voltar_pagamento(:'oc', 'Era boleto, não cartão');
select pg_temp.confere((select o.pagamento is null and l.forma_pagamento is null from ordens_compra o join lancamentos l on l.oc_id = o.id where o.id = :'oc'), 'desfazer limpa o cartão');
