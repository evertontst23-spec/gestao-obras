-- =====================================================================
-- TESTE: valor da transferência entre obras
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
-- TESTE: 13º salário — 1ª parcela gerada pelo módulo de Pagamentos
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into funcoes (nome, salario_base) values ('TESTE 13 Servente', 1800) returning id as f13 \gset
insert into empregadores (nome, tipo, vinculo_padrao, adiantamento_pct) values ('TESTE 13 Propria', 'propria', 'clt', 40) returning id as e13 \gset
insert into empregadores (nome, tipo, vinculo_padrao, taxa_tipo, taxa_valor, adiantamento_pct, beneficios_via_empresa) values
  ('TESTE 13 Fornecedora', 'fornecedora_mao_obra', 'terceirizado', 'percentual_folha', 20, 50, true) returning id as e14 \gset
-- admitido 10/09 → set (21 dias), out, nov = 3 avos até 30/11
insert into funcionarios (nome, funcao_id, empregador_id, data_admissao) values ('TESTE 13 Ana', :'f13', :'e13', '2026-09-10') returning id as a \gset
-- admitido 20/10 → out tem 12 dias (não conta), nov conta = 1 avo; salário 1800 + 20% = 2160
insert into funcionarios (nome, funcao_id, empregador_id, data_admissao, adicional_pct) values ('TESTE 13 Beto', :'f13', :'e13', '2026-10-20', 20) returning id as b \gset
-- terceirizado admitido 01/10 → 2 avos; vai para a empresa, com taxa de 20%
insert into funcionarios (nome, funcao_id, empregador_id, data_admissao) values ('TESTE 13 Caio', :'f13', :'e14', '2026-10-01') returning id as c \gset
-- desligado antes do pagamento: não entra
insert into funcionarios (nome, funcao_id, empregador_id, data_admissao, ativo, data_demissao, motivo_demissao)
  values ('TESTE 13 Davi', :'f13', :'e13', '2026-09-01', false, '2026-11-05', 'teste') returning id as d \gset

select pagamento_criar('2026-11-20', 'TESTE 13º 1ª parcela', 'decimo_terceiro', '2026-11-01', '2026-11-30') as pg \gset
select pg_temp.confere(pagamento_gerar(:'pg', false) > 0, 'gera as linhas do 13º');
select pg_temp.confere((select valor = 225 and destino = 'funcionario' from pagamento_itens where pagamento_id = :'pg' and funcionario_id = :'a' and categoria = 'decimo_terceiro'),
  'Ana: 1800 ÷ 12 × 3 ÷ 2 = R$ 225,00');
select pg_temp.confere((select valor = 90 from pagamento_itens where pagamento_id = :'pg' and funcionario_id = :'b' and categoria = 'decimo_terceiro'),
  'Beto: (1800 + 20%) ÷ 12 × 1 ÷ 2 = R$ 90,00 (outubro com menos de 15 dias não conta)');
select pg_temp.confere((select valor = 150 and destino = 'empresa' from pagamento_itens where pagamento_id = :'pg' and funcionario_id = :'c' and categoria = 'decimo_terceiro'),
  'Caio (terceirizado): 1800 ÷ 12 × 2 ÷ 2 = R$ 150,00 para a empresa');
select pg_temp.confere((select valor = 30 from pagamento_itens where pagamento_id = :'pg' and categoria = 'taxa' and empregador_id = :'e14'), 'taxa de 20% sobre o 13º da fornecedora');
select pg_temp.confere(not exists (select 1 from pagamento_itens where pagamento_id = :'pg' and funcionario_id = :'d'), 'desligado não recebe a 1ª parcela');
select pg_temp.confere(not exists (select 1 from pagamento_itens where pagamento_id = :'pg' and categoria in ('adiantamento','passagem','alimentacao')), 'só 13º, sem salário nem benefícios');
