-- =====================================================================
-- TESTE: coordenador aprova direto até o limite; acima, só diretoria
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

-- compras (b) vira coordenador; limite 100
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select compras_definir_limite(100);
select perfil_definir_coordenador('00000000-0000-0000-0000-00000000000b', true);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select id as ins from insumos where ativo and categoria <> 'EPI' order by codigo limit 1 \gset
select cotacao_criar('10000000-0000-0000-0000-000000000001', format('[{"insumo_id":"%s","quantidade":2}]', :'ins')::jsonb, 'Teste alçada direto') as c \gset
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":30}', id), ',')) as pr from cotacao_itens where cotacao_id = :'c' \gset
select cotacao_proposta_salvar(:'c', 'e2000000-0000-0000-0000-000000000001', 2, null, 0, :'pr'::jsonb) as p \gset
select count(*) as adm_antes from notificacoes n join perfis pf on pf.id = n.usuario_id where pf.papel = 'admin' and n.tipo = 'cotacao_aprovar' \gset
select cotacao_enviar_aprovacao(:'c', :'p');
select pg_temp.confere((select count(*) from notificacoes n join perfis pf on pf.id = n.usuario_id where pf.papel = 'admin' and n.tipo = 'cotacao_aprovar') = :adm_antes,
  'até o limite a diretoria não recebe pedido de aprovação');
select cotacao_decidir(:'c', true) as oc \gset
select pg_temp.confere(:'oc' is not null, 'coordenador aprova direto e a OC sai');
-- acima do limite
select cotacao_criar('10000000-0000-0000-0000-000000000001', format('[{"insumo_id":"%s","quantidade":10}]', :'ins')::jsonb, 'Teste alçada acima') as c2 \gset
select format('[%s]', string_agg(format('{"cotacao_item_id":"%s","preco_unitario":30}', id), ',')) as pr2 from cotacao_itens where cotacao_id = :'c2' \gset
select cotacao_proposta_salvar(:'c2', 'e2000000-0000-0000-0000-000000000001', 2, null, 0, :'pr2'::jsonb) as p2 \gset
select cotacao_enviar_aprovacao(:'c2', :'p2');
select pg_temp.confere((select count(*) from notificacoes n join perfis pf on pf.id = n.usuario_id where pf.papel = 'admin' and n.tipo = 'cotacao_aprovar') > :adm_antes,
  'acima do limite vai para a diretoria');
select pg_temp.espera_erro(format($$select cotacao_decidir(%L, true)$$, :'c2'), 'acima do limite');
\echo ''
\echo '=========== TESTES DE APROVAÇÃO DIRETA DO COORDENADOR PASSARAM ==========='
