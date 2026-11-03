-- =====================================================================
-- TESTE: editar pedido de material, editar item e incluir item
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

-- encarregado João faz um pedido e erra o nome
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 5, 'normal', null, 'Ferramentas da equipe',
  '[{"material":"Bobona termica 12L","unidade":"un","quantidade":2},{"material":"Enxadaa","unidade":"un","quantidade":5}]'::jsonb) as sm \gset
select id as it1, insumo_id as ins1 from solicitacao_itens where solicitacao_id = :'sm' and material = 'Bobona termica 12L' \gset
select codigo as cod1 from insumos where id = :'ins1' \gset
select item_editar(:'it1', 'Bombona térmica de água 12 L', null, 'un', 3);
select pg_temp.confere((select material = 'Bombona térmica de água 12 L' and quantidade = 3 and insumo_id = :'ins1' from solicitacao_itens where id = :'it1')
  and (select descricao = 'Bombona térmica de água 12 L' and codigo = :'cod1' from insumos where id = :'ins1'),
  'renomear corrige o cadastro criado pelo próprio pedido e mantém o código');
select pg_temp.confere(exists (select 1 from item_eventos where item_id = :'it1' and descricao like 'Item editado:%quantidade 2 → 3%'), 'edição fica no histórico do item');
select pg_temp.espera_erro(format($$select item_editar(%L, 'Bombona térmica de água 12 L', null, 'un', 3)$$, :'it1'), 'Nada foi alterado');
select pg_temp.espera_erro(format($$select item_editar(%L, 'X', null, 'un', 0)$$, :'it1'), 'maior que zero');

-- pedido: muda data e observação; tirar observação sem tarefa é bloqueado
select pg_temp.espera_erro(format($$select solicitacao_editar(%L, current_date + 5, 'normal', null, null, '')$$, :'sm'), 'explique na observação');
select solicitacao_editar(:'sm', current_date + 7, 'alta', null, null, 'Ferramentas da equipe de capina');
select pg_temp.confere((select data_necessidade = current_date + 7 and prioridade = 'alta' from solicitacoes where id = :'sm')
  and (select bool_and(data_necessidade = current_date + 7) from solicitacao_itens where solicitacao_id = :'sm'), 'editar pedido muda a data dos itens');

-- incluir item
select item_adicionar(:'sm', '{"material":"Carro de mão","unidade":"un","quantidade":2}'::jsonb) as it3 \gset
select pg_temp.confere((select insumo_id is not null and solicitacao_id = :'sm' from solicitacao_itens where id = :'it3'), 'item incluído no pedido com cadastro de insumo');

-- outra pessoa sem vínculo não edita
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.espera_erro(format($$select item_editar(%L, 'Bombona', null, 'un', 1)$$, :'it1'), 'Sem permissão');

-- depois de ir para cotação, não edita mais
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select solicitacao_decidir(:'sm', true, null) where (select status = 'aguardando_aprovacao' from solicitacoes where id = :'sm');
select item_verificar_estoque(:'it1', 0, null);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select cotacao_criar(null, format('[{"solicitacao_item_id":"%s"}]', :'it1')::jsonb);
select pg_temp.espera_erro(format($$select item_editar(%L, 'Outra coisa', null, 'un', 1)$$, :'it1'), 'já está em cotação');
\echo ''
\echo '=========== TESTES DE EDITAR PEDIDO PASSARAM ==========='
