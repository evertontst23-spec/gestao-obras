-- =====================================================================
-- TESTE: ficha online guarda o dia em que o trabalhador começou na obra e a contratação usa esse dia
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
grant execute on all functions in schema pg_temp to authenticated, anon;

select pg_temp.como('');
set role anon;
select ficha_enviar(jsonb_build_object('protocolo','CAD-261109-DI01','nome','TESTE Inicio Obra','celular','81 97777-1212','aceite',true,
  'data_inicio', (current_date - 6)::text, 'funcao','Pedreiro','obra','Praça Garapu',
  'documentos', jsonb_build_object('rosto','ficha/CAD-261109-DI01/rosto-a1.jpg'))) \gset
select pg_temp.espera_erro(format($$select ficha_enviar('{"protocolo":"CAD-261109-DI02","nome":"TESTE Data Futura","celular":"81 97777-1313","aceite":true,"data_inicio":"%s","documentos":{"rosto":"ficha/CAD-261109-DI02/rosto-a.jpg"}}'::jsonb)$$, (current_date + 90)::text), 'fora do normal');
select pg_temp.espera_erro($$select ficha_enviar('{"protocolo":"CAD-261109-DI03","nome":"TESTE Data Torta","celular":"81 97777-1414","aceite":true,"data_inicio":"10/11/2026","documentos":{"rosto":"ficha/CAD-261109-DI03/rosto-a.jpg"}}'::jsonb)$$, 'começou na obra');
-- ficha antiga, ainda aberta em algum celular, sem o campo: entra sem a data
select ficha_enviar('{"protocolo":"CAD-261109-DI04","nome":"TESTE Ficha Antiga","celular":"81 97777-1515","aceite":true,"documentos":{"rosto":"ficha/CAD-261109-DI04/rosto-a.jpg"}}'::jsonb) \gset
reset role;
select pg_temp.confere((select data_inicio = current_date - 6 from espera_candidatos where protocolo = 'CAD-261109-DI01'), 'ficha guarda o dia em que começou na obra');
select pg_temp.confere((select data_inicio is null from espera_candidatos where protocolo = 'CAD-261109-DI04'), 'ficha antiga sem o campo continua entrando');
select pg_temp.confere((select mensagem like '%começou em ' || to_char(current_date - 6, 'DD/MM/YYYY') || '%' from notificacoes where chave = 'ficha:CAD-261109-DI01' limit 1), 'aviso do sino mostra o dia em que começou');

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select espera_contratar((select id from espera_candidatos where protocolo = 'CAD-261109-DI01'), null, '10000000-0000-0000-0000-000000000001', null, null) as f1 \gset
select pg_temp.confere((select data_admissao = current_date - 6 and observacoes like '%começou na obra em%' from funcionarios where id = :'f1'),
  'contratação usa o dia em que começou na obra como admissão, não o dia da ficha');
select espera_contratar((select id from espera_candidatos where protocolo = 'CAD-261109-DI04'), null, '10000000-0000-0000-0000-000000000001', null, current_date - 2) as f2 \gset
select pg_temp.confere((select data_admissao = current_date - 2 from funcionarios where id = :'f2'), 'data escolhida na tela de contratar continua valendo');
\echo ''
