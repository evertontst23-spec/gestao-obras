\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
-- TESTE: vigia no fim de semana — dia + noite (24h); o 2º turno é hora extra (70% sábado, 100% domingo)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update dp_parametros set ponto_inicio = '2026-11-03', compensa_sabado = true, falta_so_dia_lancado = true, jornada_sabado_horas = 0;
insert into obras (codigo, nome) values ('TW-01', 'TESTE Fim de semana') returning id as ob \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE W Vigia noturno', 1800, 12) returning id as fv \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE W Servente', 1800, 8) returning id as fs \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE W Vig', :'fv', :'ob', '2026-11-01') returning id as v \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE W Vig2', :'fv', :'ob', '2026-11-01') returning id as v2 \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE W Ser', :'fs', :'ob', '2026-11-01') returning id as s \gset
\set H '{"noturno_entrada":"18:00","noturno_saida":"06:00"}'

-- o mesmo vigia faz sábado 14/11 e domingo 15/11 inteiros — lançados fora de ordem (domingo antes)
select ponto_lancar_lote('2026-11-15', jsonb_build_array(jsonb_build_object('funcionario_id', :'v', 'situacao', 'ok24')), :'H') as r1 \gset
select ponto_lancar_lote('2026-11-14', jsonb_build_array(jsonb_build_object('funcionario_id', :'v', 'situacao', 'ok24')), :'H') as r2 \gset
select pg_temp.confere((:'r2'::jsonb->>'plantao_24h')::int = 1
                       and (select count(*) = 8 from registros_ponto where funcionario_id = :'v'),
                       '24h grava 4 marcações por dia (06:00, 18:00, 18:00 e 06:00 do dia seguinte)');
create temp table e as select * from _espelho_ponto(:'v', '2026-11-14', '2026-11-16');
select pg_temp.confere((select trabalhado_min = 1440 and previsto_min = 720 and he_util_min = 720 and he_100_min = 0 and not incompleto from e where data = '2026-11-14'),
                       'sábado 24h: 12h normais + 12h de hora extra 70%');
select pg_temp.confere((select trabalhado_min = 1440 and previsto_min = 720 and he_100_min = 720 and he_util_min = 0 and not incompleto from e where data = '2026-11-15'),
                       'domingo 24h: 12h normais + 12h de hora extra 100% (lançado antes do sábado e mesmo assim certo)');
select pg_temp.confere((select trabalhado_min = 0 and previsto_min = 0 and not falta and not incompleto from e where data = '2026-11-16'),
                       'segunda: só a saída das 06:00 (fim do domingo) — folga, sem falta');

-- domingo com plantão normal de 12h (só a noite): sem hora extra
select ponto_lancar_lote('2026-11-08', jsonb_build_array(jsonb_build_object('funcionario_id', :'v2', 'situacao', 'ok')), :'H') as r3 \gset
select pg_temp.confere((select trabalhado_min = 720 and he_100_min = 0 from _espelho_ponto(:'v2', '2026-11-08', '2026-11-08')),
                       'domingo com plantão normal de 12h: sem hora extra');
-- servente trabalhando no domingo continua 100%
select 1 from _ponto_inserir(:'s', null, ('2026-11-15'::date + '07:00'::time) at time zone 'America/Recife', 'entrada', 'manual', null, null, null, null, 'domingo extra'),
              (select 1) x, _ponto_inserir(:'s', null, ('2026-11-15'::date + '11:00'::time) at time zone 'America/Recife', 'saida', 'manual', null, null, null, null, 'domingo extra') y;
select pg_temp.confere((select he_100_min = 240 from _espelho_ponto(:'s', '2026-11-15', '2026-11-15')), 'servente no domingo: todas as horas a 100% (como antes)');

-- 24h é só para vigia
select ponto_lancar_lote('2026-11-14', jsonb_build_array(jsonb_build_object('funcionario_id', :'s', 'situacao', 'ok24')), :'H') as r4 \gset
select pg_temp.confere(:'r4'::jsonb->'pulados'->0->>'motivo' = 'plantão de 24h é só para vigia', 'servente não pode receber plantão de 24h');
update dp_parametros set ponto_inicio = '2000-01-01', compensa_sabado = false, falta_so_dia_lancado = false;
