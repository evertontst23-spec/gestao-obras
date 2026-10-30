-- =====================================================================
-- TESTE: desfazer cada etapa de compras (OC, pagamento, NF, recebimento, excluir cotação)
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

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
-- cotação de reposição com um insumo (para testar estoque) + itens de solicitação ainda na fila
select id as ins from insumos where ativo and categoria <> 'EPI' order by codigo limit 1 \gset
select format('[{"insumo_id":"%s","quantidade":10}]', :'ins') as itens \gset
select cotacao_criar('10000000-0000-0000-0000-000000000001', :'itens'::jsonb, 'Reposição para teste de desfazer') as c1 \gset
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":7}', id), ',')) as precos from cotacao_itens where cotacao_id = :'c1' \gset
select cotacao_proposta_salvar(:'c1', 'e2000000-0000-0000-0000-000000000001', 3, '28 dias', 0, :'precos'::jsonb) as p1 \gset
select cotacao_enviar_aprovacao(:'c1', :'p1');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select cotacao_decidir(:'c1', true) as oc1 \gset

-- encarregado não desfaz
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select oc_desfazer(%L, 'teste errado')$$, :'oc1'), 'Apenas o comprador');
-- comprador desfaz a OC: vira cotação de correção com itens e propostas
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro(format($$select oc_desfazer(%L, 'x')$$, :'oc1'), 'motivo');
select oc_desfazer(:'oc1', 'Preço digitado errado') as c2 \gset
select pg_temp.confere((select status = 'cancelada' from ordens_compra where id = :'oc1'), 'desfazer cancela a OC');
select pg_temp.confere((select status = 'cancelado' from lancamentos where oc_id = :'oc1'), 'conta a pagar da OC desfeita é cancelada');
select pg_temp.confere((select status = 'em_cotacao' from cotacoes where id = :'c2')
  and (select count(*) = 1 from cotacao_propostas where cotacao_id = :'c2')
  and (select count(*) = 1 from cotacao_precos pr join cotacao_propostas p on p.id = pr.proposta_id where p.cotacao_id = :'c2'),
  'cópia da cotação volta com itens, propostas e preços para corrigir');
select pg_temp.espera_erro(format($$select cotacao_excluir(%L, 'tentativa')$$, :'c1'), 'Desfazer OC');

-- corrige e segue
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":6}', id), ',')) as precos2 from cotacao_itens where cotacao_id = :'c2' \gset
select cotacao_proposta_salvar(:'c2', 'e2000000-0000-0000-0000-000000000001', 3, '28 dias', 0, :'precos2'::jsonb) as p2 \gset
select pg_temp.confere((select valor_total = 60 from cotacao_propostas where id = :'p2'), 'valor corrigido na cópia');
select cotacao_enviar_aprovacao(:'c2', :'p2');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select cotacao_decidir(:'c2', true) as oc2 \gset

-- pagamento lançado por engano
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select oc_liberar_coleta(:'oc2', 'pago');
select pg_temp.confere((select status = 'liquidado' from lancamentos where oc_id = :'oc2'), 'pago baixa a conta');
select oc_voltar_pagamento(:'oc2', 'Ainda não foi pago');
select pg_temp.confere((select status = 'emitida' and pagamento is null from ordens_compra where id = :'oc2')
  and (select status = 'aberto' from lancamentos where oc_id = :'oc2'), 'desfazer pagamento volta a OC e reabre a conta');

-- NF com valor errado
select oc_anexar_documento(:'oc2', 'nf', '123', 999, null, null) as nf \gset
select pg_temp.confere((select nf_divergente from ordens_compra where id = :'oc2'), 'NF errada fica divergente');
select oc_documento_anular(:'nf', 'Valor digitado errado');
select pg_temp.confere((select nf_numero is null and not nf_divergente from ordens_compra where id = :'oc2')
  and (select valor = 60 from lancamentos where oc_id = :'oc2'), 'excluir a NF limpa a OC e volta o valor da conta');
select pg_temp.confere((select anulado_em is not null from oc_documentos where id = :'nf'), 'NF excluída fica no histórico');
select oc_anexar_documento(:'oc2', 'nf', '124', 60, null, null);

-- entrada da nota (recebimento) e estorno
select saldo_estoque(:'ins', '10000000-0000-0000-0000-000000000001') as antes \gset
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select format('[%s]', string_agg(format('{"oc_item_id":"%s","quantidade":"10"}', id), ',')) as rec from oc_itens where oc_id = :'oc2' \gset
select oc_receber(:'oc2', :'rec'::jsonb);
select pg_temp.confere(saldo_estoque(:'ins', '10000000-0000-0000-0000-000000000001') = :'antes'::numeric + 10, 'recebimento entra no estoque');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select oc_estornar_recebimento(%L, 'teste')$$, :'oc2'), 'Apenas almoxarifado');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select oc_estornar_recebimento(:'oc2', 'Lancei a quantidade errada');
select pg_temp.confere(saldo_estoque(:'ins', '10000000-0000-0000-0000-000000000001') = :'antes'::numeric, 'estorno tira do estoque');
select pg_temp.confere((select status = 'emitida' from ordens_compra where id = :'oc2')
  and (select bool_and(quantidade_recebida = 0) from oc_itens where oc_id = :'oc2'), 'OC volta a aguardar recebimento');
select pg_temp.espera_erro(format($$select oc_estornar_recebimento(%L, 'de novo')$$, :'oc2'), 'não tem recebimento');

-- excluir cotação
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select cotacao_criar('10000000-0000-0000-0000-000000000001', :'itens'::jsonb, 'Reposição duplicada por engano') as c3 \gset
select cotacao_excluir(:'c3', 'Criei duplicada');
select pg_temp.confere((select status = 'cancelada' from cotacoes where id = :'c3')
  and exists (select 1 from cotacoes_excluidas where cotacao_id = :'c3' and motivo = 'Criei duplicada'), 'cotação excluída sai da lista e guarda o motivo');
select pg_temp.espera_erro(format($$select cotacao_reabrir(%L)$$, :'c3'), 'foi excluída');
select pg_temp.espera_erro(format($$select cotacao_excluir(%L, 'outra vez')$$, :'c3'), 'já foi excluída');
\echo ''
\echo '=========== TESTES DE DESFAZER COMPRAS PASSARAM ==========='
