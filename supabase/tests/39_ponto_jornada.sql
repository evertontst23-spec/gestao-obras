\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
-- TESTE: jornada compensada (seg–qui 9h, sex 8h), escala 12h e dia não lançado
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update dp_parametros set ponto_inicio = '2026-11-03', compensa_sabado = true, falta_so_dia_lancado = true, jornada_sabado_horas = 0;
insert into obras (codigo, nome) values ('TJ-01', 'TESTE Jornada') returning id as ob \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE J Servente', 1800, 8) returning id as f8 \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE J Vigia', 1810, 12) returning id as f12 \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE J Ana', :'f8', :'ob', '2026-11-01') returning id as a \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE J Vig', :'f12', :'ob', '2026-11-01') returning id as v \gset
create or replace function pg_temp.bate(f uuid, d date, h text, t text) returns void language sql as
$$ select 1 from _ponto_inserir(f, null, (d + h::time) at time zone 'America/Recife', t, 'manual', null, null, null, null, 'lançamento manual') $$;
-- ter 03/11: 07–12 / 13–17 = 9h (sem HE)
select pg_temp.bate(:'a','2026-11-03','07:00','entrada'), pg_temp.bate(:'a','2026-11-03','12:00','saida'), pg_temp.bate(:'a','2026-11-03','13:00','entrada'), pg_temp.bate(:'a','2026-11-03','17:00','saida');
-- sex 06/11: 07–12 / 13–17 = 9h → 1h extra
select pg_temp.bate(:'a','2026-11-06','07:00','entrada'), pg_temp.bate(:'a','2026-11-06','12:00','saida'), pg_temp.bate(:'a','2026-11-06','13:00','entrada'), pg_temp.bate(:'a','2026-11-06','17:00','saida');
-- vigia: 12h no dia 04/11, folga 05/11
select pg_temp.bate(:'v','2026-11-04','07:00','entrada'), pg_temp.bate(:'v','2026-11-04','19:00','saida');
create temp table e as select * from _espelho_ponto(:'a', '2026-11-03', '2026-11-06');
select pg_temp.confere((select he_util_min = 0 and atraso_min = 0 and previsto_min = 540 from e where data = '2026-11-03'), 'terça com 9h: sem hora extra');
select pg_temp.confere((select falta from e where data = '2026-11-04'), 'quarta sem marcação, com a obra lançada no dia (vigia bateu): falta');
select pg_temp.confere((select not falta and atraso_min = 0 from e where data = '2026-11-05'), 'quinta sem ninguém da obra lançado: nem falta nem atraso');
select pg_temp.confere((select he_util_min = 60 and previsto_min = 480 from e where data = '2026-11-06'), 'sexta com 9h: 1h extra');
create temp table ev as select * from _espelho_ponto(:'v', '2026-11-04', '2026-11-06');
select pg_temp.confere((select he_util_min = 0 and previsto_min = 720 from ev where data = '2026-11-04'), 'vigia 12h no plantão: sem hora extra');
select pg_temp.confere((select not falta and previsto_min = 0 from ev where data = '2026-11-06'), 'folga do vigia não é falta');
update dp_parametros set ponto_inicio = '2000-01-01', compensa_sabado = false, falta_so_dia_lancado = false;
-- folha proporcional: admitida em 01/11 (mês cheio) x admitido em 05/11 (26 dias)
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE J Novo', :'f8', :'ob', '2026-11-05') returning id as nv \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
create temp table fp as select * from folha_previa('2026-11-01', :'ob');
select pg_temp.confere((select bruto + desconto_faltas + desconto_atrasos - he_util_valor - he_100_valor - dsr_he = 1560.00 from fp where funcionario_id = :'nv'), 'admitido em 05/11: 26 dias × 1800 ÷ 30 = R$ 1.560,00');
