-- =====================================================================
-- TESTE: banco de espera de candidatos
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
insert into espera_candidatos (nome, celular, funcao_pretendida, cpf) values ('  TESTE  Maria   da Silva ', '(81) 99999-1234', 'Servente', '111.444.777-35') returning id as c1 \gset
select pg_temp.confere((select nome = 'TESTE Maria da Silva' and status = 'aguardando' from espera_candidatos where id = :'c1'), 'cadastra no banco de espera e arruma o nome');
select pg_temp.espera_erro($$insert into espera_candidatos (nome, celular) values ('TESTE Outra Pessoa', '81 99999-1234')$$, 'espera_celular_unico');
select pg_temp.espera_erro($$insert into espera_candidatos (nome, celular) values ('TESTE Sem DDD', '9999-12')$$, 'Celular inválido');
update espera_candidatos set status = 'chamado' where id = :'c1';
select pg_temp.confere((select contato_em is not null from espera_candidatos where id = :'c1'), 'marcar como chamado registra a data do contato');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.espera_erro(format($$select espera_contratar(%L, null, null, null, null)$$, :'c1'), 'Apenas RH');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select espera_contratar(:'c1', null, '10000000-0000-0000-0000-000000000001', null, current_date) as f1 \gset
select pg_temp.confere((select nome = 'TESTE Maria da Silva' and telefone = '(81) 99999-1234' and ativo from funcionarios where id = :'f1')
  and (select status = 'contratado' and funcionario_id = :'f1' from espera_candidatos where id = :'c1'), 'contratar cria o funcionário e marca o candidato');
select pg_temp.espera_erro(format($$select espera_contratar(%L, null, null, null, null)$$, :'c1'), 'já foi contratado');
\echo ''
\echo '=========== TESTES DO BANCO DE ESPERA PASSARAM ==========='
