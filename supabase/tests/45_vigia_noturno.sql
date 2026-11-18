\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
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
-- TESTE: vigia noturno 12x36 — plantão 18h às 6h do dia seguinte
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update dp_parametros set ponto_inicio = '2026-11-03', compensa_sabado = true, falta_so_dia_lancado = true, jornada_sabado_horas = 0;
insert into obras (codigo, nome) values ('TV-01', 'TESTE Vigia') returning id as ob \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE V Vigia noturno', 1800, 12) returning id as fv \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE V Servente', 1800, 8) returning id as fs \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE V Vig', :'fv', :'ob', '2026-11-01') returning id as v \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE V Ser', :'fs', :'ob', '2026-11-01') returning id as s \gset
\set H '{"entrada":"07:00","saida_almoco":"12:00","volta_almoco":"13:00","largada":"17:00","noturno_entrada":"18:00","noturno_saida":"06:00"}'

select pg_temp.confere(_vigia_noturno(:'v') and not _vigia_noturno(:'s'), 'identifica o vigia noturno pela função');
-- segunda 09/11: plantão do vigia + servente OK
select ponto_lancar_lote('2026-11-09', jsonb_build_array(
  jsonb_build_object('funcionario_id', :'v', 'situacao', 'ok'),
  jsonb_build_object('funcionario_id', :'s', 'situacao', 'ok')), :'H') as r1 \gset
select pg_temp.confere((select string_agg(to_char(data, 'DD/MM') || ' ' || tipo || ' ' || to_char(momento at time zone 'America/Recife', 'HH24:MI'), ', ' order by momento)
                          = '09/11 entrada 18:00, 10/11 saida 06:00' from registros_ponto where funcionario_id = :'v'),
                       'plantão grava entrada 18:00 e saída 06:00 do dia seguinte');
select pg_temp.confere((select count(*) = 4 from registros_ponto where funcionario_id = :'s' and data = '2026-11-09'), 'servente no mesmo lote: 4 marcações');
select pg_temp.confere((select trabalhado_min = 720 and previsto_min = 720 and atraso_min = 0 and he_util_min = 0 and not incompleto and not falta
                        from _espelho_ponto(:'v', '2026-11-09', '2026-11-09')), 'espelho: noite de 09/11 conta 12h no dia 09, sem atraso');
select pg_temp.confere((select previsto_min = 0 and trabalhado_min = 0 and not falta and not incompleto
                        from _espelho_ponto(:'v', '2026-11-10', '2026-11-10')), 'dia 10 (saída da manhã) é folga da escala: sem falta');
select pg_temp.confere((select not falta from _espelho_ponto(:'s', '2026-11-10', '2026-11-10')),
                       'a saída do vigia não "abre" o dia 10 da obra: servente não vira falta');

-- quarta 11/11: próximo plantão; relançar 09/11 não duplica
select ponto_lancar_lote('2026-11-11', jsonb_build_array(jsonb_build_object('funcionario_id', :'v', 'situacao', 'ok')), :'H') as r2 \gset
select pg_temp.confere((select trabalhado_min = 720 and not incompleto from _espelho_ponto(:'v', '2026-11-11', '2026-11-11'))
                       and (select not falta and previsto_min = 0 from _espelho_ponto(:'v', '2026-11-12', '2026-11-12')),
                       'plantão de 11/11 conta 12h e 12/11 é folga');
select ponto_lancar_lote('2026-11-09', jsonb_build_array(jsonb_build_object('funcionario_id', :'v', 'situacao', 'ok')), :'H') as r3 \gset
select pg_temp.confere((:'r3'::jsonb->>'ok')::int = 0 and (select count(*) = 4 from registros_ponto where funcionario_id = :'v'),
                       'relançar o plantão já lançado não duplica');
-- a manhã do dia 10 não impede lançar plantão em 10/11 (só a entrada conta como "já lançado")
select ponto_lancar_lote('2026-11-10', jsonb_build_array(jsonb_build_object('funcionario_id', :'v', 'situacao', 'ok')), :'H') as r4 \gset
select pg_temp.confere((:'r4'::jsonb->>'ok')::int = 1, 'saída da manhã é do plantão anterior: dá para lançar plantão no mesmo dia');

-- plantão de hoje ainda não terminou
select pg_temp.espera_erro(format($$select ponto_lancar_lote(hoje(), '[{"funcionario_id":"%s","situacao":"ok"}]', '{"noturno_entrada":"18:00","noturno_saida":"06:00"}')$$, :'v'), 'só termina');
update dp_parametros set ponto_inicio = '2000-01-01', compensa_sabado = false, falta_so_dia_lancado = false;
