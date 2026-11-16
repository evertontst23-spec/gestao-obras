\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
-- TESTE: remoção lógica de documento enviado por engano (só admin/rh/seguranca; restaurável; DELETE segue bloqueado)
-- O usuário ...000a já é admin (está no conjunto permitido); usamos ...000b como o caso sem permissão.
create temp table _papel_42b as select id, papel from perfis where id = '00000000-0000-0000-0000-00000000000b';
update perfis set papel = 'almoxarifado' where id = '00000000-0000-0000-0000-00000000000b';

insert into funcionario_documentos (id, funcionario_id, tipo, caminho)
  values ('00000000-0000-0000-0000-0000000d0c01', (select id from funcionarios limit 1), 'Outro', 'rh/x/errado.jpg');

-- quem não é admin/rh/seguranca não remove
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ begin
  begin perform documento_remover('00000000-0000-0000-0000-0000000d0c01', 'x');
    raise exception 'FALHOU: almoxarifado removeu documento';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — só admin/rh/seguranca remove (%)', sqlerrm; end;
end $$;

-- admin remove, com motivo, autoria e data
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select documento_remover('00000000-0000-0000-0000-0000000d0c01', 'enviado por engano');
select pg_temp.confere((select removido and motivo_remocao = 'enviado por engano' and removido_por = '00000000-0000-0000-0000-00000000000a' and removido_em is not null
                          from funcionario_documentos where id = '00000000-0000-0000-0000-0000000d0c01'), 'remove marcando motivo, autor e data');

-- restauração limpa os campos
select documento_restaurar('00000000-0000-0000-0000-0000000d0c01');
select pg_temp.confere((select not removido and motivo_remocao is null and removido_em is null
                          from funcionario_documentos where id = '00000000-0000-0000-0000-0000000d0c01'), 'restaura e limpa os campos de remoção');

-- a exclusão física continua bloqueada
do $$ begin
  begin delete from funcionario_documentos where id = '00000000-0000-0000-0000-0000000d0c01';
    raise exception 'FALHOU: permitiu DELETE físico';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — DELETE físico segue bloqueado (%)', sqlerrm; end;
end $$;

update funcionario_documentos set removido = true where id = '00000000-0000-0000-0000-0000000d0c01';  -- esconde a linha de teste
update perfis p set papel = t.papel from _papel_42b t where p.id = t.id;  -- rodando como admin (...000a)
drop table _papel_42b;
