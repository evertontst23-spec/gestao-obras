\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.confere(p_ok boolean, p_desc text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception 'FALHOU: %', p_desc; end if;
  raise notice 'ok — %', p_desc;
end $$;
-- TESTE: reembolsos (despesa com favorecido, origem 'reembolso'; só admin/financeiro)
create temp table _papel_43b as select id, papel from perfis where id = '00000000-0000-0000-0000-00000000000b';
update perfis set papel = 'almoxarifado' where id = '00000000-0000-0000-0000-00000000000b';

-- quem não é financeiro não registra
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ begin
  begin perform reembolso_criar('{"favorecido":"X","descricao":"gasolina","valor":"50","vencimento":"2026-11-20"}'::jsonb);
    raise exception 'FALHOU: almoxarifado registrou reembolso';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — só admin/financeiro registra (%)', sqlerrm; end;
end $$;

-- admin registra um reembolso em aberto
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select reembolso_criar('{"favorecido":"Fulano de Tal","descricao":"gasolina para a obra","valor":"120.50","vencimento":"2026-11-25","categoria":"xxx-invalida"}'::jsonb) as rid \gset
select pg_temp.confere((select origem='reembolso' and tipo='despesa' and favorecido='Fulano de Tal' and status='aberto'
                          and categoria='administrativo' and valor=120.50 from lancamentos where id=:'rid'),
                       'cria despesa com origem reembolso, favorecido e categoria padronizada');

-- registra um já pago
select reembolso_criar('{"favorecido":"Beltrano","descricao":"material de limpeza","valor":"80","vencimento":"2026-11-20","liquidado":true,"forma_pagamento":"PIX"}'::jsonb) as rid2 \gset
select pg_temp.confere((select status='liquidado' and liquidado_em = hoje() and forma_pagamento='PIX' from lancamentos where id=:'rid2'),
                       'registra reembolso já pago com baixa na data de hoje');

-- validações
do $$ begin
  begin perform reembolso_criar('{"descricao":"x y z","valor":"10","vencimento":"2026-11-20"}'::jsonb);
    raise exception 'FALHOU: aceitou sem favorecido';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — exige favorecido (%)', sqlerrm; end;
end $$;
do $$ begin
  begin perform reembolso_criar('{"favorecido":"X","descricao":"gas","valor":"0","vencimento":"2026-11-20"}'::jsonb);
    raise exception 'FALHOU: aceitou valor zero';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok — exige valor > 0 (%)', sqlerrm; end;
end $$;

update perfis p set papel = t.papel from _papel_43b t where p.id = t.id;
drop table _papel_43b;
