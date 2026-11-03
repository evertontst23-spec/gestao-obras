-- =====================================================================
-- TESTE: anexar comprovante depois da baixa
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
select lancamento_criar(jsonb_build_object('tipo','despesa','categoria','equipamentos','descricao','Locação de banheiro teste','valor','350','vencimento', current_date::text)) as l \gset
select pg_temp.espera_erro(format($$select lancamento_anexar_comprovante(%L, 'fin/comprovantes/x.pdf')$$, :'l'), 'Dê a baixa');
select lancamento_liquidar(:'l', current_date, null, 'Boleto', null);
select lancamento_anexar_comprovante(:'l', 'fin/comprovantes/x.pdf');
select pg_temp.confere((select comprovante_caminho = 'fin/comprovantes/x.pdf' and comprovante_em is not null from lancamentos where id = :'l'), 'comprovante anexado depois da baixa');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select lancamento_anexar_comprovante(%L, 'y.pdf')$$, :'l'), 'Apenas diretoria');
\echo ''
\echo '=========== TESTES DE COMPROVANTE PASSARAM ==========='
