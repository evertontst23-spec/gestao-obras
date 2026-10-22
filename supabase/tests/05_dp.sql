-- =====================================================================
-- TESTE: DP — espelho de ponto, HE 70%/100%, faltas, atrasos, atestados, folha
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
create or replace function pg_temp.bate(d date, h text, t text) returns void language sql as
$$ select 1 from _ponto_inserir('f1000000-0000-0000-0000-000000000001', null, (d + h::time) at time zone 'America/Recife', t, 'facial', 0.2, null, null, null, null) $$;

-- Setembro/2026 do José (pedreiro, 8h/dia, R$ 2.640)
update funcionarios set data_admissao = '2026-08-01' where id = 'f1000000-0000-0000-0000-000000000001';
select pg_temp.bate('2026-09-14','07:00','entrada'), pg_temp.bate('2026-09-14','11:00','saida'), pg_temp.bate('2026-09-14','12:00','entrada'), pg_temp.bate('2026-09-14','18:00','saida');
select pg_temp.bate('2026-09-15','07:00','entrada'), pg_temp.bate('2026-09-15','11:00','saida'), pg_temp.bate('2026-09-15','12:00','entrada'), pg_temp.bate('2026-09-15','16:05','saida');
select pg_temp.bate('2026-09-16','07:00','entrada'), pg_temp.bate('2026-09-16','11:00','saida'), pg_temp.bate('2026-09-16','12:00','entrada'), pg_temp.bate('2026-09-16','15:30','saida');
select pg_temp.bate('2026-09-19','07:00','entrada'), pg_temp.bate('2026-09-19','11:00','saida');
select pg_temp.bate('2026-09-20','07:00','entrada'), pg_temp.bate('2026-09-20','09:00','saida');
select pg_temp.bate('2026-09-07','08:00','entrada'), pg_temp.bate('2026-09-07','10:00','saida');
select pg_temp.bate('2026-09-22','07:00','entrada');   -- esqueceu a saída

grant execute on all functions in schema pg_temp to authenticated;
set role authenticated;

select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select * from espelho_ponto('f1000000-0000-0000-0000-000000000001','2026-09-01','2026-09-30')$$, 'Sem permissão');
select pg_temp.espera_erro($$select atestado_registrar('f1000000-0000-0000-0000-000000000001','medico','2026-09-17',1,null,'J11',null,null,null)$$, 'Apenas o RH');

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select atestado_registrar('f1000000-0000-0000-0000-000000000001', 'medico', '2026-09-17', 1, null, 'j11', 'Dr. Teste', null, null);
create temp table e as select * from espelho_ponto('f1000000-0000-0000-0000-000000000001','2026-09-01','2026-09-30');
select pg_temp.confere((select he_util_min = 120 from e where data = '2026-09-14'), 'jornada de 10h gera 2h de HE 70%');
select pg_temp.confere((select he_util_min = 0 and atraso_min = 0 from e where data = '2026-09-15'), '5 min a mais ficam na tolerância');
select pg_temp.confere((select atraso_min = 30 from e where data = '2026-09-16'), 'saída 30 min antes vira atraso');
select pg_temp.confere((select not falta and abonado is not null from e where data = '2026-09-17'), 'dia com atestado é abonado (não é falta)');
select pg_temp.confere((select falta from e where data = '2026-09-18'), 'dia útil sem marcação é falta');
select pg_temp.confere((select he_util_min = 240 from e where data = '2026-09-19'), 'sábado trabalhado = HE 70%');
select pg_temp.confere((select he_100_min = 120 from e where data = '2026-09-20'), 'domingo trabalhado = HE 100%');
select pg_temp.confere((select he_100_min = 120 and feriado = 'Independência' from e where data = '2026-09-07'), 'feriado trabalhado = HE 100%');
select pg_temp.confere((select incompleto from e where data = '2026-09-22'), 'marcação sem saída fica como incompleta');
select pg_temp.confere((select count(*) = 0 from e where data < '2026-08-01'), 'espelho respeita a data de admissão');

create temp table fp as select * from folha_previa('2026-09-01');
select pg_temp.confere((select valor_hora = 12 from fp where funcionario_id = 'f1000000-0000-0000-0000-000000000001'), 'valor-hora = 2.640 / 220 = R$ 12,00');
select pg_temp.confere((select he_util_h = 6 and he_util_valor = 122.40 from fp where funcionario_id = 'f1000000-0000-0000-0000-000000000001'), 'HE 70%: 6h × 12 × 1,7 = R$ 122,40');
select pg_temp.confere((select he_100_h = 4 and he_100_valor = 96 from fp where funcionario_id = 'f1000000-0000-0000-0000-000000000001'), 'HE 100%: 4h × 12 × 2 = R$ 96,00');
select pg_temp.confere((select dsr_he > 0 from fp where funcionario_id = 'f1000000-0000-0000-0000-000000000001'), 'DSR sobre horas extras calculado');
select pg_temp.confere((select desconto_atrasos = 6 from fp where funcionario_id = 'f1000000-0000-0000-0000-000000000001'), 'desconto do atraso: 0,5h × 12 = R$ 6,00');
select pg_temp.confere((select inss > 0 and liquido_estimado < bruto from fp where funcionario_id = 'f1000000-0000-0000-0000-000000000001'), 'INSS pela tabela progressiva parametrizada');

select pg_temp.espera_erro($$select folha_fechar('2026-09-01')$$, 'incompletas');
select pg_temp.confere((select cid = 'J11' from atestados limit 1), 'CID gravado (visível só para RH/diretoria)');
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.confere((select count(*) from atestados) = 0, 'Segurança do Trabalho não vê atestados com CID');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select pg_temp.confere((select count(*) from espelho_ponto('f1000000-0000-0000-0000-000000000001','2026-09-14','2026-09-14')) = 1, 'engenheiro da obra consulta o espelho');
select pg_temp.espera_erro($$select * from folha_previa('2026-09-01')$$, 'Sem permissão');

reset role;
select pg_temp.bate('2026-09-22','16:00','saida');
set role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select folha_fechar('2026-09-01') as fol \gset
select pg_temp.confere((select funcionarios >= 1 and total_he > 0 from folhas where id = :'fol'), 'folha de 09/2026 fechada com snapshot');
select pg_temp.espera_erro($$select folha_fechar('2026-09-01')$$, 'já fechada');
reset role;
select pg_temp.espera_erro($$update folhas set total_bruto = 0$$, 'imutáveis');
\echo ''
\echo '=========== TESTES DE DP PASSARAM ==========='
