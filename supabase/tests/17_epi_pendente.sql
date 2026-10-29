-- =====================================================================
-- TESTE: entrega de EPI aguardando assinatura
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
insert into insumos (codigo, descricao, unidade, categoria, ca) values ('TESTE-EPI-P', 'TESTE Capacete pendente', 'un', 'EPI', '12345') returning id as epi \gset
insert into insumos (codigo, descricao, unidade, categoria) values ('TESTE-EPI-SEMCA', 'TESTE EPI sem CA', 'un', 'EPI') returning id as semca \gset
select estoque_lancar(null, :'epi', 'entrada', 10, 'teste', null, false);
select id as func from funcionarios where ativo order by criado_em limit 1 \gset
select pg_temp.espera_erro(format($$select epi_registrar_pendente(%L, null, '[{"insumo_id":"%s","quantidade":1}]'::jsonb)$$, :'func', :'semca'), 'sem CA');
select epi_registrar_pendente(:'func', null, format('[{"insumo_id":"%s","quantidade":2}]', :'epi')::jsonb, 'admissao', current_date - 1, 'Entregue em campo') as pend \gset
select pg_temp.confere(saldo_estoque(:'epi', null) = 8, 'entrega pendente dá baixa no estoque');
select pg_temp.confere((select count(*) = 0 from epi_entregas where funcionario_id = :'func' and observacoes like '%Entregue em campo%'), 'pendente ainda não entra na ficha como assinada');
select pg_temp.espera_erro(format($$select epi_confirmar_pendente(%L, 'assinatura', null)$$, :'pend'), 'Colete a assinatura');
select epi_confirmar_pendente(:'pend', 'assinatura', 'sst/epi/teste.png') as ent \gset
select pg_temp.confere((select data = current_date - 1 and confirmacao = 'assinatura' and hash <> 'pendente' from epi_entregas where id = :'ent')
  and (select quantidade = 2 and ca = '12345' from epi_entrega_itens where entrega_id = :'ent'), 'confirmação vira entrega da ficha com a data e o CA da entrega');
select pg_temp.confere(saldo_estoque(:'epi', null) = 8, 'confirmar não dá baixa de novo');
select pg_temp.espera_erro(format($$select epi_confirmar_pendente(%L, 'assinatura', 'x.png')$$, :'pend'), 'já foi confirmada');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.espera_erro(format($$select epi_registrar_pendente(%L, null, '[{"insumo_id":"%s"}]'::jsonb)$$, :'func', :'epi'), 'Sem permissão para entregar EPI');
\echo ''
\echo '=========== TESTES DE EPI PENDENTE PASSARAM ==========='
