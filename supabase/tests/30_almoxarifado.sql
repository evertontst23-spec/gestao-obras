-- =====================================================================
-- TESTE: benefícios do mês por obra
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

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');  -- almoxarifado
select estoque_lancar(null, 'e1000000-0000-0000-0000-000000000002', 'entrada', 50, 'Teste almox') ;
select saldo_estoque('e1000000-0000-0000-0000-000000000002', null) as s0 \gset
select almox_retirada(null, 'e1000000-0000-0000-0000-000000000002', 10, 'f1000000-0000-0000-0000-000000000002', 'Laje bloco B', null) as r1 \gset
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000002', null) = :s0 - 10, 'retirada baixa o estoque');
select pg_temp.confere((select funcionario_id = 'f1000000-0000-0000-0000-000000000002' and destino = 'Laje bloco B' from estoque_movimentos where id = :r1), 'retirada guarda quem retirou e o destino');
select pg_temp.espera_erro($$select almox_retirada(null, 'e1000000-0000-0000-0000-000000000002', 99999, 'f1000000-0000-0000-0000-000000000002')$$, 'Saldo insuficiente');
select almox_devolucao(null, 'e1000000-0000-0000-0000-000000000002', 3, 'f1000000-0000-0000-0000-000000000002', 'sobrou');
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000002', null) = :s0 - 7, 'devolução de sobra volta ao estoque');
-- ferramenta emprestada
select cautela_emprestar(null, 'f1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 2, null, 'teste') as c1 \gset
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000002', null) = :s0 - 9, 'emprestar tira do estoque');
select pg_temp.espera_erro(format($$select cautela_devolver(%s, 1, 'x', null)$$, :c1), 'danificado ou foi perdido');
select pg_temp.espera_erro(format($$select cautela_devolver(%s, 1, 'perdida', null)$$, :c1), 'Descreva');
select cautela_devolver(:c1, 1, 'perdida', 'caiu no rio');
select pg_temp.confere((select situacao = 'perdida' and quantidade_devolvida = 1 from cautelas where id = :c1), 'devolução parcial: 1 perdida');
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000002', null) = :s0 - 8, 'só a parte boa volta ao estoque');
select pg_temp.espera_erro(format($$select cautela_devolver(%s, 1, 'perdida', 'x')$$, :c1), 'já foi devolvida');
-- inventário
select almox_inventario(null, jsonb_build_array(jsonb_build_object('insumo_id', 'e1000000-0000-0000-0000-000000000002', 'contado', 40)), 'contagem') as n \gset
select pg_temp.confere(:n = 1 and saldo_estoque('e1000000-0000-0000-0000-000000000002', null) = 40, 'inventário ajusta para o contado');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select almox_inventario(null, '[]'::jsonb)$$, 'Apenas o almoxarifado');
\echo '=========== TESTES DE ALMOXARIFADO PASSARAM ==========='
