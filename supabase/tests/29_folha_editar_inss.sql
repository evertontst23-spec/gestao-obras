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
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pagamento_criar('2026-11-05', 'Teste saldo', 'saldo') as pg \gset
select pagamento_item_salvar(:'pg', jsonb_build_object('funcionario_id', 'f1000000-0000-0000-0000-000000000002', 'categoria', 'salario', 'valor', 100, 'descricao', 'teste')) as it \gset
select pagamento_item_salvar(:'pg', jsonb_build_object('funcionario_id', 'f1000000-0000-0000-0000-000000000002', 'categoria', 'desconto', 'valor', -10, 'descricao', 'falta')) as dc \gset
select pagamento_item_editar(:it, 250.5, '60% proporcional');
select pg_temp.confere((select valor = 250.5 and descricao = '60% proporcional' from pagamento_itens where id = :it), 'editar valor e descrição da linha');
select pagamento_item_editar(:dc, 54.03, null);
select pg_temp.confere((select valor = -54.03 and descricao = 'falta' from pagamento_itens where id = :dc), 'desconto continua negativo e mantém a descrição');
select pg_temp.espera_erro(format($$select pagamento_item_editar(%s, -5, null)$$, :it), 'negativo');
-- sem registro: folha não estima INSS
update funcionarios set desconta_inss = false where id = 'f1000000-0000-0000-0000-000000000002';
select pg_temp.confere((select inss = 0 and desconto_vt = 0 from folha_previa('2026-11-01') where funcionario_id = 'f1000000-0000-0000-0000-000000000002'), 'não fichado: sem INSS e sem desconto de VT');
select pagamento_fechar(:'pg');
select pg_temp.espera_erro(format($$select pagamento_item_editar(%s, 1, null)$$, :it), 'já foi fechado');
\echo '=========== TESTES DE FOLHA EDITÁVEL E INSS PASSARAM ==========='
