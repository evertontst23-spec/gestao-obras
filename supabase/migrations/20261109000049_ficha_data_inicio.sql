-- =====================================================================
-- 0049 — Ficha online: dia em que o trabalhador COMEÇOU na obra
--  Tem gente que começa num dia e só preenche a ficha depois. A ficha agora pergunta,
--  logo na primeira tela, o dia em que ele começou; a contratação usa esse dia como admissão
--  (e não o dia do preenchimento).
-- =====================================================================
alter table espera_candidatos add column data_inicio date;

create or replace function ficha_enviar(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prot  text := p->>'protocolo';
  v_nome  text := regexp_replace(trim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  v_cel   text := trim(coalesce(p->>'celular', ''));
  v_cpf   text := nullif(trim(coalesce(p->>'cpf', '')), '');
  v_func  text := nullif(left(trim(coalesce(p->>'funcao', '')), 60), '');
  v_obra  text := nullif(left(trim(coalesce(p->>'obra', '')), 60), '');
  v_docs  jsonb := coalesce(p->'documentos', '{}'::jsonb);
  v_inicio date;
  v_ficha jsonb;
  v_id    uuid;
  v_reenvio boolean := false;
  k text; v text;
begin
  if v_prot is null or v_prot !~ '^CAD-[0-9]{6}-[A-Z0-9]{4}$' then raise exception 'Protocolo da ficha inválido'; end if;
  if exists (select 1 from espera_candidatos where protocolo = v_prot) then return v_prot; end if;  -- reenvio do mesmo envio
  if length(v_nome) < 5 or array_length(regexp_split_to_array(v_nome, ' '), 1) < 2 then raise exception 'Informe o nome completo'; end if;
  if length(v_nome) > 120 then raise exception 'Nome muito longo'; end if;
  if length(regexp_replace(v_cel, '\D', '', 'g')) not between 10 and 13 then raise exception 'Celular inválido: informe DDD e número'; end if;
  if v_cpf is not null and v_cpf !~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$' then raise exception 'CPF inválido'; end if;
  if coalesce((p->>'aceite')::boolean, false) is not true then raise exception 'É preciso aceitar a autorização da ficha'; end if;
  -- a ficha nova sempre manda; quem ainda estava com a versão antiga aberta no celular manda sem
  if nullif(p->>'data_inicio', '') is not null then
    if p->>'data_inicio' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Informe o dia em que começou na obra'; end if;
    v_inicio := (p->>'data_inicio')::date;
    if v_inicio > hoje() + 60 or v_inicio < hoje() - 365 then raise exception 'Data de início na obra fora do normal: confira o dia'; end if;
  end if;
  if jsonb_typeof(v_docs) <> 'object' then raise exception 'Documentos inválidos'; end if;
  for k, v in select key, value from jsonb_each_text(v_docs) loop
    if k not in ('rosto', 'docFrente', 'docVerso', 'residencia', 'ctps', 'cpfDoc', 'curriculo') or not _ficha_caminho_ok(v, v_prot) then
      raise exception 'Documento inválido na ficha';
    end if;
  end loop;
  if not (v_docs ? 'rosto') then raise exception 'Falta a foto do rosto'; end if;
  -- trava contra envio em massa
  if (select count(*) from espera_candidatos where origem = 'ficha' and ficha_em > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitas fichas em pouco tempo. Tente de novo em alguns minutos.';
  end if;

  -- só os campos conhecidos, cada um com no máximo 120 caracteres
  select coalesce(jsonb_object_agg(key, left(value, 120)), '{}'::jsonb) into v_ficha
  from jsonb_each_text(p)
  where key in ('sexo', 'raca_cor', 'estado_civil', 'escolaridade', 'filhos_menores_14', 'deficiencia',
                'bota', 'calca', 'camisa', 'emerg_nome', 'emerg_parentesco', 'emerg_tel', 'banco', 'pix', 'vt', 'carteira')
    and nullif(trim(value), '') is not null;

  -- o mesmo celular não entra duas vezes: quem reenviar a ficha atualiza o cadastro que já existe
  select id into v_id from espera_candidatos
  where regexp_replace(celular, '\D', '', 'g') = regexp_replace(v_cel, '\D', '', 'g') for update;
  if found then
    v_reenvio := true;
    update espera_candidatos set
      nome = v_nome, cpf = coalesce(v_cpf, cpf), funcao_pretendida = coalesce(v_func, funcao_pretendida),
      obra_pretendida = coalesce(v_obra, obra_pretendida), origem = 'ficha', protocolo = v_prot, data_inicio = v_inicio,
      ficha = v_ficha, documentos = v_docs, ficha_em = now(),
      observacoes = concat_ws(E'\n', nullif(observacoes, ''), 'Reenviou a ficha em ' || to_char(now() at time zone 'America/Recife', 'DD/MM/YYYY') || ' (' || v_prot || ')')
    where id = v_id;
  else
    insert into espera_candidatos (nome, celular, cpf, funcao_pretendida, obra_pretendida, origem, protocolo, ficha, documentos, ficha_em, data_inicio, criado_por)
    values (v_nome, v_cel, v_cpf, v_func, v_obra, 'ficha', v_prot, v_ficha, v_docs, now(), v_inicio, null)
    returning id into v_id;
  end if;

  perform _notificar_papeis(array['admin', 'rh'], 'ficha_nova',
    case when v_reenvio then 'Ficha reenviada: ' else 'Nova ficha: ' end || v_nome,
    concat_ws(' • ', coalesce(v_func, 'função não informada'), coalesce(v_obra, 'obra não informada'), 'começou em ' || to_char(v_inicio, 'DD/MM/YYYY'), v_cel),
    '/cadastros/espera?sit=todos&q=' || regexp_replace(v_cel, '\D', '', 'g'),
    'ficha:' || v_prot);
  return v_prot;
end $$;
revoke execute on function ficha_enviar(jsonb) from public;
grant execute on function ficha_enviar(jsonb) to anon, authenticated;

create or replace function espera_contratar(p_id uuid, p_funcao uuid, p_obra uuid, p_empregador uuid, p_admissao date)
returns uuid language plpgsql security definer set search_path = public as $$
declare c espera_candidatos; v_func uuid; v_resumo text; k text; v text; v_banco text;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria contratam'; end if;
  select * into c from espera_candidatos where id = p_id for update;
  if not found then raise exception 'Candidato não encontrado'; end if;
  if c.status = 'contratado' then raise exception 'Este candidato já foi contratado'; end if;
  if c.cpf is not null and exists (select 1 from funcionarios where regexp_replace(cpf, '\D', '', 'g') = regexp_replace(c.cpf, '\D', '', 'g') and ativo) then
    raise exception 'Já existe um funcionário ativo com o CPF %', c.cpf;
  end if;
  if c.origem = 'ficha' then
    v_resumo := concat_ws('. ',
      'Ficha de inscrição ' || c.protocolo || ' (preenchida em ' || to_char(c.ficha_em at time zone 'America/Recife', 'DD/MM') || coalesce('; começou na obra em ' || to_char(c.data_inicio, 'DD/MM/YYYY'), '') || '): ' || coalesce(c.funcao_pretendida, '') || coalesce(' – ' || c.obra_pretendida, ''),
      case when c.ficha ? 'bota' then 'Tamanhos — bota ' || (c.ficha->>'bota') || ', calça ' || coalesce(c.ficha->>'calca', '?') || ', camisa ' || coalesce(c.ficha->>'camisa', '?') end,
      case when c.ficha ? 'emerg_nome' then 'Emergência: ' || (c.ficha->>'emerg_nome') || coalesce(' (' || (c.ficha->>'emerg_parentesco') || ')', '') || coalesce(' ' || (c.ficha->>'emerg_tel'), '') end,
      case when c.ficha->>'vt' = 'Sim' then 'Precisa de vale-transporte' when c.ficha->>'vt' = 'Não' then 'Sem vale-transporte' end,
      case when coalesce(c.ficha->>'filhos_menores_14', '0') <> '0' then (c.ficha->>'filhos_menores_14') || ' filho(s) menor(es) de 14' end);
    v_banco := nullif(c.ficha->>'banco', '');
    if v_banco in ('Outro', 'Não tenho conta') then v_banco := null; end if;
  end if;
  insert into funcionarios (nome, telefone, cpf, funcao_id, obra_id, empregador_id, vinculo, data_admissao, observacoes, banco, pix, foto_caminho, criado_por)
  values (c.nome, c.celular, c.cpf, p_funcao, p_obra, p_empregador, 'clt', coalesce(p_admissao, c.data_inicio, hoje()),
          concat_ws(E'\n', case when c.origem = 'ficha' then v_resumo
                                else 'Contratado do banco de espera' || coalesce(' (pretendia: ' || c.funcao_pretendida || ')', '') end,
                    nullif(c.observacoes, '')),
          v_banco, nullif(c.ficha->>'pix', ''), c.documentos->>'rosto', auth.uid())
  returning id into v_func;
  for k, v in select key, value from jsonb_each_text(c.documentos) where key <> 'rosto' loop
    insert into funcionario_documentos (funcionario_id, tipo, descricao, caminho, tipo_mime, enviado_por)
    values (v_func,
            case k when 'docFrente' then 'RG (frente)' when 'docVerso' then 'RG (verso)' when 'cpfDoc' then 'CPF'
                   when 'ctps' then 'CTPS' when 'residencia' then 'Comprovante de residência' when 'curriculo' then 'Currículo' else 'Outro' end,
            'Enviado pelo funcionário na ficha de inscrição', v,
            case when v ~ '\.pdf$' then 'application/pdf' when v ~ '\.png$' then 'image/png' when v ~ '\.webp$' then 'image/webp'
                 when v ~ '\.heic$' then 'image/heic' else 'image/jpeg' end,
            auth.uid());
  end loop;
  update espera_candidatos set status = 'contratado', funcionario_id = v_func where id = p_id;
  return v_func;
end $$;
revoke execute on function espera_contratar(uuid, uuid, uuid, uuid, date) from public, anon;
grant execute on function espera_contratar(uuid, uuid, uuid, uuid, date) to authenticated;
