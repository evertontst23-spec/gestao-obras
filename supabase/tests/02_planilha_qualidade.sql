-- =====================================================================
-- TESTE: planilha orçamentária, avanço físico-financeiro, fotos e não conformidades
-- Continua o banco do teste 01 (usuários e obra TESTE-001).
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

\set obra '\'10000000-0000-0000-0000-000000000001\''
\set itens '\'[{"codigo":"1","descricao":"SERVIÇOS PRELIMINARES","tipo":"grupo","nivel":1,"pai":null},{"codigo":"1.1","codigo_referencia":"99059","fonte":"SINAPI","descricao":"Locação de obra","unidade":"m²","quantidade":100,"preco_unitario":10,"tipo":"servico","nivel":2,"pai":0},{"codigo":"2","descricao":"Alvenaria","tipo":"grupo","nivel":1,"pai":null},{"codigo":"2.1","descricao":"Alvenaria de vedação bloco 9x19x19","unidade":"m²","quantidade":320,"preco_unitario":60,"tipo":"servico","nivel":2,"pai":2},{"codigo":"2.2","descricao":"Chapisco","unidade":"m²","quantidade":640,"preco_unitario":5,"valor_total":3200,"tipo":"servico","nivel":2,"pai":2}]\''

-- ---------------------------------------------------------------- IMPORTAÇÃO
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select planilha_importar(%L,'x.xlsx',null,null,null,%L::jsonb)$$, :obra, :itens), 'Apenas o engenheiro');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select planilha_importar(:obra, 'Orcamento_TESTE.xlsx', null, 'Orçamento', '{"descricao":"C"}', :itens::jsonb, true) as pl \gset
select pg_temp.confere((select valor_total from planilhas where id = :'pl') = 23400, 'valor total da planilha = R$ 23.400 (PU × quantidade calculado)');
select pg_temp.confere((select count(*) from planilha_itens where planilha_id = :'pl' and tipo = 'servico') = 3, '3 serviços e 2 grupos reconhecidos');
select pg_temp.confere((select count(*) from etapas where obra_id = :obra and lower(nome) = 'alvenaria') = 1, 'grupo "Alvenaria" reaproveitou a etapa existente');
select pg_temp.confere((select count(*) from etapas where obra_id = :obra and nome = 'SERVIÇOS PRELIMINARES') = 1, 'grupo novo virou etapa');
select pg_temp.confere((select raiz_id is not null and etapa_id is not null from planilha_itens where planilha_id = :'pl' and codigo = '2.1'), 'serviço ligado ao grupo raiz e à etapa');
select pg_temp.confere((select avanco_fisico from v_obras where id = :obra) = 0, 'com planilha, avanço passa a ser físico-financeiro (0%)');

select id as loc  from planilha_itens where planilha_id = :'pl' and codigo = '1.1' \gset
select id as alv  from planilha_itens where planilha_id = :'pl' and codigo = '2.1' \gset

-- ---------------------------------------------------------------- LANÇAMENTO MANUAL
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select medicao_lancar(:'loc', 50, current_date, 'Gabarito montado', 'Terreno') as med1 \gset
select pg_temp.confere((select status from medicoes where id = :'med1') = 'lancada', 'lançamento do encarregado aguarda validação');
select pg_temp.espera_erro(format($$select medicao_lancar(%L, 60, current_date)$$, :'loc'), 'excede o saldo');
select pg_temp.espera_erro(format($$select medicao_lancar(%L, 1, current_date + 1)$$, :'loc'), 'futura');
select pg_temp.espera_erro(format($$select medicao_validar(%L, true)$$, :'med1'), 'Apenas o engenheiro');
-- foto da execução vinculada ao lançamento
insert into anexos (obra_id, medicao_id, caminho, nome, tipo_mime, categoria, enviado_por)
values (:obra, :'med1', :obra || '/med/locacao.jpg', 'locacao.jpg', 'image/jpeg', 'execucao', auth.uid());
select pg_temp.confere((select fotos from v_medicoes where id = :'med1') = 1, 'foto de execução ligada ao lançamento');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.confere((select count(*) from notificacoes where tipo = 'medicao_validar') >= 1, 'engenheira avisada do lançamento');
select medicao_validar(:'med1', true, null);
select pg_temp.confere((select avanco_fisico from v_obras where id = :obra) = 2.1, 'avanço ponderado por valor: 500/23.400 = 2,1%');
select pg_temp.confere((select percentual from v_planilha_itens where id = :'loc') = 50, 'item Locação com 50% executado');

