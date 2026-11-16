\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
-- TESTE: link de admissão — só admin/RH gera, o token é longo e o link pode ser revogado
create temp table _papeis_41 as select id, papel from perfis where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update perfis set papel = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);

select admissao_link_criar(array(select id from funcionarios where ativo limit 2), 15, 'TESTE admissão', 'recado') as tk \gset
select pg_temp.confere(length(:'tk') = 64, 'o token tem 64 caracteres');
select pg_temp.confere((select expira_em > now() + interval '14 days' and expira_em < now() + interval '16 days'
                          from links_admissao where token = :'tk'), 'a validade respeita os dias pedidos');
select pg_temp.confere((select array_length(funcionarios, 1) = 2 from links_admissao where token = :'tk'), 'guarda os funcionários escolhidos');

-- validações de entrada
do $$ begin
  begin perform admissao_link_criar(array[]::uuid[], 30);
    raise exception 'FALHOU: criou link sem funcionário';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — exige pelo menos um funcionário (%)', sqlerrm; end;
end $$;
do $$ begin
  begin perform admissao_link_criar(array(select id from funcionarios where ativo limit 1), 400);
    raise exception 'FALHOU: aceitou validade fora do limite';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — recusa validade acima de 180 dias (%)', sqlerrm; end;
end $$;

-- quem não é admin/RH não gera link
update perfis set papel = 'almoxarifado' where id = '00000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ begin
  begin perform admissao_link_criar(array(select id from funcionarios where ativo limit 1), 30);
    raise exception 'FALHOU: almoxarifado gerou link de admissão';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — só admin/RH gera o link (%)', sqlerrm; end;
end $$;
set role authenticated;
select pg_temp.confere(not exists (select 1 from links_admissao where token = :'tk'), 'almoxarifado não enxerga os links gerados');
reset role;

-- revogação
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select admissao_link_revogar(:'tk', 'fim da admissão');
select pg_temp.confere((select revogado_em is not null from links_admissao where token = :'tk'), 'o link fica revogado');
select pg_temp.confere((select observacao like '%Revogado: fim da admissão%' from links_admissao where token = :'tk'), 'o motivo da revogação fica registrado');

-- a lista de tipos de documento não deixa passar dado de saúde
select pg_temp.confere(not ('Atestado' = any (_tipos_admissao())) and not ('ASO' = any (_tipos_admissao()))
                       and 'CTPS' = any (_tipos_admissao()), 'o link só expõe documentos de admissão (sem atestado/ASO)');

-- devolve os papéis como estavam, para não atrapalhar os testes seguintes
update perfis p set papel = t.papel from _papeis_41 t where p.id = t.id;
drop table _papeis_41;
