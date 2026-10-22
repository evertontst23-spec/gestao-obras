-- =====================================================================
-- TESTE: Financeiro e Obra — contrato, contas a pagar/receber, integração
--        com OC e folha, boletim de medição com retenções, diário de obra
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

\set obra '\'10000000-0000-0000-0000-000000000001\''
\set adm  '\'00000000-0000-0000-0000-00000000000a\''
\set eng  '\'00000000-0000-0000-0000-00000000000e\''
\set enc  '\'00000000-0000-0000-0000-00000000000c\''
\set fin  '\'00000000-0000-0000-0000-0000000000f3\''
set role authenticated;

-- ------------------------------------------------------------ datas legais
reset role;
select pg_temp.confere(_quinto_dia_util('2026-09-01') = '2026-10-06', 'salário de 09/2026 vence no 5º dia útil (06/10, sábado conta)');
select pg_temp.confere(_dia20('2026-09-01') = '2026-10-20', 'FGTS/INSS de 09/2026 vencem dia 20/10');
select pg_temp.confere(_dia20('2026-05-01') = '2026-06-19', 'guia antecipada quando o dia 20 cai no fim de semana (20/06/2026 é sábado)');
set role authenticated;

-- ------------------------------------------------------------ acesso
select pg_temp.como(:enc);
select pg_temp.confere((select count(*) from lancamentos) = 0, 'encarregado não vê o financeiro');
select pg_temp.espera_erro($$select lancamento_criar('{"tipo":"despesa","categoria":"material","descricao":"x","valor":10,"vencimento":"2026-10-30"}')$$, 'Apenas diretoria ou financeiro');

-- ------------------------------------------------------------ integrações já ocorridas nos testes anteriores
select pg_temp.como(:fin);
select pg_temp.confere((select status = 'liquidado' and valor = 4000 from lancamentos where origem = 'oc'),
  'OC gerou conta a pagar com o valor da NF e baixada quando compras registrou o pagamento');
select pg_temp.confere((select vencimento = '2026-10-06' from lancamentos where origem = 'folha' and categoria = 'mao_de_obra'),
  'folha fechada gerou salários a pagar no 5º dia útil');
select pg_temp.confere((select count(*) from lancamentos where origem = 'folha' and categoria = 'encargos') = 2, 'folha gerou INSS e FGTS a recolher');

-- ------------------------------------------------------------ contrato
select pg_temp.como(:eng);
select pg_temp.espera_erro(format($$select obra_contrato_salvar(%L, '{"valor_contrato":"1"}')$$, :obra), 'Apenas diretoria ou financeiro');
select pg_temp.confere((select count(*) from lancamentos where obra_id = :obra) > 0, 'engenheiro da obra consulta o financeiro da sua obra');
select pg_temp.como(:fin);
select obra_contrato_salvar(:obra, '{"valor_contrato":"250000","orcamento_custo":"190000","impostos_faturamento_pct":"6","iss_pct":"5","inss_ret_pct":"11","base_mao_obra_pct":"50","retencao_tecnica_pct":"5","prazo_recebimento_dias":"30"}');
select pg_temp.confere((select valor_contrato = 250000 and impostos_faturamento_pct = 6 and contrato_conferido_em is not null from obras where id = :obra), 'contrato da obra salvo pelo financeiro');

-- ------------------------------------------------------------ boletim de medição
select pg_temp.como(:enc);
select pg_temp.espera_erro(format($$select bm_gerar(%L, hoje() - 30, hoje())$$, :obra), 'Sem permissão');
select pg_temp.como(:eng);
select pg_temp.espera_erro(format($$select bm_gerar(%L, hoje() - 30, hoje() + 1)$$, :obra), 'futuro');
select bm_gerar(:obra, hoje() - 30, hoje(), 'Medição mensal') as bm \gset
select pg_temp.confere((select valor_bruto = 19700 from boletins_medicao where id = :'bm'), 'BM soma a execução validada × preço da planilha (R$ 19.700,00)');
select pg_temp.confere((select iss_valor = 985 and inss_valor = 1083.50 and retencao_tecnica_valor = 985 and valor_liquido = 16646.50 from boletins_medicao where id = :'bm'),
  'retenções: ISS 5%, INSS 11% sobre 50% de mão de obra, retenção técnica 5% → líquido R$ 16.646,50');
