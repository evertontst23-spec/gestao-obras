-- =====================================================================
-- TESTE AUTOMATIZADO DO CICLO COMPLETO + REGRAS DE NEGÓCIO
-- Dados de demonstração usados SOMENTE neste teste (prefixo TESTE-).
-- Executar em banco de teste:  psql -d obras_teste -f 01_fluxo_completo.sql
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on

-- Usuários de teste (como superusuário, equivalente ao painel do Supabase)
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','diretoria@teste.local','{"nome":"TESTE Diretoria"}','{"papel":"admin"}'),
 ('00000000-0000-0000-0000-00000000000e','eng@teste.local','{"nome":"TESTE Engenheira Ana"}','{"papel":"engenheiro"}'),
 ('00000000-0000-0000-0000-0000000000e2','eng2@teste.local','{"nome":"TESTE Engenheiro Beto"}','{"papel":"engenheiro"}'),
 ('00000000-0000-0000-0000-00000000000c','joao@teste.local','{"nome":"TESTE Encarregado João"}','{"papel":"encarregado"}'),
 ('00000000-0000-0000-0000-0000000000c2','pedro@teste.local','{"nome":"TESTE Encarregado Pedro"}','{"papel":"encarregado"}'),
 ('00000000-0000-0000-0000-00000000000b','compras@teste.local','{"nome":"TESTE Compras"}','{"papel":"compras"}'),
 ('00000000-0000-0000-0000-00000000000d','almox@teste.local','{"nome":"TESTE Almoxarifado"}','{"papel":"almoxarifado"}');

create or replace function pg_temp.como(u text) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u, false) $$;

-- Espera erro contendo um trecho da mensagem
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

-- ---------------------------------------------------------------- PERFIS
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$update perfis set papel='admin' where id=auth.uid()$$, 'Apenas o administrador');
select pg_temp.espera_erro($$insert into obras(codigo,nome) values('X','X')$$, 'row-level security');

-- ---------------------------------------------------------------- OBRA (engenheira)
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
insert into obras (id, codigo, nome, endereco, cliente, encarregado_id, data_inicio, data_prevista_conclusao, situacao)
values ('10000000-0000-0000-0000-000000000001','TESTE-001','TESTE Residencial Exemplo','Rua Teste, 1','Cliente Teste',
        '00000000-0000-0000-0000-00000000000c', current_date, current_date + 180, 'em_andamento');
select pg_temp.confere((select engenheiro_id from obras where codigo='TESTE-001') = '00000000-0000-0000-0000-00000000000e',
                       'engenheira que cria a obra vira responsável');
select pg_temp.confere((select count(*) from obra_membros where obra_id='10000000-0000-0000-0000-000000000001') = 2,
                       'responsáveis entram na equipe automaticamente');
insert into etapas (id, obra_id, nome, ordem) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Alvenaria',3);

-- outra engenheira não gere esta obra
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select pg_temp.confere((select count(*) from obras) = 0, 'engenheiro de outra obra não vê esta obra (isolamento)');

-- ---------------------------------------------------------------- TAREFA
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.espera_erro($$insert into tarefas(obra_id,titulo,encarregado_id,inicio_previsto,fim_previsto)
  values('10000000-0000-0000-0000-000000000001','Teste','00000000-0000-0000-0000-00000000000b',current_date,current_date+1)$$,
  'encarregado ativo');
select pg_temp.espera_erro($$insert into tarefas(obra_id,titulo,encarregado_id,inicio_previsto,fim_previsto)
  values('10000000-0000-0000-0000-000000000001','Teste','00000000-0000-0000-0000-00000000000c',current_date+5,current_date+1)$$,
  'tarefas_prazo_ck');
insert into tarefas (id, obra_id, etapa_id, titulo, descricao, local, quantidade_prevista, unidade,
                     encarregado_id, prioridade, inicio_previsto, fim_previsto)
values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
        'Execução de alvenaria do 2º pavimento','Executar conforme projeto, prumo e alinhamento','Bloco A • 2º pav',
        320,'m²','00000000-0000-0000-0000-00000000000c','alta', current_date, current_date + 6);
select pg_temp.confere((select status from tarefas where id='30000000-0000-0000-0000-000000000001') = 'aguardando_confirmacao', 'tarefa nasce aguardando confirmação');
select pg_temp.espera_erro($$update tarefas set fim_previsto = fim_previsto + 3 where id='30000000-0000-0000-0000-000000000001'$$, 'reprogramação');
select pg_temp.espera_erro($$update tarefas set status='aprovado' where id='30000000-0000-0000-0000-000000000001'$$, 'ações do fluxo');
delete from tarefas where id='30000000-0000-0000-0000-000000000001';  -- RLS: sem política de exclusão (0 linhas)
select pg_temp.confere(exists(select 1 from tarefas where id='30000000-0000-0000-0000-000000000001'), 'exclusão de tarefa bloqueada pelo RLS');
reset role; select pg_temp.espera_erro($$delete from tarefas where id='30000000-0000-0000-0000-000000000001'$$, 'Exclusão não permitida'); set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000e');

