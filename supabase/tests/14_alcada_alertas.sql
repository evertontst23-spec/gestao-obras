-- =====================================================================
-- TESTE: alçada de aprovação de compras e alertas do fluxo
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

-- ---------------------------------------------------------------- alçada
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro($$select compras_definir_limite(100000)$$, 'Apenas a diretoria');
select pg_temp.espera_erro($$select perfil_definir_coordenador('00000000-0000-0000-0000-00000000000b', true)$$, 'Apenas a diretoria');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select compras_definir_limite(1000);
select perfil_definir_coordenador('00000000-0000-0000-0000-00000000000b', true);
delete from notificacoes;

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select cotacao_criar(null, '[{"insumo_id":"e1000000-0000-0000-0000-000000000001","quantidade":10}]'::jsonb, 'Reposição mínima do depósito', null) as cot_p \gset
select pg_temp.confere((select count(*) = 1 from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000a' and tipo = 'cotacao_aberta'), 'diretoria avisada da cotação aberta');
select id as ci_p from cotacao_itens where cotacao_id = :'cot_p' \gset
select cotacao_proposta_salvar(:'cot_p', 'e2000000-0000-0000-0000-000000000002', 3, 'à vista', 0, format('[{"cotacao_item_id":"%s","preco_unitario":38}]', :'ci_p')::jsonb) as pp \gset
select cotacao_enviar_aprovacao(:'cot_p', :'pp');
select pg_temp.confere((select mensagem like '%dentro do limite do coordenador%' from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000a' and tipo = 'cotacao_aprovar' and link like '%' || :'cot_p'),
  'aviso de aprovação informa que está dentro do limite do coordenador');
select cotacao_decidir(:'cot_p', true, 'Ok', 'entrega', null) as oc_p \gset
select pg_temp.confere(:'oc_p' is not null, 'coordenador de compras aprova compra até o limite (R$ 380)');
select pg_temp.confere((select count(*) = 1 from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000a' and titulo like 'Compra aprovada pelo coordenador%'),
  'diretoria avisada da compra aprovada pelo coordenador');

select cotacao_criar(null, '[{"insumo_id":"e1000000-0000-0000-0000-000000000001","quantidade":100}]'::jsonb, 'Reposição do depósito', null) as cot_g \gset
select id as ci_g from cotacao_itens where cotacao_id = :'cot_g' \gset
select cotacao_proposta_salvar(:'cot_g', 'e2000000-0000-0000-0000-000000000002', 3, 'à vista', 0, format('[{"cotacao_item_id":"%s","preco_unitario":40}]', :'ci_g')::jsonb) as pg_ \gset
select cotacao_enviar_aprovacao(:'cot_g', :'pg_');
select pg_temp.espera_erro(format($$select cotacao_decidir(%L, true)$$, :'cot_g'), 'acima do limite do coordenador');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.confere((select mensagem like '%só a diretoria aprova%' from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000a' and tipo = 'cotacao_aprovar' and link like '%' || :'cot_g'),
  'acima do limite o aviso diz que só a diretoria aprova');
select cotacao_decidir(:'cot_g', true, 'Aprovado', 'entrega', null) as oc_g \gset
select pg_temp.confere(:'oc_g' is not null, 'diretoria aprova compra acima do limite (R$ 4.000)');

-- ---------------------------------------------------------------- alertas do fluxo do pedido
delete from notificacoes;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', null, 'Material de limpeza do canteiro',
  '[{"material":"Vassoura","unidade":"un","quantidade":3},{"material":"Rodo","unidade":"un","quantidade":2}]'::jsonb) as sm \gset
select pg_temp.confere((select count(*) = 1 from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000a' and tipo in ('material_novo','material_aprovacao')),
  'diretoria avisada do novo pedido de material');
select pg_temp.confere((select count(*) = 0 from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000c'), 'quem fez a ação não recebe alerta dela');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select solicitacao_decidir(:'sm', true, null) where (select status from solicitacoes where id = :'sm') = 'aguardando_aprovacao';
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select item_verificar_estoque(id, 0, null) from solicitacao_itens where solicitacao_id = :'sm';
select pg_temp.confere((select count(*) = 1 from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000a' and titulo like 'Sem estoque, foi para cotação%'),
  'um alerta por pedido quando os itens vão para cotação (não um por item)');
select pg_temp.confere((select count(*) >= 1 from notificacoes where usuario_id = '00000000-0000-0000-0000-00000000000c' and titulo like 'Sem estoque, foi para cotação%'),
  'quem pediu acompanha o andamento do pedido');
-- lote: todos os itens do pedido de uma vez
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', null, 'Lote de verificação',
  '[{"material":"Pá","unidade":"un","quantidade":2},{"material":"Enxada","unidade":"un","quantidade":2},{"material":"Carrinho de mão","unidade":"un","quantidade":1}]'::jsonb) as sm3 \gset
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select solicitacao_decidir(:'sm3', true, null) where (select status from solicitacoes where id = :'sm3') = 'aguardando_aprovacao';
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select itens_verificar_estoque_lote(array(select id from solicitacao_itens where solicitacao_id = %L), 'cotacao')$$, :'sm3'), 'Apenas o almoxarifado');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.confere(itens_verificar_estoque_lote(array(select id from solicitacao_itens where solicitacao_id = :'sm3'), 'cotacao') = 3, 'lote: os 3 itens verificados de uma vez');
select pg_temp.confere((select bool_and(status = 'em_cotacao') from solicitacao_itens where solicitacao_id = :'sm3'), 'lote: todos foram para cotação');
select pg_temp.espera_erro(format($$select itens_verificar_estoque_lote(array(select id from solicitacao_itens where solicitacao_id = %L), 'cotacao')$$, :'sm3'), 'Nenhum item');

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select compras_definir_limite(5000);
select perfil_definir_coordenador('00000000-0000-0000-0000-00000000000b', false);
\echo ''
\echo '=========== TESTES DE ALÇADA E ALERTAS PASSARAM ==========='
