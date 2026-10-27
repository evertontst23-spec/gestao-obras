-- =====================================================================
-- TESTE: pedido com locação e vínculo obrigatório
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
select pg_temp.espera_erro($$select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', null, null,
  '[{"material":"Cimento","unidade":"saco","quantidade":1}]'::jsonb)$$, 'explique na observação');
select pg_temp.espera_erro($$select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', null, 'Concretagem da laje',
  '[{"material":"Betoneira 400 L","unidade":"un","quantidade":1,"modalidade":"locacao"}]'::jsonb)$$, 'período da locação');
select pg_temp.espera_erro($$select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', null, 'Concretagem da laje',
  '[{"material":"Betoneira 400 L","unidade":"un","quantidade":1,"modalidade":"locacao","locacao_inicio":"2026-12-10","locacao_fim":"2026-12-01"}]'::jsonb)$$, 'antes do início');

select criar_solicitacao('10000000-0000-0000-0000-000000000001', null, current_date + 3, 'normal', null, 'Andaime para pintura da fachada',
  format('[{"material":"Andaime tubular","unidade":"un","quantidade":10,"modalidade":"locacao","locacao_inicio":"%s","locacao_fim":"%s"},
           {"material":"Cimento","unidade":"saco","quantidade":5,"modalidade":"compra","locacao_inicio":"%s"}]',
         current_date - 20, current_date + 2, current_date)::jsonb) as sm \gset
select id as loc from solicitacao_itens where solicitacao_id = :'sm' and modalidade = 'locacao' \gset
select pg_temp.confere((select locacao_inicio = current_date - 20 and locacao_fim = current_date + 2 from solicitacao_itens where id = :'loc'), 'locação guarda o período');
select pg_temp.confere((select locacao_inicio is null from solicitacao_itens where solicitacao_id = :'sm' and modalidade = 'compra'), 'compra não guarda período');

-- desmembrar mantém a locação
select item_verificar_estoque(:'loc', 4, null);
select pg_temp.confere((select modalidade = 'locacao' and locacao_fim = current_date + 2 and status = 'em_cotacao' from solicitacao_itens where item_origem_id = :'loc'),
  'saldo sem estoque vai para cotação mantendo a locação e o período');
select pg_temp.confere((select locacao_situacao = 'a_contratar' from v_itens where item_origem_id = :'loc'), 'locação ainda não contratada');

-- simula a chegada na obra para testar o controle
update solicitacao_itens set status = 'entregue' where id = :'loc';
select pg_temp.confere((select locacao_situacao = 'vencendo' and locacao_dias_restantes = 2 and locacao_dias = 23 from v_itens where id = :'loc'), 'locação ativa perto do fim aparece como vencendo');
select pg_temp.espera_erro(format($$select locacao_prorrogar(%L, current_date)$$, :'loc'), 'precisa ser depois');
select locacao_prorrogar(:'loc', current_date + 15, 'Pintura atrasou');
select pg_temp.confere((select locacao_situacao = 'ativa' and locacao_fim = current_date + 15 from v_itens where id = :'loc'), 'prorrogação muda o fim');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select locacao_devolver(%L, current_date)$$, :'loc'), 'Sem permissão');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select pg_temp.espera_erro(format($$select locacao_devolver(%L, current_date + 1)$$, :'loc'), 'hoje ou antes');
select locacao_devolver(:'loc', current_date, 'Devolvido sem avarias');
select pg_temp.confere((select locacao_situacao = 'devolvida' from v_itens where id = :'loc'), 'devolução encerra a locação');
select pg_temp.espera_erro(format($$select locacao_prorrogar(%L, current_date + 30)$$, :'loc'), 'já devolvida');
\echo ''
\echo '=========== TESTES DE LOCAÇÃO E VÍNCULO PASSARAM ==========='
