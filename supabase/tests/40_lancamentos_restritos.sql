\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
-- TESTE: lançamentos restritos (pró-labore) — só quem está em acesso_restrito enxerga
insert into acesso_restrito (usuario_id) values ('00000000-0000-0000-0000-00000000000a');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select lancamento_criar('{"tipo":"despesa","categoria":"administrativo","descricao":"TESTE pró-labore sócio","valor":5000,"vencimento":"2026-11-19","restrito":true}'::jsonb) as lr \gset
select pg_temp.confere((select restrito from lancamentos where id = :'lr'), 'quem tem acesso cria lançamento restrito');
-- outro usuário (admin sem acesso) não cria restrito nem enxerga
update perfis set papel = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
select lancamento_criar('{"tipo":"despesa","categoria":"administrativo","descricao":"TESTE comum","valor":10,"vencimento":"2026-11-19","restrito":true}'::jsonb) as lc \gset
select pg_temp.confere((select not restrito from lancamentos where id = :'lc'), 'sem acesso, o lançamento não nasce restrito');
set role authenticated;
select pg_temp.confere(not exists (select 1 from lancamentos where id = :'lr'), 'outro admin não enxerga o lançamento restrito');
select pg_temp.confere(exists (select 1 from lancamentos where id = :'lc'), 'mas enxerga os comuns');
select pg_temp.confere(not exists (select 1 from auditoria where tabela = 'lancamentos' and registro_id = :'lr'), 'nem a auditoria dele');
reset role;
do $$ begin
  begin perform lancamento_cancelar((select id from lancamentos where descricao = 'TESTE pró-labore sócio'), 'tentativa indevida');
    raise exception 'FALHOU: outro admin cancelou lançamento restrito';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — outro admin não altera o restrito (%)', sqlerrm; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
set role authenticated;
select pg_temp.confere(exists (select 1 from lancamentos where id = :'lr'), 'quem tem acesso enxerga');
reset role;
update perfis set papel = 'compras' where id = '00000000-0000-0000-0000-00000000000b';
