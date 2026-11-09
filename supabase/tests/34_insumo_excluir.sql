-- =====================================================================
-- TESTE: excluir insumo
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
insert into insumos (codigo, descricao, unidade, categoria) values ('', 'TESTE errado excluir', 'un', 'Material') returning id as novo \gset
select pg_temp.espera_erro(format($$delete from insumos where id = %L$$, :'novo'), 'botão Excluir');
select pg_temp.confere(insumo_excluir(:'novo') = 'excluido', 'insumo nunca usado é excluído');
select pg_temp.confere(not exists (select 1 from insumos where id = :'novo'), 'sumiu do cadastro');
select pg_temp.confere(exists (select 1 from auditoria where tabela = 'insumos' and registro_id = :'novo' and acao = 'DELETE'), 'exclusão fica na auditoria');
select id as usado from insumos where id in (select insumo_id from estoque_movimentos) limit 1 \gset
select pg_temp.confere(insumo_excluir(:'usado') = 'desativado', 'insumo já usado só é desativado');
select pg_temp.confere((select not ativo from insumos where id = :'usado'), 'continua no histórico, inativo');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select insumo_excluir(%L)$$, :'usado'), 'Apenas compras');
