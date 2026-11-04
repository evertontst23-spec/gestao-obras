-- =====================================================================
-- TESTE: ficha de inscrição online → banco de espera, aviso no sino e contratação com documentos
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

-- o site público chama sem login
select pg_temp.como('');
set role anon;
select ficha_enviar('{"protocolo":"CAD-261104-AB12","nome":"teste  josé da   silva","celular":"(81) 98888-1111","cpf":"529.982.247-25",
  "funcao":"Servente / Ajudante","obra":"Praça da Foice","bota":"41","calca":"42","camisa":"G","emerg_nome":"Maria","emerg_parentesco":"Mãe",
  "emerg_tel":"(81) 97777-0000","banco":"Caixa","pix":"52998224725","vt":"Sim","carteira":"Não","filhos_menores_14":"1","aceite":true,
  "campo_estranho":"x",
  "documentos":{"rosto":"ficha/CAD-261104-AB12/rosto-abc1.jpg","docFrente":"ficha/CAD-261104-AB12/docFrente-abc2.jpg","curriculo":"ficha/CAD-261104-AB12/curriculo-abc3.pdf"}}'::jsonb) as prot \gset
reset role;
select pg_temp.confere(:'prot' = 'CAD-261104-AB12', 'ficha enviada sem login devolve o protocolo');
select pg_temp.confere((select nome = 'teste josé da silva' and origem = 'ficha' and obra_pretendida = 'Praça da Foice' and status = 'aguardando'
  and ficha->>'bota' = '41' and not (ficha ? 'campo_estranho') and documentos->>'rosto' like 'ficha/%' from espera_candidatos where protocolo = 'CAD-261104-AB12'),
  'ficha entra no banco de espera com dados, documentos e sem campos desconhecidos');
select pg_temp.confere((select count(*) = 2 from notificacoes where chave = 'ficha:CAD-261104-AB12'
  and usuario_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1') and tipo = 'ficha_nova'),
  'aviso no sino para a diretoria e o RH');
select pg_temp.confere((select count(*) = 0 from notificacoes where chave = 'ficha:CAD-261104-AB12'
  and usuario_id not in (select id from perfis where papel in ('admin', 'rh'))), 'outros perfis não recebem o aviso da ficha');

set role anon;
select pg_temp.confere(ficha_enviar('{"protocolo":"CAD-261104-AB12","nome":"TESTE Outro Nome","celular":"81 90000-0000","aceite":true,"documentos":{"rosto":"ficha/CAD-261104-AB12/rosto-x.jpg"}}'::jsonb) = 'CAD-261104-AB12', 'reenvio do mesmo protocolo não duplica');
select pg_temp.espera_erro($$select ficha_enviar('{"protocolo":"CAD-261104-ZZ99","nome":"TESTE Sem Foto","celular":"81 91111-2222","aceite":true,"documentos":{}}'::jsonb)$$, 'foto do rosto');
select pg_temp.espera_erro($$select ficha_enviar('{"protocolo":"CAD-261104-ZZ98","nome":"TESTE Caminho Ruim","celular":"81 91111-2223","aceite":true,"documentos":{"rosto":"rh/qualquer/rosto-a.jpg"}}'::jsonb)$$, 'Documento inválido');
select pg_temp.espera_erro($$select ficha_enviar('{"protocolo":"CAD-261104-ZZ97","nome":"TESTE Sem Aceite","celular":"81 91111-2224","documentos":{"rosto":"ficha/CAD-261104-ZZ97/rosto-a.jpg"}}'::jsonb)$$, 'autorização');
select pg_temp.espera_erro($$select ficha_enviar('{"protocolo":"x","nome":"TESTE Protocolo","celular":"81 91111-2225","aceite":true}'::jsonb)$$, 'Protocolo');
select pg_temp.confere((select count(*) = 0 from espera_candidatos), 'site público não consegue ler o banco de espera');
-- mesmo celular com outro protocolo: atualiza o cadastro existente
select ficha_enviar('{"protocolo":"CAD-261105-CD34","nome":"TESTE José da Silva","celular":"81988881111","funcao":"Pedreiro","aceite":true,
  "documentos":{"rosto":"ficha/CAD-261105-CD34/rosto-z9.jpg"}}'::jsonb) \gset
reset role;
select pg_temp.confere((select count(*) = 1 from espera_candidatos where regexp_replace(celular, '\D', '', 'g') = '81988881111'), 'mesmo celular não duplica no banco de espera');
select pg_temp.confere((select protocolo = 'CAD-261105-CD34' and funcao_pretendida = 'Pedreiro' and observacoes like '%Reenviou a ficha%' from espera_candidatos where regexp_replace(celular, '\D', '', 'g') = '81988881111'),
  'reenvio com outro protocolo atualiza a ficha e registra nas observações');
select pg_temp.confere((select titulo like 'Ficha reenviada:%' from notificacoes where chave = 'ficha:CAD-261105-CD34' limit 1), 'reenvio também avisa no sino');

-- arquivos: site público só envia na pasta da ficha
set role anon;
insert into storage.objects (bucket_id, name) values ('anexos', 'ficha/CAD-261105-CD34/rosto-z9.jpg');
select pg_temp.espera_erro($$insert into storage.objects (bucket_id, name) values ('anexos', 'rh/abc/foto.jpg')$$, 'row-level security');
select pg_temp.espera_erro($$insert into storage.objects (bucket_id, name) values ('anexos', 'ficha/CAD-261105-CD34/../x.jpg')$$, 'row-level security');
reset role;

-- contratar leva foto, documentos e resumo da ficha
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update espera_candidatos set documentos = '{"rosto":"ficha/CAD-261105-CD34/rosto-z9.jpg","docFrente":"ficha/CAD-261105-CD34/docFrente-q1.jpg","curriculo":"ficha/CAD-261105-CD34/curriculo-q2.pdf"}',
  ficha = '{"bota":"41","calca":"42","camisa":"G","emerg_nome":"Maria","emerg_parentesco":"Mãe","emerg_tel":"(81) 97777-0000","banco":"Caixa","pix":"52998224725","vt":"Sim"}'
  where protocolo = 'CAD-261105-CD34';
select espera_contratar((select id from espera_candidatos where protocolo = 'CAD-261105-CD34'), null, '10000000-0000-0000-0000-000000000001', null, current_date) as f1 \gset
select pg_temp.confere((select foto_caminho = 'ficha/CAD-261105-CD34/rosto-z9.jpg' and banco = 'Caixa' and pix = '52998224725'
  and observacoes like '%bota 41%' and observacoes like '%Emergência: Maria (Mãe)%' from funcionarios where id = :'f1'),
  'contratado já tem foto, banco/Pix, tamanhos e contato de emergência');
select pg_temp.confere((select count(*) = 2 and bool_and(caminho like 'ficha/%') and count(*) filter (where tipo = 'Currículo' and tipo_mime = 'application/pdf') = 1
  from funcionario_documentos where funcionario_id = :'f1'), 'documentos da ficha entram no dossiê');
\echo ''
