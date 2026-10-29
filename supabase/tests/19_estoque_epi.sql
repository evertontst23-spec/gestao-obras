-- =====================================================================
-- TESTE: estoque de EPI na SST
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

select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select id as epi from insumos where codigo = 'TESTE-EPI-A' \gset
select id as mat from insumos where categoria <> 'EPI' limit 1 \gset
select epi_estoque_lancar('10000000-0000-0000-0000-000000000001', :'epi', 'entrada', 20, 'NF 123');
select pg_temp.confere(saldo_estoque(:'epi', '10000000-0000-0000-0000-000000000001') = 20, 'SST lança entrada de nota no estoque de EPI da obra');
select epi_estoque_lancar('10000000-0000-0000-0000-000000000001', :'epi', 'transferencia', 5, 'Para o depósito', null);
select pg_temp.confere(saldo_estoque(:'epi', '10000000-0000-0000-0000-000000000001') = 15 and saldo_estoque(:'epi', null) >= 5, 'transferência entre locais');
select pg_temp.espera_erro(format($$select epi_estoque_lancar(null, %L, 'entrada', 1, 'teste')$$, :'mat'), 'não é um EPI');
select epi_definir_minimo(:'epi', 8);
select pg_temp.confere((select estoque_minimo = 8 from insumos where id = :'epi'), 'SST define o estoque mínimo do EPI');
select pg_temp.confere((select count(*) > 0 from v_estoque where insumo_id = :'epi'), 'SST enxerga o saldo de EPI');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select epi_definir_minimo(%L, 1)$$, :'epi'), 'Sem permissão');
\echo ''
\echo '=========== TESTES DE ESTOQUE DE EPI PASSARAM ==========='
