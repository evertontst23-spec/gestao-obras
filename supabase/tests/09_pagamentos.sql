-- =====================================================================
-- TESTE: pagamentos do RH (adiantamento dia 20, saldo dia 05, rescisão, taxa, passagens, alimentação)
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
insert into funcoes (nome, salario_base) values ('TESTE PG Servente', 1621) returning id as fserv \gset
insert into empregadores (nome, tipo, vinculo_padrao, taxa_tipo, taxa_valor, adiantamento_pct) values
  ('TESTE PG Ideres', 'fornecedora_mao_obra', 'terceirizado', 'percentual_folha', 20, 50) returning id as e1 \gset
insert into empregadores (nome, tipo, vinculo_padrao, taxa_tipo, taxa_valor, adiantamento_pct) values
  ('TESTE PG Fenix', 'fornecedora_mao_obra', 'terceirizado', 'fixo_funcionario_mes', 150, 50) returning id as e2 \gset
insert into empregadores (nome, tipo, vinculo_padrao, adiantamento_pct) values ('TESTE PG Propria', 'propria', 'clt', 40) returning id as e3 \gset
insert into empregadores (nome, tipo, vinculo_padrao, fechamento_externo) values ('TESTE PG Parceira', 'parceira', 'clt_parceira', true) returning id as e4 \gset
insert into funcionarios (nome, funcao_id, empregador_id, alimentacao_dia, passagens_dia, data_admissao)
  values ('TESTE PG Ana', :'fserv', :'e1', 22.82, 4, '2026-07-01') returning id as fa \gset
insert into funcionarios (nome, funcao_id, empregador_id, data_admissao, ativo, data_demissao, motivo_demissao)
  values ('TESTE PG Bruno', :'fserv', :'e1', '2026-07-01', false, '2026-08-16', 'teste') returning id as fb \gset
insert into funcionarios (nome, funcao_id, empregador_id, salario, data_admissao)
  values ('TESTE PG Caio', :'fserv', :'e2', 1950, '2026-07-01') returning id as fc \gset
insert into funcionarios (nome, empregador_id, salario, adicional_pct, alimentacao_dia, passagem_semanal, data_admissao)
  values ('TESTE PG Davi', :'e3', 2604.55, 40, 22, 90, '2026-07-01') returning id as fd \gset
insert into funcionarios (nome, funcao_id, empregador_id, passagem_semanal, data_admissao)
  values ('TESTE PG Edu', :'fserv', :'e4', 45, '2026-07-01') returning id as fe \gset

-- ---------------------------------------------------------------- permissões
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select pagamento_criar('2026-08-20', 'x', 'adiantamento')$$, 'Apenas RH');
select pg_temp.confere((select count(*) = 0 from pagamentos), 'encarregado não vê pagamentos');

-- ---------------------------------------------------------------- adiantamento do dia 20
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pagamento_criar('2026-08-20', 'Adiantamento 20/08', 'adiantamento', '2026-08-20', '2026-08-31') as pg \gset
select pg_temp.confere(pagamento_gerar(:'pg') > 0, 'gera as linhas sugeridas');
select pg_temp.espera_erro(format('select pagamento_gerar(%L)', :'pg'), 'já tem linhas');
create temp view it as select * from pagamento_itens where not removido;
grant select on it to authenticated;
select pg_temp.confere((select valor = 810.50 and destino = 'empresa' from it where funcionario_id = :'fa' and categoria = 'adiantamento'),
  'adiantamento de 50% (R$ 810,50) vai para a empresa');
select pg_temp.confere((select valor = 144 and destino = 'funcionario' from it where funcionario_id = :'fa' and categoria = 'passagem'),
  'passagens: 8 dias úteis × 4 × R$ 4,50 = R$ 144,00 direto ao funcionário');
select pg_temp.confere((select valor = 182.56 from it where funcionario_id = :'fa' and categoria = 'alimentacao'), 'alimentação: 8 × R$ 22,82');
select pg_temp.confere((select valor = 864.53 from it where funcionario_id = :'fb' and categoria = 'rescisao')
   and not exists (select 1 from it where funcionario_id = :'fb' and categoria in ('passagem','alimentacao','adiantamento')),
  'desligado em 16/08: 16 dias × 1.621 ÷ 30 = R$ 864,53, sem adiantamento nem benefícios');
select pg_temp.confere((select valor = 335.01 from it where empregador_id = :'e1' and categoria = 'taxa'), 'taxa de 20% sobre a folha da empresa');
select pg_temp.confere((select valor = 975 from it where funcionario_id = :'fc' and categoria = 'adiantamento')
   and (select valor = 75 from it where empregador_id = :'e2' and categoria = 'taxa'), 'taxa fixa: R$ 150/mês = R$ 75 por pagamento por funcionário');