select pg_temp.confere((select count(*) from medicoes where bm_id = :'bm') = 3, 'execuções ficam vinculadas ao BM');
select pg_temp.confere((select b.quantidade = 320 and b.quantidade_contratada = 320 from bm_itens b join planilha_itens i on i.id = b.planilha_item_id where bm_id = :'bm' and i.descricao like 'Alvenaria%'),
  'itens do BM agrupados por item da planilha');
select pg_temp.espera_erro(format($$select bm_gerar(%L, hoje() - 30, hoje())$$, :obra), 'ainda não medida');
select pg_temp.confere((select codigo from obras where id = :obra) = 'TESTE-001', 'engenheiro continua vendo a obra');
select pg_temp.espera_erro(format($$select bm_aprovar(%L, hoje(), 'NF 1')$$, :'bm'), 'Apenas diretoria ou financeiro');

select pg_temp.como(:fin);
select pg_temp.confere((select count(*) from notificacoes where tipo = 'bm_aprovar' and usuario_id = :fin) >= 1, 'financeiro avisado do BM a aprovar');
select pg_temp.espera_erro(format($$select bm_aprovar(%L, hoje() + 1, 'NF 1')$$, :'bm'), 'inválida');
select bm_aprovar(:'bm', hoje(), 'NFS-e 1520');
select pg_temp.confere((select valor = 16646.50 and vencimento = hoje() + 30 and status = 'aberto' from lancamentos where bm_id = :'bm' and categoria = 'medicao'),
  'BM aprovado gera conta a receber do líquido em 30 dias');
select pg_temp.confere((select valor = 985 and vencimento = '2027-05-19' from lancamentos where bm_id = :'bm' and categoria = 'retencao_tecnica'),
  'retenção técnica a receber após a conclusão da obra');
select pg_temp.confere((select valor = 1182 and categoria = 'impostos' from lancamentos where bm_id = :'bm' and tipo = 'despesa'),
  'impostos sobre faturamento (6%) lançados a pagar');
select pg_temp.espera_erro(format($$select bm_cancelar(%L, 'Erro de medição')$$, :'bm'), 'diretoria');
select pg_temp.espera_erro(format($$select lancamento_cancelar(id, 'teste de cancelamento') from lancamentos where bm_id = %L and categoria = 'medicao'$$, :'bm'), 'cancele o BM');

-- recebimento
select pg_temp.espera_erro(format($$select lancamento_liquidar(id, hoje() + 1, null, 'PIX', null) from lancamentos where bm_id = %L and categoria = 'medicao'$$, :'bm'), 'não pode ser futura');
select lancamento_liquidar(id, hoje(), null, 'TED', 'fin/comprovante.pdf') from lancamentos where bm_id = :'bm' and categoria = 'medicao';
select pg_temp.confere((select status = 'liquidado' and valor_liquidado = 16646.50 from lancamentos where bm_id = :'bm' and categoria = 'medicao'), 'recebimento registrado');
select pg_temp.espera_erro(format($$select lancamento_liquidar(id, hoje(), null, null, null) from lancamentos where bm_id = %L and categoria = 'medicao'$$, :'bm'), 'já baixado');

select pg_temp.como(:adm);
select pg_temp.espera_erro(format($$select bm_cancelar(%L, 'Erro de medição')$$, :'bm'), 'estorne');

-- ------------------------------------------------------------ lançamentos manuais
select pg_temp.como(:fin);
select lancamento_criar(jsonb_build_object('tipo','despesa','categoria','equipamentos','descricao','Aluguel de betoneira','obra_id',:obra,
  'valor','800','vencimento', hoje() - 2)) as l1 \gset