-- ---------------------------------------------------------------- ENCARREGADO
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from notificacoes where tipo='tarefa_atribuida') = 1, 'encarregado notificado da nova tarefa');
update tarefas set fim_previsto = fim_previsto + 30 where id='30000000-0000-0000-0000-000000000001';  -- RLS: encarregado não edita tarefa
select pg_temp.confere((select fim_previsto from tarefas where id='30000000-0000-0000-0000-000000000001') = current_date + 6, 'encarregado não altera prazo (regra 2)');
select tarefa_confirmar_recebimento('30000000-0000-0000-0000-000000000001');
select tarefa_iniciar('30000000-0000-0000-0000-000000000001');
select tarefa_atualizar_andamento('30000000-0000-0000-0000-000000000001', null, 96, 'Fiadas até meia altura');
select pg_temp.confere((select percentual from tarefas where id='30000000-0000-0000-0000-000000000001') = 30, 'percentual calculado pela quantidade (96/320 = 30%)');
select pg_temp.espera_erro($$select tarefa_atualizar_andamento('30000000-0000-0000-0000-000000000001', 100)$$, 'Concluir serviço');

-- Pedro (outro encarregado) não vê nem age na tarefa do João
select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
select pg_temp.confere((select count(*) from tarefas) = 0, 'encarregado não vê tarefa de outro');
select pg_temp.espera_erro($$select tarefa_concluir('30000000-0000-0000-0000-000000000001')$$, 'Sem acesso');