select pg_temp.confere((select valor = 1458.55 and destino = 'funcionario' from it where funcionario_id = :'fd' and categoria = 'adiantamento')
   and (select valor = 270 from it where funcionario_id = :'fd' and categoria = 'passagem')
   and (select valor = 176 from it where funcionario_id = :'fd' and categoria = 'alimentacao'),
  'equipe própria: 40% de (2.604,55 + 40%), passagem semanal (3 semanas × R$ 90) e alimentação própria');
select pg_temp.confere((select valor = 0 and categoria = 'quinzena' from it where funcionario_id = :'fe' and categoria not in ('passagem','alimentacao')),
  'fechamento pela parceira: linha em branco para informar o valor');
-- ajuste manual: informa o valor da parceira e retira a linha zerada
select pagamento_item_salvar(:'pg', jsonb_build_object('funcionario_id', :'fe', 'categoria', 'quinzena', 'valor', 962.72, 'descricao', 'Quinzena informada pela parceira'));
select pagamento_item_remover((select id from it where funcionario_id = :'fe' and categoria = 'quinzena' and valor = 0));
select pg_temp.confere((select destino = 'empresa' from it where funcionario_id = :'fe' and categoria = 'quinzena'), 'valor da parceira vai para a empresa');
select pg_temp.confere((select count(*) = 1 from pagamento_itens where funcionario_id = :'fe' and categoria = 'quinzena' and removido), 'linha retirada fica registrada (não some)');

-- ---------------------------------------------------------------- fechar e pagar
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select pg_temp.espera_erro(format('select pagamento_fechar(%L)', :'pg'), 'Apenas RH');
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pagamento_fechar(:'pg');
select pg_temp.espera_erro(format($q$select pagamento_item_salvar(%L, '{"categoria":"outro","valor":1,"destino":"empresa","descricao":"x"}')$q$, :'pg'), 'já foi fechado');
select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select pg_temp.confere((select sum(valor) from lancamentos where pagamento_id = :'pg') = (select total from v_pagamentos where id = :'pg'),
  'contas a pagar no financeiro somam o total do pagamento');
select pg_temp.confere((select count(*) = 1 from lancamentos where pagamento_id = :'pg' and favorecido = 'TESTE PG Ideres' and categoria = 'mao_de_obra'),
  'uma conta por empresa (folha + taxa)');
select pg_temp.espera_erro(format($q$select pagamento_quitar(%L, current_date + 3)$q$, :'pg'), 'não pode ser futura');
select pagamento_quitar(:'pg', '2026-08-20');
select pg_temp.confere((select bool_and(status = 'liquidado' and liquidado_em = '2026-08-20') from lancamentos where pagamento_id = :'pg')
   and (select status = 'pago' from pagamentos where id = :'pg'), 'baixa: contas liquidadas e pagamento marcado como pago');

-- ---------------------------------------------------------------- saldo do dia 05 (ponto ainda não iniciado: sem faltas)
reset role;
update dp_parametros set ponto_inicio = null;
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.confere((select faltas = 0 and bruto = 1621 from folha_previa('2026-08-01') where funcionario_id = :'fa'),
  'sem data de início do ponto, a folha não desconta faltas');
select pagamento_criar('2026-09-05', 'Saldo de agosto', 'saldo') as pg2 \gset
select pagamento_gerar(:'pg2', false);
select pg_temp.confere((select valor = 810.50 from pagamento_itens where pagamento_id = :'pg2' and funcionario_id = :'fa' and categoria = 'saldo'),
  'saldo = salário do mês − adiantamento já pago');
select pg_temp.confere(not exists (select 1 from pagamento_itens where pagamento_id = :'pg2' and funcionario_id = :'fb'),
  'desligado já acertado não entra de novo');
select pg_temp.confere(not exists (select 1 from folha_previa('2026-08-01') where funcionario_id = :'fb')
   and exists (select 1 from folha_previa('2026-08-01') where funcionario_id = :'fa'),
  'desligado já acertado sai da folha; quem está ativo continua');
select pagamento_cancelar(:'pg2', 'teste de cancelamento');
reset role;
update dp_parametros set ponto_inicio = '2000-01-01';
select pg_temp.espera_erro($$delete from pagamento_itens$$, 'Exclusão não permitida');
\echo ''
\echo '=========== TESTES DE PAGAMENTOS PASSARAM ==========='
