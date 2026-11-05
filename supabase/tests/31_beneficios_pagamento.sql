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
select beneficio_competencia_criar('2027-03-01', 20, null) as comp \gset
select beneficio_linha_salvar(jsonb_build_object('competencia_id', :'comp', 'funcionario_id', 'f1000000-0000-0000-0000-000000000002', 'tipo', 'alimentacao', 'dias', 20, 'valor_unitario', 22)) as l \gset
select pg_temp.espera_erro(format($$select beneficio_marcar_pago(array[%s]::bigint[], true, 'x')$$, :l), 'empresa ou para o funcionário');
select pg_temp.confere(beneficio_marcar_pago(array[:l]::bigint[], true, 'empresa') = 1, 'marca o Pix como enviado à empresa');
select pg_temp.confere((select pago_em is not null and pago_para = 'empresa' from beneficio_linhas where id = :l), 'guarda quando e para quem');
select pg_temp.confere(beneficio_marcar_pago(array[:l]::bigint[], true, 'empresa') = 0, 'não marca duas vezes');
select pg_temp.confere(beneficio_marcar_pago(array[:l]::bigint[], false) = 1, 'desfazer o pagamento');
select pg_temp.confere((select pago_em is null and pago_para is null from beneficio_linhas where id = :l), 'desfeito volta a pendente');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select beneficio_marcar_pago(array[%s]::bigint[], true, 'empresa')$$, :l), 'Apenas diretoria');
\echo '=========== TESTES DE PAGAMENTO DOS BENEFÍCIOS PASSARAM ==========='
