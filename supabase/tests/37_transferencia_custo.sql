-- =====================================================================
-- TESTE: transferência de custo entre obras
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
select pg_temp.espera_erro($$select custo_transferir('10000000-0000-0000-0000-000000000001', null, 'mao_de_obra', 5000, hoje(), 'equipe emprestada')$$, 'Apenas diretoria ou financeiro');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.espera_erro($$select custo_transferir(null, null, 'mao_de_obra', 5000, hoje(), 'equipe emprestada')$$, 'iguais');
select pg_temp.espera_erro($$select custo_transferir('10000000-0000-0000-0000-000000000001', null, 'mao_de_obra', 0, hoje(), 'equipe emprestada')$$, 'valor');
select pg_temp.espera_erro($$select custo_transferir('10000000-0000-0000-0000-000000000001', null, 'mao_de_obra', 10, hoje(), 'x')$$, 'motivo');
select custo_transferir('10000000-0000-0000-0000-000000000001', null, 'mao_de_obra', 5000, hoje(), 'Equipe da obra trabalhou no escritório') as t \gset
select pg_temp.confere((select valor = 5000 and competencia = date_trunc('month', hoje())::date and destino_nome = 'Administração central' from v_transferencias_custo where id = :'t'), 'transferência registrada na competência do mês');
select pg_temp.confere(not exists (select 1 from lancamentos where descricao like '%Equipe da obra trabalhou%'), 'não vira conta a pagar');
select pg_temp.confere(exists (select 1 from notificacoes where tipo = 'transferencia_custo'), 'diretoria/financeiro avisados');
select custo_transferencia_cancelar(:'t', 'lançada em duplicidade');
select pg_temp.confere((select status = 'cancelada' from transferencias_custo where id = :'t'), 'cancelada com motivo');
select pg_temp.espera_erro(format($$delete from transferencias_custo where id = %L$$, :'t'), '');
