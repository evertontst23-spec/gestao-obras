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

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
-- cimento de teste: comprado na obra pela OC-00001 a R$ 40,00 (média ponderada das OCs da obra de origem)
\set ins 'e1000000-0000-0000-0000-000000000001'
select pg_temp.confere((select round(valor, 2) = 40 and fonte = 'oc_obra' from custo_insumo(:'ins', '10000000-0000-0000-0000-000000000001')), 'custo vem da compra da obra de origem');
select pg_temp.confere((select round(valor, 2) = 39.82 and fonte = 'oc_obra' from custo_insumo(:'ins', null)), 'depósito central: média ponderada das compras do depósito');
select estoque_lancar('10000000-0000-0000-0000-000000000001', :'ins', 'entrada', 50, 'saldo para transferir');
select pg_temp.confere(estoque_lancar('10000000-0000-0000-0000-000000000001', :'ins', 'saida', 30, 'Levar para o depósito', null, true) = 1200, 'transferir 30 × R$ 40,00 = R$ 1.200,00');
select pg_temp.confere((select count(*) = 2 from estoque_movimentos where origem = 'transferencia' and insumo_id = :'ins' and valor_total = 1200), 'valor gravado na saída e na entrada');
select pg_temp.confere((select valor_total = 1200 and origem_nome like 'TESTE%' and destino_nome = 'Depósito central' from v_transferencias where insumo_id = :'ins' order by id desc limit 1), 'aparece na lista de transferências');
select pg_temp.confere(exists (select 1 from notificacoes where tipo = 'transferencia_material' and mensagem like '%1.200,00%'), 'diretoria/financeiro avisados com o valor');
-- material sem preço de compra
insert into insumos (codigo, descricao, unidade, categoria) values ('', 'TESTE sem preço', 'un', 'Material') returning id as sp \gset
select estoque_lancar(null, :'sp', 'entrada', 10, 'inventário');
select pg_temp.espera_erro(format($$select estoque_lancar(null, %L, 'saida', 4, 'transf', '10000000-0000-0000-0000-000000000001', true)$$, :'sp'), 'informe o valor unitário');
select pg_temp.confere(estoque_lancar(null, :'sp', 'saida', 4, 'transf', '10000000-0000-0000-0000-000000000001', true, 12.5) = 50, 'valor informado: 4 × R$ 12,50');
select pg_temp.confere((select custo_fonte = 'informado' from v_transferencias where insumo_id = :'sp'), 'fonte do valor = informado');
