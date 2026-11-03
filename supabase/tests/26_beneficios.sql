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
select beneficio_competencia_criar('2026-11-15', 19) as comp \gset
select pg_temp.espera_erro($$select beneficio_competencia_criar('2026-11-01', 19)$$, 'já existe');
select beneficio_linha_salvar(jsonb_build_object('competencia_id', :'comp', 'funcionario_id', 'f1000000-0000-0000-0000-000000000002',
  'tipo', 'passagem', 'dias', 19, 'dias_desconto', 1, 'qtd_dia', 4, 'valor_unitario', 4.5)) as l1 \gset
select pg_temp.confere((select valor_total = 324 from beneficio_linhas where id = :l1), 'passagem: (19 − 1) × 4 × 4,50 = 324');
select beneficio_linha_salvar(jsonb_build_object('competencia_id', :'comp', 'funcionario_id', 'f1000000-0000-0000-0000-000000000002',
  'tipo', 'alimentacao', 'dias', 19, 'dias_retroativos', 3, 'valor_unitario', 22.8)) as l2 \gset
select pg_temp.confere((select valor_total = 501.6 from beneficio_linhas where id = :l2), 'alimentação com retroativo: 22 × 22,80 = 501,60');
-- diretor edita os dias: mesma linha é atualizada
select beneficio_linha_salvar(jsonb_build_object('competencia_id', :'comp', 'funcionario_id', 'f1000000-0000-0000-0000-000000000002',
  'tipo', 'alimentacao', 'dias', 18, 'dias_retroativos', 3, 'valor_unitario', 22.8));
select pg_temp.confere((select count(*) = 1 and sum(valor_total) = 478.8 from beneficio_linhas where competencia_id = :'comp' and tipo = 'alimentacao'), 'editar dias atualiza a linha e o total');
select beneficio_competencia_situacao(:'comp', true);
select pg_temp.espera_erro(format($$select beneficio_linha_remover(%s)$$, :l1), 'fechados');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro(format($$select beneficio_competencia_situacao(%L, false)$$, :'comp'), 'Apenas a diretoria');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select beneficio_competencia_situacao(:'comp', false);
select beneficio_linha_remover(:l1);
select pg_temp.confere((select count(*) = 1 from beneficio_linhas where competencia_id = :'comp'), 'linha removida depois de reabrir');
-- dias para todos e crédito
select beneficio_aplicar_dias(:'comp', null, 'alimentacao', 20) as n \gset
select pg_temp.confere(:n = 1 and (select dias = 20 and valor_total = 22 * 0 + (20 + 3) * 22.8 from beneficio_linhas where competencia_id = :'comp' and tipo = 'alimentacao'), 'aplicar dias para todos muda os dias e recalcula');
select beneficio_linha_salvar(jsonb_build_object('competencia_id', :'comp', 'funcionario_id', 'f1000000-0000-0000-0000-000000000002',
  'tipo', 'alimentacao', 'dias', 20, 'dias_retroativos', 2, 'adicional_tipo', 'credito', 'valor_unitario', 22.8));
select pg_temp.confere((select adicional_tipo = 'credito' from beneficio_linhas where competencia_id = :'comp' and tipo = 'alimentacao'), 'dias a mais marcados como crédito');
\echo ''
\echo '=========== TESTES DE BENEFÍCIOS PASSARAM ==========='
