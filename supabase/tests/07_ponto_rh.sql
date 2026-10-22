-- =====================================================================
-- TESTE: ponto no RH — correção sem apagar o original, link do funcionário,
--        pedidos de correção
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
grant execute on all functions in schema pg_temp to authenticated, anon;

\set func '\'f1000000-0000-0000-0000-000000000001\''
\set rh   '\'00000000-0000-0000-0000-0000000000f1\''
\set enc  '\'00000000-0000-0000-0000-00000000000c\''
\set eng  '\'00000000-0000-0000-0000-00000000000e\''

-- dia de outubro com a saída esquecida e uma entrada batida errada
reset role;
select 1 from _ponto_inserir(:func, null, (date '2026-10-13' + time '07:00') at time zone 'America/Recife', 'entrada', 'facial', 0.2, null, null, null, null);
select 1 from _ponto_inserir(:func, null, (date '2026-10-13' + time '07:02') at time zone 'America/Recife', 'entrada', 'facial', 0.2, null, null, null, null);
select 1 from _ponto_inserir(:func, null, (date '2026-10-13' + time '11:00') at time zone 'America/Recife', 'saida', 'facial', 0.2, null, null, null, null);
select 1 from _ponto_inserir(:func, null, (date '2026-10-13' + time '12:00') at time zone 'America/Recife', 'entrada', 'facial', 0.2, null, null, null, null);
select id as dup from registros_ponto where funcionario_id = :func and data = '2026-10-13' and to_char(momento at time zone 'America/Recife','HH24:MI') = '07:02' \gset
select count(*) as total_antes from registros_ponto \gset
set role authenticated;

select pg_temp.como(:rh);
select pg_temp.confere((select incompleto from espelho_ponto(:func, '2026-10-13', '2026-10-13')), 'dia com marcação duplicada e sem saída aparece incompleto');

select pg_temp.como(:enc);
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-10-13', array[%s]::bigint[], '[]', 'Duplicada')$$, :func, :dup), 'Apenas o RH');
select pg_temp.como(:eng);
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-10-13', array[%s]::bigint[], '[]', 'Duplicada')$$, :func, :dup), 'Apenas o RH');

select pg_temp.como(:rh);
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-10-13', array[%s]::bigint[], '[]', 'x')$$, :func, :dup), 'Justifique');
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-10-13', '{}', '[]', 'Sem nada a corrigir')$$, :func), 'Nada a corrigir');
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-09-14', '{}', '[{"hora":"16:00","tipo":"saida"}]', 'Mês já fechado')$$, :func), 'já foi fechada');
select pg_temp.espera_erro(format($$select ponto_corrigir_dia(%L, '2026-10-13', '{}', '[{"hora":"16:00","tipo":"x"}]', 'Tipo inválido')$$, :func), 'entrada ou saída');
select ponto_corrigir_dia(:func, '2026-10-13', array[:dup]::bigint[], '[{"hora":"16:00","tipo":"saida"}]',
  'Entrada repetida no tablet e saída esquecida — confirmado pelo encarregado');
select pg_temp.confere((select not incompleto and trabalhado_min = 480 from espelho_ponto(:func, '2026-10-13', '2026-10-13')),
  'após a correção o dia fecha 8h trabalhadas');
select pg_temp.confere((select count(*) from espelho_ponto(:func, '2026-10-13', '2026-10-13') e, jsonb_array_elements(e.marcacoes) m where m ? 'x') = 1,
  'marcação desconsiderada continua visível no espelho (riscada)');
reset role;
select pg_temp.confere((select count(*) from registros_ponto) = :total_antes + 1, 'original preservado: nenhuma marcação apagada, só incluída a correção');
select pg_temp.espera_erro(format($$delete from ponto_desconsideracoes where registro_id = %s$$, :dup), 'Exclusão não permitida');
set role authenticated;

-- link do funcionário
select pg_temp.como(:enc);
select pg_temp.espera_erro(format($$select ponto_link_gerar(%L)$$, :func), 'Apenas o RH');
select pg_temp.como(:rh);
select ponto_link_gerar(:func) as tk1 \gset
select ponto_link_gerar(:func) as tk \gset
select pg_temp.confere(length(:'tk') = 64 and :'tk' <> :'tk1', 'link pessoal gerado (novo link desativa o anterior)');

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.espera_erro(format($$select espelho_publico(%L, '2026-10-01')$$, :'tk1'), 'Link inválido');
select pg_temp.espera_erro($$select espelho_publico('abc', '2026-10-01')$$, 'Link inválido');
select pg_temp.espera_erro(format($$select * from espelho_ponto(%L, '2026-10-01', '2026-10-31')$$, :func), 'permission denied');
select pg_temp.espera_erro($$select * from registros_ponto$$, 'permission denied');
select pg_temp.confere((select (espelho_publico(:'tk', '2026-10-01')->'funcionario'->>'nome') is not null), 'funcionário abre o próprio espelho pelo link, sem login');
select pg_temp.confere((select (d->>'trabalhado_min')::int = 480 from jsonb_array_elements(espelho_publico(:'tk', '2026-10-01')->'dias') d where d->>'data' = '2026-10-13'),
  'espelho do funcionário mostra o dia já corrigido');
select pg_temp.confere((select not (espelho_publico(:'tk', '2026-10-01')::text like '%"id":%')), 'link não expõe identificadores internos');
select pg_temp.confere((espelho_publico(:'tk', '2026-09-01')->>'fechada')::boolean, 'funcionário vê que a folha de setembro está fechada');
select pg_temp.espera_erro(format($$select ponto_contestar(%L, current_date + 1, 'Dia futuro')$$, :'tk'), 'últimos 90 dias');
select pg_temp.espera_erro(format($$select ponto_contestar(%L, current_date - 1, 'x')$$, :'tk'), 'Explique');
select ponto_contestar(:'tk', '2026-10-15', 'Entrei às 7h e o tablet não registrou minha entrada');
select pg_temp.confere(jsonb_array_length(espelho_publico(:'tk')->'pedidos') = 1, 'funcionário acompanha o pedido de correção');

set role authenticated;
select pg_temp.como(:rh);
select pg_temp.confere((select count(*) from notificacoes where tipo = 'ponto_contestacao' and usuario_id = :rh) = 1, 'RH avisado do pedido de correção');
select id as cont from ponto_contestacoes where status = 'aberta' \gset
select ponto_corrigir_dia(:func, '2026-10-15', '{}', '[{"hora":"07:00","tipo":"entrada"}]', 'Entrada confirmada pelo encarregado', :'cont');
select pg_temp.confere((select status = 'corrigida' and resposta is not null from ponto_contestacoes where id = :'cont'), 'pedido marcado como corrigido junto com a correção');
select pg_temp.espera_erro(format($$select ponto_contestacao_responder(%L, 'indeferida', 'Já respondido')$$, :'cont'), 'já respondido');

select ponto_link_revogar(:func);
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.espera_erro(format($$select espelho_publico(%L)$$, :'tk'), 'Link inválido');
set role authenticated;
select pg_temp.como(:enc);
select pg_temp.confere((select count(*) from funcionario_acessos) = 0, 'encarregado não vê os links de acesso');
reset role;
\echo ''
\echo '=========== TESTES DE PONTO NO RH PASSARAM ==========='
