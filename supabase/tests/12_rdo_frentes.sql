-- =====================================================================
-- TESTE: RDO por frentes de serviço e responsável da tarefa
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

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select diario_registrar('10000000-0000-0000-0000-000000000001', hoje() - 40, $j${"clima":"ensolarado","frentes":[
  {"servico":"Alvenaria bloco A","local":"Térreo","equipe":[{"funcionario_id":"f1000000-0000-0000-0000-000000000001","nome":"José","funcao":"Pedreiro"},{"nome":"Ajudante diarista","funcao":"Servente"}]},
  {"servico":"Reboco","equipe":[{"funcionario_id":"f1000000-0000-0000-0000-000000000001","nome":"José","funcao":"Pedreiro"},{"nome":"Carlos","funcao":"Pedreiro"}]}]}$j$::jsonb) as rdo \gset
select pg_temp.confere((select equipe_presente = 3 and equipe_descricao = '2 Pedreiro, 1 Servente' and jsonb_array_length(frentes) = 2
                          and servicos_executados like '%Alvenaria bloco A (Térreo)%' from diario_obra where id = :'rdo'),
  'frentes de serviço: conta cada pessoa uma vez e monta a composição e o resumo');
select pg_temp.espera_erro($$select diario_registrar('10000000-0000-0000-0000-000000000001', hoje() - 41, '{"frentes":[{"servico":"","equipe":[]}]}'::jsonb)$$, 'serviço de cada frente');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
insert into tarefas (obra_id, titulo, encarregado_id, inicio_previsto, fim_previsto)
  values ('10000000-0000-0000-0000-000000000001', 'TESTE tarefa do engenheiro', '00000000-0000-0000-0000-00000000000e', current_date, current_date + 2) returning id as te \gset
select pg_temp.confere(:'te' is not null, 'engenheiro pode ser o responsável da tarefa');
\echo ''
\echo '=========== TESTES DE RDO POR FRENTES PASSARAM ==========='
