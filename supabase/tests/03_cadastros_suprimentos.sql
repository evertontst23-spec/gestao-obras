-- =====================================================================
-- TESTE: cadastros (RH) + suprimentos unificado (estoque → cotação → diretoria → OC → NF → coleta → recebimento)
-- Continua o banco dos testes 01/02.
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

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1','rh@teste.local','{"nome":"TESTE RH"}','{"papel":"rh"}'),
 ('00000000-0000-0000-0000-0000000000f2','seg@teste.local','{"nome":"TESTE Segurança"}','{"papel":"seguranca"}'),
 ('00000000-0000-0000-0000-0000000000f3','fin@teste.local','{"nome":"TESTE Financeiro"}','{"papel":"financeiro"}');

grant execute on all functions in schema pg_temp to authenticated;
set role authenticated;
\set obra '\'10000000-0000-0000-0000-000000000001\''

-- ---------------------------------------------------------------- RH / CADASTROS
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$insert into funcoes (nome, salario_base) values ('Pedreiro', 2500)$$, 'row-level security');

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
insert into funcoes (id, nome, cbo, salario_base, carga_diaria_horas, vale_alimentacao_dia, epis_obrigatorios)
values ('f0000000-0000-0000-0000-000000000001', 'Pedreiro', '7152-10', 2640, 8, 25, '{Capacete,Bota,Luva}');
insert into funcionarios (id, nome, cpf, funcao_id, obra_id, data_admissao)
values ('f1000000-0000-0000-0000-000000000001', 'TESTE José Pedreiro', '111.111.111-11', 'f0000000-0000-0000-0000-000000000001', :obra, current_date - 30);
select pg_temp.confere((select salario_efetivo from v_funcionarios where id = 'f1000000-0000-0000-0000-000000000001') = 2640, 'funcionário herda salário da tabela por função');
select pg_temp.espera_erro($$select face_descritor from funcionarios$$, 'permission denied');
select pg_temp.espera_erro($$update funcionarios set ativo = false where id = 'f1000000-0000-0000-0000-000000000001'$$, 'permission denied');
select pg_temp.espera_erro($$select funcionario_desligar('f1000000-0000-0000-0000-000000000001', current_date, '')$$, 'motivo');

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from funcionarios) = 0, 'encarregado não vê dados pessoais dos funcionários');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.confere((select count(*) from funcionarios) = 1, 'engenheiro vê funcionários da sua obra');
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select pg_temp.confere((select count(*) from funcionarios) = 0, 'engenheiro de outra obra não vê');

-- ---------------------------------------------------------------- INSUMOS / FORNECEDORES / ESTOQUE
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.espera_erro($$insert into insumos (codigo, descricao, unidade) values ('X1','X','un')$$, 'row-level security');

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into insumos (id, codigo, descricao, unidade, categoria, estoque_minimo) values
 ('e1000000-0000-0000-0000-000000000001','CIM-01','Cimento CP II-32 50kg','saco','Material', 40),
 ('e1000000-0000-0000-0000-000000000002','BLC-09','Bloco cerâmico 9x19x19','un','Material', 0);
insert into fornecedores (id, nome, documento, categoria) values
 ('e2000000-0000-0000-0000-000000000001','TESTE Casa do Construtor','11.111.111/0001-11','Materiais'),
 ('e2000000-0000-0000-0000-000000000002','TESTE Cerâmica Barata','22.222.222/0001-22','Materiais');

select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select estoque_lancar(null, 'e1000000-0000-0000-0000-000000000001', 'entrada', 100, 'Inventário inicial do depósito');
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000001', null) = 100, 'entrada de 100 sacos no depósito central');
select pg_temp.espera_erro($$select estoque_lancar(null, 'e1000000-0000-0000-0000-000000000001', 'saida', 500, 'teste')$$, 'Saldo insuficiente');

-- ---------------------------------------------------------------- PEDIDO DA OBRA
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select criar_solicitacao(:obra, null, current_date + 5, 'alta', 'Reboco bloco B', null,
  '[{"material":"CIM-01 — Cimento","unidade":"saco","quantidade":150},{"material":"Bloco cerâmico 9x19x19","unidade":"un","quantidade":2000}]'::jsonb) as sm \gset