-- ---------------------------------------------------------------- TAREFA LIGADA AO ITEM
insert into tarefas (id, obra_id, planilha_item_id, titulo, encarregado_id, inicio_previsto, fim_previsto)
values ('30000000-0000-0000-0000-000000000099', :obra, :'alv', 'Alvenaria bloco A (planilha 2.1)', '00000000-0000-0000-0000-00000000000c', current_date, current_date + 10);
select pg_temp.confere((select quantidade_prevista = 320 and unidade = 'm²' from tarefas where id = '30000000-0000-0000-0000-000000000099'), 'tarefa herda quantidade e unidade do item');
select pg_temp.espera_erro(format($$insert into tarefas (obra_id, planilha_item_id, titulo, encarregado_id, inicio_previsto, fim_previsto)
  select %L, id, 'grupo', '00000000-0000-0000-0000-00000000000c', current_date, current_date from planilha_itens where planilha_id = %L and codigo = '2'$$, :obra, :'pl'), 'serviço desta obra');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select tarefa_iniciar('30000000-0000-0000-0000-000000000099');
select tarefa_atualizar_andamento('30000000-0000-0000-0000-000000000099', null, 160, 'Metade');
select pg_temp.confere((select sum(quantidade) from medicoes where tarefa_id = '30000000-0000-0000-0000-000000000099') = 160, 'andamento da tarefa gerou lançamento de 160 m² no item');

-- ---------------------------------------------------------------- NÃO CONFORMIDADE
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select nc_abrir(:obra, '30000000-0000-0000-0000-000000000099', null, null, 'Fiadas fora de prumo no eixo 3', 'grave', null, current_date + 2) as nc \gset
select pg_temp.confere((select responsavel_id = '00000000-0000-0000-0000-00000000000c' and planilha_item_id = :'alv' from nao_conformidades where id = :'nc'),
  'NC herda responsável e item da tarefa');
insert into anexos (obra_id, nao_conformidade_id, caminho, nome, tipo_mime, categoria, enviado_por)
values (:obra, :'nc', :obra || '/nc/antes.jpg', 'antes.jpg', 'image/jpeg', 'nao_conformidade', auth.uid());

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from notificacoes where tipo = 'nc_aberta') = 1, 'encarregado notificado da NC');
select tarefa_concluir('30000000-0000-0000-0000-000000000099', 'Concluída');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.espera_erro($$select tarefa_validar('30000000-0000-0000-0000-000000000099', true)$$, 'não conformidades abertas');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select nc_iniciar_correcao(:'nc');
select pg_temp.espera_erro(format($$select nc_registrar_correcao(%L, 'Fiadas refeitas')$$, :'nc'), 'foto da correção');
insert into anexos (obra_id, nao_conformidade_id, caminho, nome, tipo_mime, categoria, enviado_por)
values (:obra, :'nc', :obra || '/nc/depois.jpg', 'depois.jpg', 'image/jpeg', 'correcao', auth.uid());
select nc_registrar_correcao(:'nc', 'Fiadas demolidas e refeitas no prumo');
select pg_temp.espera_erro(format($$select nc_verificar(%L, true)$$, :'nc'), 'Apenas o engenheiro');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select nc_verificar(:'nc', false, 'Ainda há desvio de 1 cm');
select pg_temp.confere((select status = 'aberta' and reaberturas = 1 from nao_conformidades where id = :'nc'), 'NC reaberta na verificação');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select nc_registrar_correcao(%L, 'Ajustado')$$, :'nc'), 'foto da correção');
insert into anexos (obra_id, nao_conformidade_id, caminho, nome, tipo_mime, categoria, enviado_por)
values (:obra, :'nc', :obra || '/nc/depois2.jpg', 'depois2.jpg', 'image/jpeg', 'correcao', auth.uid());
select nc_registrar_correcao(:'nc', 'Ajuste final conferido com prumo a laser');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select nc_verificar(:'nc', true, null);
select pg_temp.confere((select count(*) from nc_eventos where nc_id = :'nc') >= 6, 'histórico completo da NC');

select tarefa_validar('30000000-0000-0000-0000-000000000099', true, 'OK após correção');
select pg_temp.confere((select bool_and(status = 'validada') and sum(quantidade) = 320 from medicoes where tarefa_id = '30000000-0000-0000-0000-000000000099'),
  'aprovação da tarefa validou os lançamentos (320 m²)');
select pg_temp.confere((select avanco_fisico from v_obras where id = :obra) = 84.2, 'avanço físico-financeiro = (500 + 19.200) / 23.400 = 84,2%');
select pg_temp.confere(valor_executado_obra(:obra) = 19700, 'valor executado = R$ 19.700');

-- ---------------------------------------------------------------- PROTEÇÕES
select pg_temp.espera_erro(format($$select planilha_importar(%L,'nova.xlsx',null,null,null,%L::jsonb)$$, :obra, :itens), 'aditivo');
delete from medicoes;  -- sem política de exclusão
select pg_temp.confere((select count(*) from medicoes) = 3, 'lançamentos não podem ser apagados');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere(gerar_alertas() >= 0, 'rotina de alertas (prazos + qualidade) executa');

reset role;
\echo ''
\echo '=========== TESTES DE PLANILHA, AVANÇO E QUALIDADE PASSARAM ==========='
