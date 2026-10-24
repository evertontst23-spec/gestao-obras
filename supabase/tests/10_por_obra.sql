-- =====================================================================
-- TESTE: por obra — pagamento de uma obra só, taxa por obra, folha fechada por obra
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

-- ---------------------------------------------------------------- cadastro do cenário (RH)

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select id as fserv from funcoes where nome = 'TESTE PG Servente' \gset
select id as eid from empregadores where nome = 'TESTE PG Ideres' \gset
insert into funcionarios (nome, funcao_id, empregador_id, obra_id, data_admissao)
  values ('TESTE OB Dora', :'fserv', :'eid', '10000000-0000-0000-0000-0000000000f9', '2026-07-01') returning id as fd \gset
insert into funcionarios (nome, funcao_id, empregador_id, obra_id, data_admissao)
  values ('TESTE OB Elias', :'fserv', :'eid', '10000000-0000-0000-0000-000000000001', '2026-07-01') returning id as fe \gset

-- ---------------------------------------------------------------- pagamento só da obra F9
select pagamento_criar_obra('2026-08-20', 'Adiantamento agosto', 'adiantamento', null, null, null,
                            '10000000-0000-0000-0000-0000000000f9') as pg \gset
select pg_temp.confere((select obra_id = '10000000-0000-0000-0000-0000000000f9' and titulo like '%TESTE-F9%' from pagamentos where id = :'pg'),
  'pagamento por obra guarda a obra e leva o código no título');
select pagamento_gerar(:'pg', false) as n \gset
select pg_temp.confere((select count(*) = 0 from pagamento_itens i join funcionarios f on f.id = i.funcionario_id
                         where i.pagamento_id = :'pg' and f.obra_id is distinct from '10000000-0000-0000-0000-0000000000f9'),
  'gerador só traz funcionários da obra do pagamento');
select pg_temp.confere((select count(*) = 1 from pagamento_itens where pagamento_id = :'pg' and funcionario_id = :'fd' and valor = 810.50),
  'adiantamento da Dora (obra F9) gerado');
select pg_temp.confere((select obra_id = '10000000-0000-0000-0000-0000000000f9' and valor = 162.10 from pagamento_itens
                         where pagamento_id = :'pg' and categoria = 'taxa'),
  'taxa da empresa lançada no centro de custo da obra (20% de 810,50)');

-- ---------------------------------------------------------------- folha fechada por obra
select folha_fechar_obra('2026-08-01', '10000000-0000-0000-0000-0000000000f9') as fol \gset
select pg_temp.confere((select obra_id = '10000000-0000-0000-0000-0000000000f9' and funcionarios >= 1
                          and not exists (select 1 from jsonb_array_elements(itens) e where e->>'obra_id' <> '10000000-0000-0000-0000-0000000000f9')
                         from folhas where id = :'fol'), 'folha de 08/2026 da obra F9 fechada só com a equipe da obra');
select pg_temp.confere((select count(*) >= 1 from lancamentos where folha_id = :'fol' and obra_id = '10000000-0000-0000-0000-0000000000f9'),
  'folha da obra lança os custos no centro de custo da obra');
select pg_temp.espera_erro($$select folha_fechar_obra('2026-08-01', '10000000-0000-0000-0000-0000000000f9')$$, 'já fechada');
select pg_temp.espera_erro($$select folha_fechar('2026-08-01')$$, 'já fechada');
select pg_temp.confere(_folha_fechada('10000000-0000-0000-0000-0000000000f9', '2026-08-15')
                       and not _folha_fechada('10000000-0000-0000-0000-000000000001', '2026-08-15'),
  'folha fechada vale só para a obra fechada');
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-08-10', null, '[{"hora":"07:00","tipo":"entrada"}]', 'Teste de correção')$$, :'fd'),
  'já foi fechada');
select folha_fechar_obra('2026-08-01', '10000000-0000-0000-0000-000000000001') as fol2 \gset
select pg_temp.confere((select count(*) = 2 from folhas where competencia = '2026-08-01'), 'cada obra fecha a sua folha no mesmo mês');
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select pg_temp.espera_erro($$select folha_fechar_obra('2026-07-01', '10000000-0000-0000-0000-000000000001')$$, 'Apenas RH');
\echo ''
\echo '=========== TESTES POR OBRA PASSARAM ==========='