select pg_temp.confere((select count(*) from solicitacao_itens where solicitacao_id = :'sm' and insumo_id is not null) = 2, 'itens reconhecidos pelo código e pela descrição do insumo');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select solicitacao_decidir(:'sm', true, null);

select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select id as it_cim from solicitacao_itens where solicitacao_id = :'sm' and insumo_id = 'e1000000-0000-0000-0000-000000000001' \gset
select id as it_blc from solicitacao_itens where solicitacao_id = :'sm' and insumo_id = 'e1000000-0000-0000-0000-000000000002' \gset
select pg_temp.espera_erro(format($$select item_verificar_estoque(%L, 120)$$, :'it_cim'), 'disponíveis');
select item_verificar_estoque(:'it_cim', 100);
select item_verificar_estoque(:'it_blc', 0);
select pg_temp.confere((select origem_estoque and estoque_obra_id is null from solicitacao_itens where id = :'it_cim'), '100 sacos separados do depósito central');
select id as it_cim_saldo from solicitacao_itens where item_origem_id = :'it_cim' \gset

-- ---------------------------------------------------------------- COTAÇÃO
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro(format($$select cotacao_criar(null, '[{"solicitacao_item_id":"%s"},{"solicitacao_item_id":"%s"}]'::jsonb)$$, :'it_cim_saldo', :'it_blc'), 'Já existe estoque');
select cotacao_criar(null, format('[{"solicitacao_item_id":"%s"},{"solicitacao_item_id":"%s"}]', :'it_cim_saldo', :'it_blc')::jsonb,
                     'Estoque do depósito já reservado para este mesmo pedido') as cot \gset
select pg_temp.confere((select obra_id = :obra from cotacoes where id = :'cot'), 'cotação assume a obra dos itens');
select id as ci_cim from cotacao_itens where cotacao_id = :'cot' and insumo_id = 'e1000000-0000-0000-0000-000000000001' \gset
select id as ci_blc from cotacao_itens where cotacao_id = :'cot' and insumo_id = 'e1000000-0000-0000-0000-000000000002' \gset
select pg_temp.espera_erro(format($$select cotacao_proposta_salvar(%L, 'e2000000-0000-0000-0000-000000000001', 3, '28 dias', 0, '[{"cotacao_item_id":"%s","preco_unitario":40}]'::jsonb)$$, :'cot', :'ci_cim'), 'todos os itens');
select cotacao_proposta_salvar(:'cot', 'e2000000-0000-0000-0000-000000000001', 2, '28 dias', 50,
  format('[{"cotacao_item_id":"%s","preco_unitario":40},{"cotacao_item_id":"%s","preco_unitario":1.20}]', :'ci_cim', :'ci_blc')::jsonb) as p1 \gset
select cotacao_proposta_salvar(:'cot', 'e2000000-0000-0000-0000-000000000002', 10, 'à vista', 0,
  format('[{"cotacao_item_id":"%s","preco_unitario":38},{"cotacao_item_id":"%s","preco_unitario":1.10}]', :'ci_cim', :'ci_blc')::jsonb) as p2 \gset
select pg_temp.confere((select valor_total from cotacao_propostas where id = :'p1') = 4450, 'total da proposta 1 = 50×40 + 2000×1,20 + frete 50');
select pg_temp.espera_erro(format($$select cotacao_enviar_aprovacao(%L, %L)$$, :'cot', :'p1'), 'menor valor');
select cotacao_enviar_aprovacao(:'cot', :'p1', 'Entrega em 2 dias; o mais barato só entrega em 10');

select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.espera_erro(format($$select cotacao_decidir(%L, true)$$, :'cot'), 'Apenas a diretoria');

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere((select count(*) from notificacoes where tipo = 'cotacao_aprovar') = 1, 'diretoria notificada para aprovar a compra');
select cotacao_decidir(:'cot', true, 'Aprovado', 'retirada', null) as oc \gset
select pg_temp.confere((select status from solicitacao_itens where id = :'it_blc') = 'compra_autorizada', 'aprovação gera OC e autoriza os itens');

