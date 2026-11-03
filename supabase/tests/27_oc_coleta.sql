-- =====================================================================
-- TESTE: coleta do material e entrada no estoque pelo comprador
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
select cotacao_criar('10000000-0000-0000-0000-000000000001', format('[{"insumo_id":"%s","quantidade":3}]', :'ins')::jsonb, 'Teste coleta') as c \gset
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":5}', id), ',')) as pr from cotacao_itens where cotacao_id = :'c' \gset
select cotacao_proposta_salvar(:'c', 'e2000000-0000-0000-0000-000000000001', 1, null, 0, :'pr'::jsonb) as p \gset
select cotacao_enviar_aprovacao(:'c', :'p');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select cotacao_decidir(:'c', true, null, 'retirada', 'João motorista') as oc \gset
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select oc_liberar_coleta(:'oc', 'pago');
select oc_registrar_coleta(:'oc', null, null, 'Pegou na loja', 'sup/oc/x/canhoto.jpg');
select pg_temp.confere((select coletado_em is not null and coletado_por = 'João motorista' from ordens_compra where id = :'oc'), 'coleta registrada com o retirante da OC');
select pg_temp.espera_erro(format($$select oc_registrar_coleta(%L, 'x')$$, :'oc'), 'já foi registrada');
select oc_desfazer_coleta(:'oc', 'Marquei antes da hora');
select pg_temp.confere((select coletado_em is null from ordens_compra where id = :'oc'), 'coleta desfeita');
select oc_registrar_coleta(:'oc', 'Pedro', null, null, null);
select saldo_estoque(:'ins', '10000000-0000-0000-0000-000000000001') as antes \gset
select format('[%s]', string_agg(format('{"oc_item_id":"%s","quantidade":"3"}', id), ',')) as rec from oc_itens where oc_id = :'oc' \gset
select oc_receber(:'oc', :'rec'::jsonb, 'Chegou tudo');
select pg_temp.confere(saldo_estoque(:'ins', '10000000-0000-0000-0000-000000000001') = :'antes'::numeric + 3, 'comprador dá entrada e o material entra no estoque');
select pg_temp.espera_erro(format($$select oc_desfazer_coleta(%L, 'tarde demais')$$, :'oc'), 'estorne o recebimento');
\echo ''
\echo '=========== TESTES DE COLETA E ENTRADA PASSARAM ==========='