select pg_temp.espera_erro($$select lancamento_criar('{"tipo":"receita","categoria":"material","descricao":"errado","valor":10,"vencimento":"2026-10-30"}')$$, 'lanc_tipo_cat_ck');
select pg_temp.espera_erro($$select lancamento_criar('{"tipo":"despesa","categoria":"material","descricao":"zero","valor":0,"vencimento":"2026-10-30"}')$$, 'maior que zero');
select pg_temp.espera_erro(format($$select lancamento_reprogramar(%L, hoje() + 5, 'x')$$, :'l1'), 'motivo');
select lancamento_reprogramar(:'l1', hoje() + 5, 'Negociado com a locadora');
select pg_temp.confere((select vencimento = hoje() + 5 from lancamentos where id = :'l1'), 'vencimento reprogramado com motivo');
select lancamento_criar(jsonb_build_object('tipo','despesa','categoria','administrativo','descricao','Contador — honorários','valor','1200',
  'vencimento', hoje() - 1, 'liquidado', true, 'forma_pagamento', 'PIX')) as l2 \gset
select pg_temp.confere((select status = 'liquidado' and obra_id is null from lancamentos where id = :'l2'), 'despesa da administração lançada já paga');
select pg_temp.espera_erro(format($$select lancamento_cancelar(id, 'teste de cancelamento') from lancamentos where origem = 'folha' limit 1$$), 'diretoria');
select pg_temp.espera_erro(format($$select lancamento_cancelar(id, 'teste de cancelamento') from lancamentos where origem = 'oc' limit 1$$), 'aberto');
select lancamento_cancelar(:'l1', 'Locação desistida');
select pg_temp.confere((select status = 'cancelado' from lancamentos where id = :'l1'), 'lançamento manual cancelado com motivo');

-- alertas de contas vencidas
reset role;
select _lanc_inserir(:obra, 'despesa', 'servicos_terceiros', 'Empreiteiro de reboco', 3000, hoje(), hoje() - 3, 'manual') is not null;
set role authenticated;
select pg_temp.como(:adm);
select gerar_alertas() >= 0;
select pg_temp.como(:fin);
select pg_temp.confere((select count(*) from notificacoes where tipo = 'conta_vencida' and usuario_id = :fin) = 1, 'financeiro alertado de conta vencida');

-- resumo por obra
select pg_temp.como(:eng);
select pg_temp.confere((select medido_aprovado = 19700 and recebido = 16646.50 and valor_contrato = 250000 from v_financeiro_obras where id = :obra),
  'resumo financeiro da obra (medido, recebido, contrato)');
select pg_temp.como(:enc);
select pg_temp.confere((select medido_aprovado = 0 and recebido = 0 from v_financeiro_obras where id = :obra), 'encarregado não vê valores da obra');
select pg_temp.confere((select count(*) from boletins_medicao) = 0, 'encarregado não vê boletins de medição');

-- ------------------------------------------------------------ diário de obra com fotos
select diario_registrar(:obra, hoje(), '{"clima":"ensolarado","equipe_presente":"8","servicos_executados":"Alvenaria do 2º pavimento"}') as rdo \gset
insert into anexos (obra_id, diario_id, caminho, nome, tipo_mime, categoria, enviado_por)
values (:obra, :'rdo', :obra || '/diario/foto1.jpg', 'foto1.jpg', 'image/jpeg', 'execucao', :enc);
select pg_temp.confere((select count(*) from anexos where diario_id = :'rdo') = 1, 'foto anexada ao diário de obra');
reset role;
insert into obras (id, codigo, nome, situacao) values ('10000000-0000-0000-0000-0000000000f9', 'TESTE-F9', 'Outra obra', 'planejamento');
select pg_temp.espera_erro(format($$insert into anexos (obra_id, diario_id, caminho, nome, enviado_por) values ('10000000-0000-0000-0000-0000000000f9', %L, '10000000-0000-0000-0000-0000000000f9/y.jpg', 'y.jpg', %L)$$, :'rdo', :enc),
  'diário não pertence');
select pg_temp.espera_erro($$delete from lancamentos$$, 'Exclusão não permitida');
select pg_temp.espera_erro($$delete from boletins_medicao$$, 'Exclusão não permitida');
\echo ''
\echo '=========== TESTES DE FINANCEIRO PASSARAM ==========='
