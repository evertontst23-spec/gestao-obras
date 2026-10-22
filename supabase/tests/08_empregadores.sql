-- =====================================================================
-- TESTE: empresas contratantes, vínculo, adicional, benefícios por funcionário
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
set role authenticated;

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$insert into empregadores (nome) values ('TESTE Empreiteira')$$, 'row-level security');

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
insert into empregadores (nome, tipo, vinculo_padrao, taxa_tipo, taxa_valor, adiantamento_pct)
values ('TESTE Fornecedora', 'fornecedora_mao_obra', 'terceirizado', 'percentual_folha', 20, 50) returning id as emp \gset
select id as fn from funcoes limit 1 \gset
insert into funcionarios (nome, funcao_id, empregador_id, salario, adicional_pct, alimentacao_dia, passagens_dia, data_admissao, pendencias)
values ('TESTE Terceirizado Silva', :'fn', :'emp', 2000, 40, 22.82, 4, '2026-08-01', 'CPF') returning id as fu \gset
select pg_temp.confere((select vinculo = 'terceirizado' from funcionarios where id = :'fu'), 'vínculo padrão vem da empresa contratante');
select pg_temp.confere((select salario_efetivo = 2800 and empregador_nome = 'TESTE Fornecedora' and vale_alimentacao_dia = 22.82 from v_funcionarios where id = :'fu'),
  'salário com adicional de 40% e alimentação própria do funcionário');
reset role;
select 1 from _ponto_inserir(:'fu', null, (date '2026-08-03' + time '07:00') at time zone 'America/Recife', 'entrada', 'facial', 0.2, null, null, null, null);
select 1 from _ponto_inserir(:'fu', null, (date '2026-08-03' + time '16:00') at time zone 'America/Recife', 'saida', 'facial', 0.2, null, null, null, null);
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.confere((select empregador = 'TESTE Fornecedora' and salario_base = 2800 and vale_transporte = 18 and desconto_vt = 0
   from folha_previa('2026-08-01') where funcionario_id = :'fu'), 'folha: empresa, passagens (4 × R$ 4,50) e sem desconto de VT para terceirizado');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from empregadores) >= 1, 'empresas visíveis para quem usa o sistema');
reset role;
select pg_temp.espera_erro($$delete from empregadores$$, 'Exclusão não permitida');
\echo ''
\echo '=========== TESTES DE EMPRESAS CONTRATANTES PASSARAM ==========='
