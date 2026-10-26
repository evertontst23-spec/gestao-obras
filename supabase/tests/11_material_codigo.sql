-- =====================================================================
-- TESTE: código do material no pedido e cadastro automático de insumos novos
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

-- ---------------------------------------------------------------- cadastro do cenário (RH)

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', 'Teste código', null,
  '[{"material":"CIM-01 — qualquer nome","unidade":"saco","quantidade":10},
    {"material":"TUB-50 — Tubo PVC esgoto 50 mm","unidade":"barra","quantidade":4},
    {"material":"Luva  de raspa  cano longo","unidade":"par","quantidade":6}]'::jsonb) as sm \gset
select pg_temp.confere((select material = 'Cimento CP II-32 50kg' and unidade = 'saco' from solicitacao_itens where solicitacao_id = :'sm' and quantidade = 10),
  'código existente traz o nome e a unidade do cadastro');
select pg_temp.confere((select revisar and descricao = 'Tubo PVC esgoto 50 mm' and unidade = 'barra' from insumos where codigo = 'TUB-50'),
  'código novo é cadastrado com o nome digitado (marcado para revisão)');
select pg_temp.confere((select codigo ~ '^M[0-9]{4}$' and descricao = 'Luva de raspa cano longo' from insumos i join solicitacao_itens s on s.insumo_id = i.id
                         where s.solicitacao_id = :'sm' and s.quantidade = 6), 'material sem código recebe código automático');
select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', 'Segundo pedido', null,
  '[{"material":"luva de raspa cano longo","unidade":"par","quantidade":2}]'::jsonb) as sm2 \gset
select pg_temp.confere((select count(*) = 1 from insumos where lower(descricao) = 'luva de raspa cano longo'),
  'o segundo pedido do mesmo material usa o cadastro (não duplica)');
\echo ''
\echo '=========== TESTES DE CÓDIGO DE MATERIAL PASSARAM ==========='
