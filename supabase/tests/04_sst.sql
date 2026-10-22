-- =====================================================================
-- TESTE: SST — biometria com consentimento, ponto facial/manual, EPI, DDS, OS
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
-- rosto "sintético": 128 posições
create or replace function pg_temp.rosto(base real, ruido real default 0) returns real[] language sql as
$$ select array_agg(base + (i % 7) * 0.01 + ruido) from generate_series(1,128) i $$;
grant execute on all functions in schema pg_temp to authenticated;
set role authenticated;
\set obra '\'10000000-0000-0000-0000-000000000001\''
\set jose '\'f1000000-0000-0000-0000-000000000001\''

-- ---------------------------------------------------------------- BIOMETRIA (LGPD)
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select biometria_cadastrar(%L, pg_temp.rosto(0.1), true, 'termo')$$, :jose), 'Apenas RH');
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.espera_erro(format($$select biometria_cadastrar(%L, pg_temp.rosto(0.1), false, 'termo')$$, :jose), 'consentimento');
select biometria_cadastrar(:jose, pg_temp.rosto(0.1), true, 'Autorizo o uso da minha biometria facial exclusivamente para registro de ponto e EPI.');
select pg_temp.confere((select biometria_cadastrada from v_funcionarios where id = :jose), 'biometria cadastrada com termo de consentimento');
reset role;
insert into funcionarios (id, nome, cpf, funcao_id, obra_id) values ('f1000000-0000-0000-0000-000000000002','TESTE Maria Servente','222.222.222-22','f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.espera_erro($$select biometria_cadastrar('f1000000-0000-0000-0000-000000000002', pg_temp.rosto(0.1, 0.001), true, 'termo')$$, 'outro funcionário');
select biometria_cadastrar('f1000000-0000-0000-0000-000000000002', pg_temp.rosto(0.9), true, 'termo');

-- ---------------------------------------------------------------- PONTO
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro($$select face_descritor from funcionarios$$, 'permission denied');
select pg_temp.confere((ponto_registrar_facial(pg_temp.rosto(0.5))->>'reconhecido')::boolean = false, 'rosto desconhecido não registra ponto');
select ponto_registrar_facial(pg_temp.rosto(0.1, 0.002), :obra, -8.05, -34.9, 12) as r1 \gset
select pg_temp.confere((:'r1'::jsonb->>'tipo') = 'entrada' and (:'r1'::jsonb->>'nome') like 'TESTE José%', 'reconhece o rosto e registra ENTRADA');
select pg_temp.confere((ponto_registrar_facial(pg_temp.rosto(0.1, 0.003))->>'duplicado')::boolean, 'batida repetida em 2 min é ignorada');
select pg_temp.confere((select count(*) from registros_ponto where funcionario_id = :jose) = 1, 'apenas um registro gravado');
select pg_temp.espera_erro(format($$select ponto_registrar_manual(%L, now() - interval '9 hours', 'entrada', 'esqueceu')$$, :jose), 'Lançamento manual');
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.espera_erro(format($$select ponto_registrar_manual(%L, now() - interval '1 hour', 'saida', '')$$, :jose), 'Justifique');
select ponto_registrar_manual(:jose, now() - interval '1 minute', 'saida', 'Câmera do tablet sem bateria');
select pg_temp.confere((select count(*) from registros_ponto where hash_anterior is not null) >= 1, 'registros encadeados por hash');
reset role;
select pg_temp.espera_erro($$update registros_ponto set momento = now()$$, 'imutáveis');
set role authenticated;

-- ---------------------------------------------------------------- EPI
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into insumos (id, codigo, descricao, unidade, categoria, ca, ca_validade, vida_util_dias) values
 ('e1000000-0000-0000-0000-000000000010','EPI-CAP','Capacete','un','EPI','31469', current_date + 300, 730),
 ('e1000000-0000-0000-0000-000000000011','EPI-LUV','Luva de raspa','par','EPI','36182', current_date + 300, 15),
 ('e1000000-0000-0000-0000-000000000012','EPI-VEN','Óculos CA vencido','un','EPI','999', current_date - 1, 90);
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select estoque_lancar(null, 'e1000000-0000-0000-0000-000000000010', 'entrada', 10, 'inventário');
select estoque_lancar(null, 'e1000000-0000-0000-0000-000000000011', 'entrada', 20, 'inventário');
select estoque_lancar(null, 'e1000000-0000-0000-0000-000000000012', 'entrada', 5, 'inventário');
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select pg_temp.espera_erro(format($$select epi_registrar_entrega(%L, null, '[{"insumo_id":"e1000000-0000-0000-0000-000000000012","quantidade":1}]', 'admissao', 'assinatura', 'sst/a.png')$$, :jose), 'vencido');
select pg_temp.espera_erro(format($$select epi_registrar_entrega(%L, null, '[{"insumo_id":"e1000000-0000-0000-0000-000000000010","quantidade":1}]', 'admissao', 'assinatura', null)$$, :jose), 'assinatura');
select pg_temp.espera_erro(format($$select epi_registrar_entrega(%L, null, '[{"insumo_id":"e1000000-0000-0000-0000-000000000010","quantidade":1}]', 'admissao', 'facial', null, pg_temp.rosto(0.9))$$, :jose), 'não confere');
select epi_registrar_entrega(:jose, null, '[{"insumo_id":"e1000000-0000-0000-0000-000000000010","quantidade":1},{"insumo_id":"e1000000-0000-0000-0000-000000000011","quantidade":2}]'::jsonb,
  'admissao', 'facial', null, pg_temp.rosto(0.1, 0.001)) as ent \gset
select pg_temp.confere(saldo_estoque('e1000000-0000-0000-0000-000000000011', null) = 18, 'entrega de EPI baixa o estoque');
select pg_temp.confere((select proxima_troca = current_date + 15 from epi_entrega_itens where entrega_id = :'ent' and insumo_id = 'e1000000-0000-0000-0000-000000000011'), 'próxima troca calculada pela vida útil');
select pg_temp.confere((select length(hash) = 64 from epi_entregas where id = :'ent'), 'ficha de EPI com hash SHA-256');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.confere((select count(*) from v_epi_situacao where funcionario_id = :jose) = 2, 'encarregado da obra consulta a situação de EPI da equipe');

-- ---------------------------------------------------------------- DDS
select pg_temp.confere((select count(*) from equipe_da_obra(:obra)) = 2, 'encarregado lista a equipe da obra (sem dados pessoais)');
select pg_temp.espera_erro(format($$select dds_registrar(%L, current_date, '07:00', 15, 'Trabalho em altura', null, 'Canteiro', '{}'::uuid[])$$, :obra), 'participantes');
select dds_registrar(:obra, current_date, '07:00', 15, 'Trabalho em altura — NR-35', 'Uso do cinto e ancoragem', 'Canteiro',
                     array[:jose, 'f1000000-0000-0000-0000-000000000002']::uuid[]) as dds \gset
select pg_temp.confere((select count(*) from dds_presencas where dds_id = :'dds') = 2, 'DDS com lista de presença');
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
select pg_temp.espera_erro(format($$select dds_registrar(%L, current_date, null, 10, 'Tema', null, null, array[%L]::uuid[])$$, :obra, :jose), 'Sem permissão');

-- ---------------------------------------------------------------- ORDEM DE SERVIÇO
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select os_emitir(%L, 'Alvenaria', '{Queda}', 'x', '{Capacete}', null, null)$$, :jose), 'Segurança do Trabalho');
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select os_emitir(:jose, 'Execução de alvenaria em pavimentos superiores', '{Queda de nível,Poeira}', 'Guarda-corpo e andaime NR-18', '{Capacete,Luva,Cinto paraquedista}', 'Proibido trabalhar sem ancoragem', 'Acionar o encarregado e o SAMU 192') as os1 \gset
select os_emitir(:jose, 'Execução de alvenaria — revisão', '{Queda de nível}', 'x', '{Capacete}', null, null) as os2 \gset
select pg_temp.confere((select substituida from ordens_servico where id = :'os1'), 'nova OS substitui a anterior (histórico mantido)');
select os_registrar_ciencia(:'os2', 'sst/os/ass.png');
select pg_temp.espera_erro(format($$select os_registrar_ciencia(%L, 'sst/x.png')$$, :'os2'), 'já registrada');

reset role;
select pg_temp.espera_erro($$delete from epi_entregas$$, 'Exclusão não permitida');
\echo ''
\echo '=========== TESTES DE SST PASSARAM ==========='
