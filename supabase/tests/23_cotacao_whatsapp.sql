-- =====================================================================
-- TESTE: forma de pagamento, envio por WhatsApp e anexo da proposta
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
select cotacao_criar('10000000-0000-0000-0000-000000000001', format('[{"insumo_id":"%s","quantidade":4}]', :'ins')::jsonb, 'Teste de forma de pagamento') as c \gset
select cotacao_registrar_envio(:'c', 'e2000000-0000-0000-0000-000000000001', '(81) 99999-0000');
select pg_temp.confere((select telefone = '81999990000' from cotacao_envios where cotacao_id = :'c'), 'envio por WhatsApp registrado');
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":10}', id), ',')) as precos from cotacao_itens where cotacao_id = :'c' \gset
select cotacao_proposta_salvar(:'c', 'e2000000-0000-0000-0000-000000000001', 2, '28 dias', 0, :'precos'::jsonb) as p \gset
select pg_temp.espera_erro(format($$select cotacao_proposta_complementar(%L, 'cheque')$$, :'p'), 'Forma de pagamento inválida');
select cotacao_proposta_complementar(:'p', 'cartao_credito', 'sup/cot/x/proposta.pdf');
select pg_temp.confere((select forma_pagamento = 'cartao_credito' and anexo_caminho = 'sup/cot/x/proposta.pdf' from cotacao_propostas where id = :'p'), 'proposta guarda forma de pagamento e o PDF');
select cotacao_enviar_aprovacao(:'c', :'p');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select cotacao_decidir(:'c', true) as oc \gset
select pg_temp.confere((select forma_pagamento = 'cartao_credito' from ordens_compra where id = :'oc'), 'OC herda a forma de pagamento');
select oc_desfazer(:'oc', 'Teste de cópia') as c2 \gset
select pg_temp.confere((select forma_pagamento = 'cartao_credito' and anexo_caminho is not null from cotacao_propostas where cotacao_id = :'c2'), 'desfazer OC mantém forma de pagamento e anexo');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select cotacao_registrar_envio(%L, null)$$, :'c2'), 'Apenas o comprador');
\echo ''
\echo '=========== TESTES DE WHATSAPP E PAGAMENTO NA COTAÇÃO PASSARAM ==========='
