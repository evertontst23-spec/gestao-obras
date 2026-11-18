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
-- TESTE: ponto em lote pelo RH (OK = 4 marcações; falta; falta justificada; atestado)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update dp_parametros set ponto_inicio = '2026-11-03', compensa_sabado = true, falta_so_dia_lancado = true, jornada_sabado_horas = 0;
insert into obras (codigo, nome) values ('TL-01', 'TESTE Lote') returning id as ob \gset
insert into funcoes (nome, salario_base, carga_diaria_horas) values ('TESTE L Servente', 1800, 8) returning id as fs \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE L Ana', :'fs', :'ob', '2026-11-01') returning id as a \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE L Beto', :'fs', :'ob', '2026-11-01') returning id as b \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE L Caio', :'fs', :'ob', '2026-11-01') returning id as c \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE L Dani', :'fs', :'ob', '2026-11-01') returning id as d \gset
insert into funcionarios (nome, funcao_id, obra_id, data_admissao) values ('TESTE L Edu', :'fs', :'ob', '2026-11-01') returning id as e \gset
\set H '{"entrada":"07:00","saida_almoco":"12:00","volta_almoco":"13:00","largada":"17:00"}'

-- terça 10/11: Ana OK, Beto falta, Caio falta justificada, Dani atestado de 2 dias, Edu em branco
select ponto_lancar_lote('2026-11-10', jsonb_build_array(
  jsonb_build_object('funcionario_id', :'a', 'situacao', 'ok'),
  jsonb_build_object('funcionario_id', :'b', 'situacao', 'falta'),
  jsonb_build_object('funcionario_id', :'c', 'situacao', 'falta_justificada', 'obs', 'enterro do avô'),
  jsonb_build_object('funcionario_id', :'d', 'situacao', 'atestado', 'dias', 2, 'obs', 'gripe'),
  jsonb_build_object('funcionario_id', :'e', 'situacao', 'nada')), :'H') as r1 \gset
select pg_temp.confere((:'r1'::jsonb->>'ok')::int = 1 and (:'r1'::jsonb->>'falta')::int = 1
                       and (:'r1'::jsonb->>'falta_justificada')::int = 1 and (:'r1'::jsonb->>'atestado')::int = 1
                       and jsonb_array_length(:'r1'::jsonb->'pulados') = 0, 'resumo: 1 OK, 1 falta, 1 justificada, 1 atestado');
select pg_temp.confere((select count(*) = 4 and bool_and(metodo = 'manual')
                          and string_agg(tipo || ' ' || to_char(momento at time zone 'America/Recife', 'HH24:MI'), ', ' order by momento)
                              = 'entrada 07:00, saida 12:00, entrada 13:00, saida 17:00'
                        from registros_ponto where funcionario_id = :'a' and data = '2026-11-10'),
                       'OK grava as 4 marcações: entrada, saída p/ almoço, volta do almoço e largada');
select pg_temp.confere((select count(*) = 0 from registros_ponto where funcionario_id in (:'b', :'c', :'d', :'e') and data = '2026-11-10'),
                       'falta, justificada, atestado e em branco não geram marcação');
select pg_temp.confere((select trabalhado_min = 540 and not falta and atraso_min = 0 and he_util_min = 0
                        from _espelho_ponto(:'a', '2026-11-10', '2026-11-10')), 'espelho da Ana: 9h, sem falta nem hora extra');
select pg_temp.confere((select falta from _espelho_ponto(:'b', '2026-11-10', '2026-11-10')), 'espelho do Beto: falta');
select pg_temp.confere((select not falta and abonado like '%falta_justificada%' from _espelho_ponto(:'c', '2026-11-10', '2026-11-10')),
                       'espelho do Caio: falta justificada abona o dia');
select pg_temp.confere((select bool_and(not falta and abonado like '%medico%') and count(*) = 2 from _espelho_ponto(:'d', '2026-11-10', '2026-11-11')),
                       'espelho da Dani: atestado abona os 2 dias');
select pg_temp.confere((select observacoes = 'enterro do avô' from atestados where funcionario_id = :'c'), 'motivo da justificada fica guardado');

-- relançar o mesmo dia não duplica
select ponto_lancar_lote('2026-11-10', jsonb_build_array(
  jsonb_build_object('funcionario_id', :'a', 'situacao', 'ok'),
  jsonb_build_object('funcionario_id', :'c', 'situacao', 'falta_justificada', 'obs', 'de novo'),
  jsonb_build_object('funcionario_id', :'a', 'situacao', 'falta')), :'H') as r2 \gset
select pg_temp.confere((:'r2'::jsonb->>'ok')::int = 0 and jsonb_array_length(:'r2'::jsonb->'pulados') = 3
                       and (select count(*) = 4 from registros_ponto where funcionario_id = :'a' and data = '2026-11-10')
                       and (select count(*) = 1 from atestados where funcionario_id = :'c'),
                       'relançar o dia pula quem já tem marcação/abono (nada duplicado)');

-- sexta 13/11 larga às 16:00 (8h)
select ponto_lancar_lote('2026-11-13', jsonb_build_array(jsonb_build_object('funcionario_id', :'a', 'situacao', 'ok')),
  '{"entrada":"07:00","saida_almoco":"12:00","volta_almoco":"13:00","largada":"16:00"}') as r3 \gset
select pg_temp.confere((select trabalhado_min = 480 and previsto_min = 480 and atraso_min = 0 from _espelho_ponto(:'a', '2026-11-13', '2026-11-13')),
                       'sexta 07–12 / 13–16: 8h, sem atraso');

-- validações
select pg_temp.espera_erro(format($$select ponto_lancar_lote('2026-11-12', '[{"funcionario_id":"%s","situacao":"falta_justificada"}]', '{}')$$, :'b'), 'motivo');
select pg_temp.espera_erro(format($$select ponto_lancar_lote('2026-11-12', '[{"funcionario_id":"%s","situacao":"ok"}]', '{"entrada":"07:00","saida_almoco":"13:00","volta_almoco":"12:00","largada":"17:00"}')$$, :'b'), 'ordem');
select pg_temp.espera_erro(format($$select ponto_lancar_lote(hoje(), '[{"funcionario_id":"%s","situacao":"ok"}]', '{"entrada":"00:01","saida_almoco":"00:02","volta_almoco":"00:03","largada":"23:59"}')$$, :'b'), 'ainda não aconteceu');
select pg_temp.espera_erro(format($$select ponto_lancar_lote(hoje() + 1, '[{"funcionario_id":"%s","situacao":"falta"}]', '{}')$$, :'b'), 'já aconteceu');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.espera_erro(format($$select ponto_lancar_lote('2026-11-12', '[{"funcionario_id":"%s","situacao":"falta"}]', '{}')$$, :'b'), 'Apenas o RH');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update dp_parametros set ponto_inicio = '2000-01-01', compensa_sabado = false, falta_so_dia_lancado = false;
