-- =====================================================================
-- 09. SST — ponto (facial/manual), biometria com consentimento (LGPD),
--     entrega de EPI com ficha NR-06, DDS com presença, Ordem de Serviço (NR-01)
-- =====================================================================

-- Distância euclidiana entre descritores faciais (128 posições)
create or replace function _dist_face(a real[], b real[]) returns double precision
language sql immutable set search_path = public as $$
  select sqrt(sum((x - y) ^ 2)) from unnest(a, b) as t(x, y)
$$;
create or replace function _sha(t text) returns text language sql immutable set search_path = public as
$$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

create or replace function tem_papel_sst() returns boolean
language sql stable security definer set search_path = public as $$
  select tem_papel('admin','seguranca','rh','engenheiro','encarregado','almoxarifado')
$$;

-- ---------------------------------------------------------------------
-- BIOMETRIA (consentimento obrigatório — LGPD art. 11)
-- ---------------------------------------------------------------------
create table biometria_consentimentos (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id),
  aceito         boolean not null,
  texto_termo    text not null,
  termo_caminho  text,                 -- foto do termo assinado (opcional)
  registrado_por uuid not null references perfis(id),
  criado_em      timestamptz not null default now()
);

create or replace function biometria_cadastrar(p_func uuid, p_descritor real[], p_consentimento boolean, p_termo text, p_termo_caminho text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','rh','seguranca') then raise exception 'Apenas RH ou Segurança do Trabalho cadastram biometria'; end if;
  if not coalesce(p_consentimento, false) then raise exception 'Sem o consentimento do funcionário a biometria não pode ser cadastrada (LGPD)'; end if;
  if p_descritor is null or array_length(p_descritor, 1) <> 128 then raise exception 'Captura facial inválida — tente novamente com boa iluminação'; end if;
  if not exists (select 1 from funcionarios where id = p_func and ativo) then raise exception 'Funcionário não encontrado ou desligado'; end if;
  -- evita cadastrar o mesmo rosto em duas pessoas
  if exists (select 1 from funcionarios where id <> p_func and face_descritor is not null and _dist_face(face_descritor, p_descritor) < 0.40) then
    raise exception 'Este rosto já está cadastrado para outro funcionário';
  end if;
  insert into biometria_consentimentos (funcionario_id, aceito, texto_termo, termo_caminho, registrado_por)
  values (p_func, true, p_termo, p_termo_caminho, auth.uid());
  update funcionarios set face_descritor = p_descritor, biometria_consentida_em = now() where id = p_func;
end $$;

create or replace function biometria_remover(p_func uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','rh','seguranca') then raise exception 'Sem permissão'; end if;
  insert into biometria_consentimentos (funcionario_id, aceito, texto_termo, registrado_por)
  values (p_func, false, 'Revogação / remoção: ' || coalesce(p_motivo, '—'), auth.uid());
  update funcionarios set face_descritor = null, biometria_consentida_em = null where id = p_func;
end $$;

-- Identifica o funcionário pelo rosto (nunca devolve o descritor)
create or replace function _identificar_face(p_descritor real[], out funcionario_id uuid, out distancia double precision)
language sql stable security definer set search_path = public as $$
  select id, _dist_face(face_descritor, p_descritor) d from funcionarios
   where ativo and face_descritor is not null order by 2 limit 1
$$;

-- ---------------------------------------------------------------------
-- PONTO
-- ---------------------------------------------------------------------
create table registros_ponto (
  id             bigserial primary key,
  funcionario_id uuid not null references funcionarios(id),
  obra_id        uuid references obras(id),
  data           date not null,
  momento        timestamptz not null default now(),
  tipo           text not null check (tipo in ('entrada','saida')),
  metodo         text not null check (metodo in ('facial','manual')),
  distancia      numeric(6,4),
  latitude       double precision,
  longitude      double precision,
  precisao_m     double precision,
  justificativa  text,
  registrado_por uuid references perfis(id),
  hash           text not null,
  hash_anterior  text,
  check (metodo <> 'manual' or length(trim(coalesce(justificativa,''))) >= 5)
);
create index on registros_ponto (funcionario_id, data);
create index on registros_ponto (obra_id, data);

create or replace function _ponto_inserir(p_func uuid, p_obra uuid, p_momento timestamptz, p_tipo text, p_metodo text,
                                          p_dist numeric, p_lat double precision, p_lng double precision, p_prec double precision, p_just text)
returns registros_ponto language plpgsql security definer set search_path = public as $$
declare r registros_ponto; v_ant text; v_data date := (p_momento at time zone 'America/Recife')::date; v_tipo text := p_tipo;
begin
  if v_tipo is null then
    select case when tipo = 'entrada' then 'saida' else 'entrada' end into v_tipo
      from registros_ponto where funcionario_id = p_func and data = v_data order by momento desc limit 1;
    v_tipo := coalesce(v_tipo, 'entrada');
  end if;
  select hash into v_ant from registros_ponto order by id desc limit 1;
  insert into registros_ponto (funcionario_id, obra_id, data, momento, tipo, metodo, distancia, latitude, longitude, precisao_m,
                               justificativa, registrado_por, hash, hash_anterior)
  values (p_func, p_obra, v_data, p_momento, v_tipo, p_metodo, p_dist, p_lat, p_lng, p_prec, p_just, auth.uid(),
          _sha(concat_ws('|', p_func, p_momento, v_tipo, p_metodo, p_lat, p_lng, coalesce(v_ant,''))), v_ant)
  returning * into r;
  return r;
end $$;

create or replace function ponto_registrar_facial(p_descritor real[], p_obra uuid default null, p_lat double precision default null,
                                                  p_lng double precision default null, p_precisao double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; f funcionarios; r registros_ponto; v_ult registros_ponto;
begin
  if not tem_papel_sst() then raise exception 'Sem permissão para operar o ponto'; end if;
  if p_descritor is null or array_length(p_descritor, 1) <> 128 then raise exception 'Rosto não detectado'; end if;
  select * into m from _identificar_face(p_descritor);
  if m.funcionario_id is null or m.distancia >= 0.5 then
    return jsonb_build_object('reconhecido', false, 'confianca', greatest(0, round((1 - coalesce(m.distancia, 1)) * 100)));
  end if;
  select * into f from funcionarios where id = m.funcionario_id;
  -- evita batida dupla (2 minutos)
  select * into v_ult from registros_ponto where funcionario_id = f.id order by momento desc limit 1;
  if v_ult.id is not null and v_ult.momento > now() - interval '2 minutes' then
    return jsonb_build_object('reconhecido', true, 'duplicado', true, 'nome', f.nome, 'tipo', v_ult.tipo,
                              'hora', to_char(v_ult.momento at time zone 'America/Recife', 'HH24:MI:SS'));
  end if;
  r := _ponto_inserir(f.id, coalesce(p_obra, f.obra_id), now(), null, 'facial', round(m.distancia::numeric, 4), p_lat, p_lng, p_precisao, null);
  return jsonb_build_object('reconhecido', true, 'nome', f.nome, 'matricula', f.matricula, 'tipo', r.tipo,
    'hora', to_char(r.momento at time zone 'America/Recife', 'HH24:MI:SS'), 'confianca', round((1 - m.distancia) * 100), 'hash', left(r.hash, 12));
end $$;

create or replace function ponto_registrar_manual(p_func uuid, p_momento timestamptz, p_tipo text, p_justificativa text, p_obra uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare f funcionarios; r registros_ponto;
begin
  select * into f from funcionarios where id = p_func;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if not (tem_papel('admin','rh') or (tem_papel('engenheiro','seguranca') and f.obra_id is not null and membro_obra(f.obra_id))) then
    raise exception 'Lançamento manual de ponto só pelo RH, diretoria ou engenheiro da obra';
  end if;
  if coalesce(length(trim(p_justificativa)),0) < 5 then raise exception 'Justifique o lançamento manual (ex.: falha na câmera)'; end if;
  if p_momento > now() + interval '5 minutes' then raise exception 'Não é possível lançar ponto no futuro'; end if;
  if p_tipo not in ('entrada','saida') then raise exception 'Informe entrada ou saída'; end if;
  r := _ponto_inserir(p_func, coalesce(p_obra, f.obra_id), p_momento, p_tipo, 'manual', null, null, null, null, p_justificativa);
  return r.id;
end $$;

-- ---------------------------------------------------------------------
-- EPI (NR-06)
-- ---------------------------------------------------------------------
create sequence epi_entrega_seq;
create table epi_entregas (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null unique default nextval('epi_entrega_seq'),
  funcionario_id   uuid not null references funcionarios(id),
  obra_id          uuid references obras(id),          -- local de onde saiu o estoque (nulo = central)
  data             date not null default hoje(),
  motivo           text not null check (motivo in ('admissao','substituicao','desgaste','perda','dano','periodica','visitante')),
  confirmacao      text not null check (confirmacao in ('assinatura','facial')),
  assinatura_caminho text,
  distancia_facial numeric(6,4),
  observacoes      text,
  entregue_por     uuid not null references perfis(id),
  criado_em        timestamptz not null default now(),
  hash             text not null,
  check (confirmacao <> 'assinatura' or assinatura_caminho is not null)
);
create index on epi_entregas (funcionario_id, data);
create table epi_entrega_itens (
  entrega_id    uuid not null references epi_entregas(id),
  insumo_id     uuid not null references insumos(id),
  quantidade    numeric(10,2) not null check (quantidade > 0),
  ca            text,
  ca_validade   date,
  proxima_troca date,
  primary key (entrega_id, insumo_id)
);

create or replace function epi_registrar_entrega(p_func uuid, p_local uuid, p_itens jsonb, p_motivo text, p_confirmacao text,
                                                 p_assinatura text default null, p_descritor real[] default null, p_obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f funcionarios; v_id uuid; v_num bigint; it jsonb; ins insumos; q numeric; v_dist double precision; v_lista text := '';
begin
  if not tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro') then raise exception 'Sem permissão para entregar EPI'; end if;
  select * into f from funcionarios where id = p_func and ativo;
  if not found then raise exception 'Funcionário não encontrado ou desligado'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Selecione os EPIs entregues'; end if;
  if p_confirmacao = 'facial' then
    if f.face_descritor is null then raise exception 'Funcionário sem biometria — use a assinatura'; end if;
    v_dist := _dist_face(f.face_descritor, p_descritor);
    if p_descritor is null or v_dist >= 0.5 then raise exception 'O rosto não confere com % — confirme por assinatura', f.nome; end if;
  elsif p_confirmacao = 'assinatura' then
    if coalesce(p_assinatura,'') = '' then raise exception 'Colete a assinatura do funcionário'; end if;
  else raise exception 'Confirmação inválida'; end if;

  insert into epi_entregas (funcionario_id, obra_id, motivo, confirmacao, assinatura_caminho, distancia_facial, observacoes, entregue_por, hash)
  values (p_func, p_local, p_motivo, p_confirmacao, p_assinatura, round(v_dist::numeric, 4), p_obs, auth.uid(), 'pendente')
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_itens) loop
    select * into ins from insumos where id = (it->>'insumo_id')::uuid;
    if not found or ins.categoria <> 'EPI' then raise exception 'Item não é um EPI cadastrado'; end if;
    if ins.ca is null then raise exception '% sem CA cadastrado — não pode ser entregue (NR-06)', ins.descricao; end if;
    if ins.ca_validade is not null and ins.ca_validade < hoje() then raise exception 'CA % de % está vencido (%)', ins.ca, ins.descricao, to_char(ins.ca_validade,'DD/MM/YYYY'); end if;
    q := coalesce((it->>'quantidade')::numeric, 1);
    insert into epi_entrega_itens values (v_id, ins.id, q, ins.ca, ins.ca_validade, case when ins.vida_util_dias is not null then hoje() + ins.vida_util_dias end);
    perform _movimentar(p_local, ins.id, 'saida', q, 'entrega_epi', v_id, 'Ficha EPI nº ' || v_num || ' — ' || f.nome);
    v_lista := v_lista || ins.codigo || ':' || q || ';';
  end loop;
  update epi_entregas set hash = _sha(concat_ws('|', v_id, p_func, now(), v_lista, p_confirmacao, coalesce(p_assinatura,''), coalesce(v_dist::text,''))) where id = v_id;
  return v_id;
end $$;

create or replace function ve_registro_func(p_func uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from funcionarios f where f.id = p_func and (ve_funcionario(f.obra_id) or f.usuario_id = auth.uid()
                 or (tem_papel('encarregado','almoxarifado') and f.obra_id is not null and membro_obra(f.obra_id))))
$$;

-- Nome/obra do funcionário para quem pode ver os registros dele (sem dados pessoais)
create or replace function funcionario_basico(p_func uuid, out nome text, out obra_id uuid, out ativo boolean, out matricula text)
language sql stable security definer set search_path = public as $$
  select f.nome, f.obra_id, f.ativo, f.matricula from funcionarios f where f.id = p_func and ve_registro_func(p_func)
$$;

create view v_epi_situacao with (security_invoker = true) as
select distinct on (e.funcionario_id, i.insumo_id)
       e.funcionario_id, i.insumo_id, ins.codigo, ins.descricao, i.ca, e.data as ultima_entrega, i.proxima_troca,
       (i.proxima_troca is not null and i.proxima_troca < hoje()) as troca_vencida,
       (funcionario_basico(e.funcionario_id)).nome as funcionario_nome,
       (funcionario_basico(e.funcionario_id)).obra_id as obra_id,
       (funcionario_basico(e.funcionario_id)).ativo as ativo
  from epi_entregas e
  join epi_entrega_itens i on i.entrega_id = e.id
  join insumos ins on ins.id = i.insumo_id
 order by e.funcionario_id, i.insumo_id, e.data desc, e.criado_em desc;

-- ---------------------------------------------------------------------
-- DDS — Diálogo Diário de Segurança
-- ---------------------------------------------------------------------
create sequence dds_numero_seq;
create table dds (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint not null unique default nextval('dds_numero_seq'),
  obra_id       uuid not null references obras(id),
  data          date not null,
  hora          time,
  duracao_min   int check (duracao_min is null or duracao_min > 0),
  tema          text not null check (length(trim(tema)) >= 3),
  conteudo      text,
  local         text,
  foto_caminho  text,
  observacoes   text,
  responsavel_id uuid not null references perfis(id),
  criado_em     timestamptz not null default now()
);
create index on dds (obra_id, data);
create table dds_presencas (
  dds_id         uuid not null references dds(id),
  funcionario_id uuid not null references funcionarios(id),
  primary key (dds_id, funcionario_id)
);

create or replace function dds_registrar(p_obra uuid, p_data date, p_hora time, p_duracao int, p_tema text, p_conteudo text,
                                         p_local text, p_participantes uuid[], p_foto text default null, p_obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (tem_papel('admin','seguranca') or (tem_papel('engenheiro','encarregado') and membro_obra(p_obra))) then
    raise exception 'Sem permissão para registrar DDS nesta obra';
  end if;
  if p_data > hoje() then raise exception 'DDS não pode ter data futura'; end if;
  if coalesce(array_length(p_participantes,1),0) = 0 then raise exception 'Marque os participantes do DDS'; end if;
  insert into dds (obra_id, data, hora, duracao_min, tema, conteudo, local, foto_caminho, observacoes, responsavel_id)
  values (p_obra, p_data, p_hora, p_duracao, p_tema, p_conteudo, p_local, p_foto, p_obs, auth.uid()) returning id into v_id;
  insert into dds_presencas select v_id, unnest(p_participantes);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- ORDEM DE SERVIÇO de SST (NR-01, 1.4.1 c)
-- ---------------------------------------------------------------------
create sequence os_numero_seq;
create table ordens_servico (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint not null unique default nextval('os_numero_seq'),
  funcionario_id    uuid not null references funcionarios(id),
  funcao_nome       text not null,
  obra_id           uuid references obras(id),
  data              date not null default hoje(),
  atividades        text not null,
  riscos            text[] not null default '{}',
  medidas           text,
  epis              text[] not null default '{}',
  proibicoes        text,
  emergencia        text,
  responsavel_id    uuid not null references perfis(id),
  ciencia_caminho   text,                      -- assinatura do funcionário
  ciencia_em        timestamptz,
  substituida       boolean not null default false,
  criado_em         timestamptz not null default now()
);
create index on ordens_servico (funcionario_id);

create or replace function os_emitir(p_func uuid, p_atividades text, p_riscos text[], p_medidas text, p_epis text[],
                                     p_proibicoes text, p_emergencia text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f record; v_id uuid;
begin
  if not tem_papel('admin','seguranca') then raise exception 'Apenas a Segurança do Trabalho emite Ordem de Serviço'; end if;
  select fu.*, fn.nome as funcao into f from funcionarios fu left join funcoes fn on fn.id = fu.funcao_id where fu.id = p_func and fu.ativo;
  if not found then raise exception 'Funcionário não encontrado ou desligado'; end if;
  if coalesce(length(trim(p_atividades)),0) < 5 then raise exception 'Descreva as atividades'; end if;
  if coalesce(array_length(p_riscos,1),0) = 0 then raise exception 'Informe os riscos da atividade'; end if;
  update ordens_servico set substituida = true where funcionario_id = p_func and not substituida;
  insert into ordens_servico (funcionario_id, funcao_nome, obra_id, atividades, riscos, medidas, epis, proibicoes, emergencia, responsavel_id)
  values (p_func, coalesce(f.funcao, '—'), f.obra_id, p_atividades, p_riscos, p_medidas, coalesce(p_epis,'{}'), p_proibicoes, p_emergencia, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function os_registrar_ciencia(p_os uuid, p_assinatura text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','seguranca','engenheiro','encarregado') then raise exception 'Sem permissão'; end if;
  if coalesce(p_assinatura,'') = '' then raise exception 'Colete a assinatura do funcionário'; end if;
  update ordens_servico set ciencia_caminho = p_assinatura, ciencia_em = now() where id = p_os and ciencia_em is null;
  if not found then raise exception 'OS não encontrada ou ciência já registrada'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Imutabilidade, auditoria, RLS, storage
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['registros_ponto','biometria_consentimentos','epi_entregas','epi_entrega_itens','dds','dds_presencas','ordens_servico'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
  end loop;
  foreach t in array array['epi_entregas','dds','ordens_servico','biometria_consentimentos'] loop
    execute format('create trigger tg_%s_audit after insert or update on %I for each row execute function _tg_auditoria()', t, t);
  end loop;
end $$;
create trigger tg_ponto_noupdate before update on registros_ponto for each row execute function _tg_auditoria_imutavel();
create trigger tg_epii_noupdate  before update on epi_entrega_itens for each row execute function _tg_auditoria_imutavel();

alter table biometria_consentimentos enable row level security;
alter table registros_ponto          enable row level security;
alter table epi_entregas             enable row level security;
alter table epi_entrega_itens        enable row level security;
alter table dds                      enable row level security;
alter table dds_presencas            enable row level security;
alter table ordens_servico           enable row level security;
revoke all on biometria_consentimentos, registros_ponto, epi_entregas, epi_entrega_itens, dds, dds_presencas, ordens_servico from anon;

-- quem vê o funcionário (RH/SST/diretoria/engenheiro da obra) vê os registros dele
create policy bio_sel  on biometria_consentimentos for select to authenticated using (tem_papel('admin','rh','seguranca'));
create policy ponto_sel on registros_ponto   for select to authenticated using (ve_registro_func(funcionario_id));
create policy epi_sel  on epi_entregas       for select to authenticated using (ve_registro_func(funcionario_id));
create policy epii_sel on epi_entrega_itens  for select to authenticated using (exists (select 1 from epi_entregas e where e.id = entrega_id));
create policy dds_sel  on dds                for select to authenticated using (membro_obra(obra_id));
create policy ddsp_sel on dds_presencas      for select to authenticated using (exists (select 1 from dds d where d.id = dds_id));
create policy os_sel   on ordens_servico     for select to authenticated using (ve_registro_func(funcionario_id));

-- Encarregado/almoxarife precisam listar nomes da equipe (sem dados pessoais) para ponto, EPI e DDS
create or replace function equipe_da_obra(p_obra uuid) returns table (id uuid, matricula text, nome text, funcao text, biometria boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.matricula, f.nome, fn.nome, f.face_descritor is not null
    from funcionarios f left join funcoes fn on fn.id = f.funcao_id
   where f.ativo and (p_obra is null or f.obra_id = p_obra)
     and (tem_papel('admin','rh','seguranca','almoxarifado') or (p_obra is not null and membro_obra(p_obra)))
   order by f.nome
$$;

create policy sst_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'sst' and public.tem_papel_sst());
create policy sst_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'sst' and public.tem_papel_sst());

-- Permissões de execução
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    if f.proname like '\_%' then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    else
      execute format('revoke execute on function %s from public, anon', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig);
      begin execute format('grant execute on function %s to service_role', f.sig); exception when undefined_object then null; end;
    end if;
  end loop;
end $$;

-- Saldo de EPIs por local para quem entrega EPI (encarregado não enxerga o depósito central pela tabela)
create or replace function saldos_epi() returns table (obra_id uuid, insumo_id uuid, saldo numeric)
language sql stable security definer set search_path = public as $$
  select m.obra_id, m.insumo_id, sum(case when m.tipo = 'saida' then -abs(m.quantidade) else m.quantidade end)
    from estoque_movimentos m join insumos i on i.id = m.insumo_id
   where i.categoria = 'EPI' and tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro')
     and (m.obra_id is null or membro_obra(m.obra_id))
   group by m.obra_id, m.insumo_id
$$;
revoke execute on function saldos_epi() from public, anon;
grant execute on function saldos_epi() to authenticated;
