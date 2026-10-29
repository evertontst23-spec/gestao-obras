-- =====================================================================
-- TESTE: assinatura por EPI na ficha
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
insert into insumos (codigo, descricao, unidade, categoria, ca) values ('TESTE-EPI-A', 'TESTE Óculos', 'un', 'EPI', '111'), ('TESTE-EPI-B', 'TESTE Luva', 'par', 'EPI', '222');
select id as a from insumos where codigo = 'TESTE-EPI-A' \gset
select id as b from insumos where codigo = 'TESTE-EPI-B' \gset
select id as func from funcionarios where ativo order by criado_em offset 1 limit 1 \gset
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select epi_registrar_pendente(:'func', null, format('[{"insumo_id":"%s","quantidade":1},{"insumo_id":"%s","quantidade":2}]', :'a', :'b')::jsonb, 'admissao', current_date) as pend \gset
select pg_temp.confere(:'pend' is not null, 'encarregado registra a entrega para assinar');
select id as entregador from funcionarios where ativo and id <> :'func' limit 1 \gset
select epi_pendente_definir_entregador(:'pend', :'entregador');
select epi_confirmar_item(:'pend', :'a', 'assinatura', 'sst/epi/a.png') as e1 \gset
select pg_temp.confere((select entregue_por_func = :'entregador' from epi_entregas where id = :'e1'), 'linha da ficha guarda o funcionário que entregou');
select pg_temp.confere((select count(*) = 1 from epi_entrega_itens where entrega_id = :'e1' and insumo_id = :'a'), 'cada EPI assinado vira uma linha com a própria assinatura');
select pg_temp.confere((select entrega_id is null from epi_pendentes where id = :'pend'), 'entrega continua aberta enquanto falta EPI para assinar');
select pg_temp.espera_erro(format($$select epi_confirmar_item(%L, %L, 'assinatura', 'x.png')$$, :'pend', :'a'), 'já foi assinado');
select epi_confirmar_item(:'pend', :'b', 'assinatura', 'sst/epi/b.png') as e2 \gset
select pg_temp.confere((select entrega_id = :'e2' and confirmado_em is not null from epi_pendentes where id = :'pend')
  and (select assinatura_caminho = 'sst/epi/b.png' and data = current_date from epi_entregas where id = :'e2')
  and (select quantidade = 2 from epi_entrega_itens where entrega_id = :'e2'), 'último EPI assinado encerra a entrega, com data e quantidade');
\echo ''
\echo '=========== TESTES DE ASSINATURA POR EPI PASSARAM ==========='
