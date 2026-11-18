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
-- TESTE: troca de função com data (servente → vigia noturno) e obra com vigia fixo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update dp_parametros set ponto_inicio = '2026-11-03', compensa_sabado = true, falta_so_dia_lancado = true, jornada_sabado_horas = 0;
insert into obras (codigo, nome) values ('TF-01', 'TESTE Função') returning id as ob \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE F Servente', 1800, 8) returning id as fs \gset
insert into funcoes (nome, salario_base, carga_diaria_horas, adicional_noturno_pct) values ('TESTE F Vigia diurno', 1800, 12, 0) returning id as fd \gset
insert into funcoes (nome, salario_base, carga_diaria_horas, adicional_noturno_pct) values ('TESTE F Vigia noturno', 1800, 12, 20) returning id as fn \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao, salario) values ('TESTE F Leo', :'fd', :'ob', '2026-11-09', 1810) returning id as leo \gset
\set H '{"entrada":"07:00","saida_almoco":"12:00","volta_almoco":"13:00","largada":"17:00","noturno_entrada":"18:00","noturno_saida":"06:00"}'
-- terça 10/11 lançado como dia normal; como "vigia diurno" (12h) dá 3h de atraso
select ponto_lancar_lote('2026-11-10', jsonb_build_array(jsonb_build_object('funcionario_id', :'leo', 'situacao', 'ok')), :'H') as r0 \gset
select pg_temp.confere((select atraso_min = 180 from _espelho_ponto(:'leo', '2026-11-10', '2026-11-10')), 'antes: cadastrado como vigia 12h, o dia de servente dá 3h de atraso');

-- RH: servente desde a admissão; vigia noturno a partir de 12/11
select funcao_agendar(:'leo', :'fs', '2026-11-09', 'trabalhando como servente');
select funcao_agendar(:'leo', :'fn', '2026-11-12', 'passa a vigia noturno');
select pg_temp.confere((select atraso_min = 0 and previsto_min = 540 from _espelho_ponto(:'leo', '2026-11-10', '2026-11-10')),
                       'dia como servente: 9h previstas, sem atraso');
select pg_temp.confere(not _vigia_noturno(:'leo', '2026-11-11') and _vigia_noturno(:'leo', '2026-11-12'), 'vigia noturno só a partir de 12/11');
select pg_temp.confere((select funcao_id = :'fn' from funcionarios where id = :'leo'), 'data já chegou: o cadastro passa para vigia noturno');
select pg_temp.confere((select adicional_pct = 20 from funcionarios where id = :'leo'), 'ao virar vigia noturno, o cadastro recebe o adicional noturno da função');
-- plantão noturno em 12/11 usa a nova função
select ponto_lancar_lote('2026-11-12', jsonb_build_array(jsonb_build_object('funcionario_id', :'leo', 'situacao', 'ok')), :'H') as r1 \gset
select pg_temp.confere((select string_agg(tipo || ' ' || to_char(momento at time zone 'America/Recife', 'DD/MM HH24:MI'), ', ' order by momento)
                          = 'entrada 12/11 18:00, saida 13/11 06:00' from registros_ponto where funcionario_id = :'leo' and data >= '2026-11-12'),
                       'no dia da troca o lote já lança plantão noturno');
select pg_temp.confere((select trabalhado_min = 720 and atraso_min = 0 from _espelho_ponto(:'leo', '2026-11-12', '2026-11-12'))
                       and (select atraso_min = 0 from _espelho_ponto(:'leo', '2026-11-10', '2026-11-10')),
                       'espelho: 12/11 com 12h de vigia e 10/11 continua como servente');
select pg_temp.confere((select funcao = 'TESTE F Servente' and carga = 8 and not noturno from funcoes_na_data(array[:'leo']::uuid[], '2026-11-11'))
                       and (select noturno from funcoes_na_data(array[:'leo']::uuid[], '2026-11-12')),
                       'telas de ponto: em 11/11 ele aparece como servente e em 12/11 como vigia noturno');

-- troca futura não muda o cadastro antes da hora
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE F Ana', :'fs', :'ob', '2026-11-01') returning id as ana \gset
select funcao_agendar(:'ana', :'fn', hoje() + 3, 'futura');
select pg_temp.confere((select funcao_id = :'fs' from funcionarios where id = :'ana')
                       and (select count(*) = 2 from funcao_historico where funcionario_id = :'ana'),
                       'troca futura fica agendada (e guarda a função anterior desde a admissão)');
select pg_temp.confere(aplicar_trocas_funcao() = 0, 'rotina diária não troca antes da data');

-- só o RH
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.espera_erro(format($$select funcao_agendar('%s', '%s', '2026-11-20', 'x')$$, :'ana', :'fs'), 'Apenas o RH');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.espera_erro(format($$select funcao_agendar('%s', '%s', '2026-10-01', 'x')$$, :'ana', :'fs'), 'admissão');

-- obra com vigia fixo
select pg_temp.confere((select not vigia_todo_dia from obras where id = :'ob'), 'obra comum: vigia em escala 12x36 (padrão)');
update dp_parametros set ponto_inicio = '2000-01-01', compensa_sabado = false, falta_so_dia_lancado = false;