-- ---------------------------------------------------------------- MATERIAIS
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select criar_solicitacao('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   current_date - 1,'alta','x',null,'[{"material":"Bloco","unidade":"un","quantidade":10}]')$$, 'hoje ou depois');
select criar_solicitacao('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   current_date + 2, 'alta', 'Continuidade da alvenaria', null,
   '[{"material":"Bloco cerâmico 9x19x19","especificacao":"8 furos","unidade":"un","quantidade":2000},
     {"material":"Argamassa de assentamento","unidade":"saco 20kg","quantidade":60}]'::jsonb) as sm \gset
select pg_temp.confere((select status from solicitacoes where id = :'sm') = 'aguardando_aprovacao', 'pedido do encarregado aguarda aprovação');
select tarefa_registrar_impedimento('30000000-0000-0000-0000-000000000001','falta_material','Acabaram os blocos no pavimento');
select pg_temp.confere((select status from tarefas where id='30000000-0000-0000-0000-000000000001') = 'aguardando_material', 'falta de material muda status');
select pg_temp.espera_erro(format($$select solicitacao_decidir(%L, true)$$, :'sm'), 'Apenas o engenheiro');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.confere((select count(*) from notificacoes where tipo='material_aprovacao') = 1, 'engenheira notificada do pedido');
select pg_temp.confere((select count(*) from notificacoes where tipo='paralisado_material') = 1, 'engenheira notificada da paralisação');
select solicitacao_decidir(:'sm', true, null);

-- almoxarifado: bloco 500 em estoque (parcial), argamassa total
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select id as bloco from solicitacao_itens where solicitacao_id = :'sm' and material like 'Bloco%' \gset
select id as arg from solicitacao_itens where solicitacao_id = :'sm' and material like 'Argamassa%' \gset
select item_verificar_estoque(:'bloco', 500);
select item_verificar_estoque(:'arg', 60);
select id as bloco_compra from solicitacao_itens where item_origem_id = :'bloco' \gset
select pg_temp.confere((select quantidade from solicitacao_itens where id = :'bloco_compra') = 1500, 'saldo 1500 un desmembrado para compras');
select pg_temp.espera_erro(format($$select item_atualizar_compra(%L,'comprado','X',current_date)$$, :'bloco_compra'), 'Apenas o setor de compras');

-- compras: comprado com previsão DEPOIS da necessidade -> alerta de risco
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.confere((select count(*) from notificacoes where tipo='compra_necessaria') = 1, 'compras notificado do saldo');
select item_atualizar_compra(:'bloco_compra','em_cotacao',null,null,'Cotando 3 fornecedores');
select item_atualizar_compra(:'bloco_compra','comprado','Cerâmica Teste Ltda', current_date + 4);
select pg_temp.espera_erro(format($$select item_atualizar_compra(%L,'em_cotacao',null,null)$$, :'bloco_compra'), 'retroceder');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.confere((select count(*) from notificacoes where tipo='risco_atraso_material') = 1, 'alerta de risco: entrega prevista após a necessidade');
select pg_temp.confere((select risco_atraso from v_itens where id = :'bloco_compra'), 'view marca risco_atraso');

-- almoxarifado envia: argamassa total, bloco estoque 500, bloco compra em 2 partes
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select item_registrar_envio(:'arg', 60) as e_arg \gset
select item_registrar_envio(:'bloco', 500) as e_bloco \gset
select item_registrar_envio(:'bloco_compra', 1000) as e_bc1 \gset
select pg_temp.espera_erro(format($$select item_registrar_envio(%L, 600)$$, :'bloco_compra'), 'restam');

-- encarregado confirma (bloco compra: chegaram só 950 de 1000 -> divergência)
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select entrega_confirmar(:'e_arg', 60);
select entrega_confirmar(:'e_bloco', 500);
select entrega_confirmar(:'e_bc1', 950, 'Faltaram 50 blocos no caminhão');
select pg_temp.confere((select status from solicitacao_itens where id = :'bloco_compra') = 'parcialmente_entregue', 'entrega parcial registrada');
select pg_temp.espera_erro(format($$select entrega_confirmar(%L, 1)$$, :'e_bc1'), 'já foi confirmada');

select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.confere((select count(*) from notificacoes where tipo='divergencia_entrega') = 1, 'almoxarifado avisado da divergência');
select item_registrar_envio(:'bloco_compra', 550) as e_bc2 \gset

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select entrega_confirmar(:'e_bc2', 550);
select pg_temp.confere((select status from solicitacoes where id = :'sm') = 'concluida', 'solicitação concluída quando tudo foi entregue');
select pg_temp.confere((select count(*) from notificacoes where tipo='material_completo') = 1, 'encarregado avisado para retomar');

-- retoma, pede novo prazo, conclui
select tarefa_iniciar('30000000-0000-0000-0000-000000000001');
select tarefa_solicitar_reprogramacao('30000000-0000-0000-0000-000000000001', null, current_date + 8, 'falta_material',
                                      'Dois dias parados aguardando bloco') as rp \gset
select pg_temp.confere((select fim_previsto from tarefas where id='30000000-0000-0000-0000-000000000001') = current_date + 6, 'pedido de prazo não altera a data sozinho');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select tarefa_reprogramar('30000000-0000-0000-0000-000000000001', current_date, current_date + 8, 'falta_material',
                          'Aprovado: atraso de fornecedor comprovado', :'rp');
select pg_temp.confere((select fim_previsto from tarefas where id='30000000-0000-0000-0000-000000000001') = current_date + 8, 'prazo reprogramado com justificativa');
select pg_temp.confere((select status from reprogramacoes where id = :'rp') = 'aprovada', 'histórico de reprogramação mantido');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select tarefa_concluir('30000000-0000-0000-0000-000000000001', 'Alvenaria finalizada');
select pg_temp.confere((select status from tarefas where id='30000000-0000-0000-0000-000000000001') = 'aguardando_validacao', 'conclusão vai para validação (regra 8)');
select pg_temp.espera_erro($$select tarefa_validar('30000000-0000-0000-0000-000000000001', true)$$, 'Apenas o engenheiro');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.espera_erro($$select tarefa_validar('30000000-0000-0000-0000-000000000001', false, '')$$, 'motivo');
select tarefa_validar('30000000-0000-0000-0000-000000000001', true, 'Prumo e alinhamento conferidos');
select pg_temp.confere((select status from tarefas where id='30000000-0000-0000-0000-000000000001') = 'aprovado', 'engenheira aprova e finaliza');
select pg_temp.espera_erro($$update tarefas set titulo='x' where id='30000000-0000-0000-0000-000000000001'$$, 'aprovada e finalizada');

-- ---------------------------------------------------------------- DIRETORIA
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere((select avanco_fisico from v_obras where codigo='TESTE-001') = 100, 'avanço físico da obra = 100%');
select pg_temp.confere((select count(*) from tarefa_eventos where tarefa_id='30000000-0000-0000-0000-000000000001') >= 12, 'histórico completo da tarefa');
select pg_temp.confere((select count(*) from auditoria) > 20, 'auditoria registrou as operações');
reset role; select pg_temp.espera_erro($$delete from tarefa_eventos$$, 'Exclusão não permitida'); set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere(gerar_alertas() >= 0, 'rotina de alertas executa');

-- Alertas de atraso: tarefa vencida (criada pela diretoria, que também gere a obra)
reset role;
select set_config('app.fluxo','on',false);
insert into tarefas (obra_id, titulo, encarregado_id, inicio_previsto, fim_previsto)
values ('10000000-0000-0000-0000-000000000001','TESTE tarefa vencida','00000000-0000-0000-0000-00000000000c', current_date - 10, current_date - 2);
select set_config('app.fluxo','off',false);
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select gerar_alertas() as n1 \gset
select gerar_alertas() as n2 \gset
select pg_temp.confere(:n1 >= 2 and :n2 = 0, 'alerta de atraso gerado uma vez por dia (sem duplicar)');
select pg_temp.confere((select situacao_prazo from v_tarefas where titulo='TESTE tarefa vencida') = 'atrasado', 'situação de prazo = atrasado');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select gerar_alertas()$$, 'Apenas a diretoria');
select pg_temp.espera_erro($$update notificacoes set titulo='x'$$, 'permission denied');

reset role;
\echo ''
\echo '=========== TODOS OS TESTES PASSARAM ==========='