-- ---------------------------------------------------------------- OC: todos visualizam
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from ordens_compra where id = :'oc') = 1, 'encarregado da obra visualiza a OC');
select pg_temp.confere((select codigo from v_ordens_compra where id = :'oc') like 'OC-%', 'consulta de OCs funciona para o encarregado');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.confere((select codigo from v_cotacoes where id = :'cot') like 'COT-%', 'consulta de cotações funciona para o comprador');
select pg_temp.confere((select count(*) from v_estoque) >= 1 and (select count(*) from v_funcionarios) = 0, 'consultas de estoque e funcionários respeitam o perfil');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.confere((select count(*) from notificacoes where tipo = 'oc_emitida') = 1, 'almoxarifado avisado da OC emitida');
select oc_anexar_documento(:'oc', 'nf', '4521', 4000, null, 'sup/oc/nf.jpg', 'image/jpeg');
select pg_temp.confere((select nf_divergente from ordens_compra where id = :'oc'), 'NF com valor diferente da OC é marcada como divergente');

select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select pg_temp.confere((select count(*) from notificacoes where tipo = 'nf_divergente') = 1, 'financeiro avisado da divergência');
select pg_temp.espera_erro(format($$select oc_liberar_coleta(%L, 'pago')$$, :'oc'), 'quem vai retirar');
select oc_liberar_coleta(:'oc', 'pago', 'Motorista Severino');
select pg_temp.confere((select status from ordens_compra where id = :'oc') = 'pronta_coleta', 'OC paga — pronta para coleta');
select pg_temp.confere((select oc_id = :'oc' from v_itens where id = :'it_blc'), 'consulta de itens enxerga a OC vinculada');
select pg_temp.confere((select count(*) from information_schema.columns where table_name = 'v_tarefas' and column_name = 'planilha_item_id') = 1, 'consulta de tarefas enxerga o item da planilha');

select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.confere((select count(*) from notificacoes where tipo = 'oc_pronta_coleta') = 1, 'almoxarifado avisado: pronto para coleta');
select pg_temp.espera_erro(format($$select item_registrar_envio(%L, 10)$$, :'it_blc'), 'ainda não chegou');
select id as oi_cim from oc_itens where oc_id = :'oc' and insumo_id = 'e1000000-0000-0000-0000-000000000001' \gset
select id as oi_blc from oc_itens where oc_id = :'oc' and insumo_id = 'e1000000-0000-0000-0000-000000000002' \gset
select pg_temp.espera_erro(format($$select oc_receber(%L, '[{"oc_item_id":"%s","quantidade":60}]'::jsonb)$$, :'oc', :'oi_cim'), 'excede');
select oc_receber(:'oc', format('[{"oc_item_id":"%s","quantidade":50},{"oc_item_id":"%s","quantidade":1500}]', :'oi_cim', :'oi_blc')::jsonb);
select pg_temp.confere((select status from ordens_compra where id = :'oc') = 'recebida_parcial', 'recebimento parcial da OC');
select oc_receber(:'oc', format('[{"oc_item_id":"%s","quantidade":500}]', :'oi_blc')::jsonb, 'Segunda viagem');
select pg_temp.confere((select status from ordens_compra where id = :'oc') = 'recebida', 'OC totalmente recebida');
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000002', :obra) = 2000, 'blocos entraram no estoque da obra');
select pg_temp.confere((select status = 'disponivel_estoque' and estoque_obra_id = :obra from solicitacao_itens where id = :'it_blc'), 'item liberado para entrega ao encarregado');

-- Envio para a frente de serviço baixa o estoque certo
select item_registrar_envio(:'it_cim', 100);
select item_registrar_envio(:'it_blc', 2000);
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000001', null) = 0, 'saída de 100 sacos do depósito central');
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000002', :obra) = 0, 'saída dos blocos do estoque da obra');
select pg_temp.confere((select count(*) from notificacoes n where n.tipo = 'estoque_minimo') >= 1, 'alerta de estoque abaixo do mínimo');

reset role;
select pg_temp.espera_erro($$delete from ordens_compra$$, 'Exclusão não permitida');
select pg_temp.espera_erro($$delete from estoque_movimentos$$, 'Exclusão não permitida');
\echo ''
\echo '=========== TESTES DE CADASTROS E SUPRIMENTOS PASSARAM ==========='
