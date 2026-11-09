-- =====================================================================
-- TESTE: notas e despesas avulsas
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

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select nota_registrar('{"categoria_id":2,"valor":"50","estabelecimento":"Rest X","pago":true}')$$, 'Apenas diretoria, financeiro ou compras');

select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro($$select nota_registrar('{"categoria_id":2,"valor":"0","estabelecimento":"Rest X","pago":true}')$$, 'valor');
select pg_temp.espera_erro($$select nota_registrar('{"categoria_id":2,"valor":"50","estabelecimento":"Rest X","pago":false}')$$, 'vencimento');
select nota_registrar(jsonb_build_object('categoria_id', (select id from categorias_nota where nome like 'Alimenta%'), 'valor', '87.50',
  'estabelecimento', 'Restaurante Teste', 'obra_id', '10000000-0000-0000-0000-000000000001', 'pago', true, 'forma_pagamento', 'PIX',
  'data_nota', hoje()::text, 'descricao', 'almoço equipe')) as n \gset
select pg_temp.confere((select l.status = 'liquidado' and l.origem = 'nota' and l.categoria = 'outras_despesas' and l.valor = 87.5
  from notas_despesa n join lancamentos l on l.id = n.lancamento_id where n.id = :'n'), 'almoço vira despesa paga no financeiro (não é material)');
select pg_temp.confere(nota_categoria_salvar('Aluguel de banheiro químico', 'servicos_terceiros') > 0, 'compras cria categoria nova');
select nota_registrar(jsonb_build_object('categoria_id', (select id from categorias_nota where nome like 'Materiais%'), 'valor', '120',
  'estabelecimento', 'Casa do Construtor', 'pago', false, 'vencimento', (hoje() + 10)::text)) as n2 \gset
select pg_temp.confere((select l.status = 'aberto' and l.categoria = 'material' from notas_despesa n join lancamentos l on l.id = n.lancamento_id where n.id = :'n2'), 'nota a prazo fica em aberto');
select pg_temp.espera_erro(format($$select nota_cancelar(%L, 'x')$$, :'n'), 'motivo');
select nota_cancelar(:'n', 'lançada em duplicidade');
select pg_temp.confere((select n.status = 'cancelada' and l.status = 'cancelado' from notas_despesa n join lancamentos l on l.id = n.lancamento_id where n.id = :'n'), 'cancelar a nota cancela a despesa');
select pg_temp.espera_erro(format($$delete from notas_despesa where id = %L$$, :'n'), '');
