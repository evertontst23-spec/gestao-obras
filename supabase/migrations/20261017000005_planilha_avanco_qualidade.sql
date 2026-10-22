-- =====================================================================
-- GESTÃO DE OBRAS — 05. PLANILHA ORÇAMENTÁRIA, AVANÇO FÍSICO-FINANCEIRO,
--                       FOTOS POR CATEGORIA E NÃO CONFORMIDADES
-- =====================================================================

create type tipo_item_planilha as enum ('grupo','servico');
create type status_medicao     as enum ('lancada','validada','rejeitada');
create type categoria_foto     as enum ('geral','execucao','correcao','nao_conformidade');
create type gravidade_nc       as enum ('leve','moderada','grave');
create type status_nc          as enum ('aberta','em_correcao','corrigida','verificada','cancelada');

-- ---------------------------------------------------------------------
-- Planilha da obra (orçamento / EAP). Uma ativa por obra.
-- ---------------------------------------------------------------------
create table planilhas (
  id            uuid primary key default gen_random_uuid(),
  obra_id       uuid not null references obras(id),
  versao        int  not null default 1,
  nome_arquivo  text not null,
  caminho       text,                 -- arquivo original no Storage
  aba           text,                 -- aba lida do Excel
  mapeamento    jsonb,                -- colunas reconhecidas (para conferência)
  ativa         boolean not null default true,
  total_itens   int not null default 0,
  total_servicos int not null default 0,
  valor_total   numeric(16,2),
  importado_por uuid not null references perfis(id),
  importado_em  timestamptz not null default now(),
  observacoes   text
);
create unique index planilhas_uma_ativa on planilhas (obra_id) where ativa;

create table planilha_itens (
  id                uuid primary key default gen_random_uuid(),
  planilha_id       uuid not null references planilhas(id),
  obra_id           uuid not null references obras(id),
  ordem             int  not null,
  codigo            text,             -- numeração do item (1, 1.1, 1.1.2…)
  codigo_referencia text,             -- SINAPI, ORSE, SEINFRA, composição própria…
  fonte             text,             -- banco de referência
  descricao         text not null,
  unidade           text,
  quantidade        numeric(16,4),
  preco_unitario    numeric(16,4),
  valor_total       numeric(16,2),
  tipo              tipo_item_planilha not null,
  nivel             int  not null default 1,
  pai_id            uuid references planilha_itens(id),
  raiz_id           uuid references planilha_itens(id),   -- grupo de 1º nível (etapa)
  etapa_id          uuid references etapas(id),
  constraint itens_servico_qtd check (tipo = 'grupo' or (quantidade is not null and quantidade >= 0))
);
create index on planilha_itens (planilha_id, ordem);
create index on planilha_itens (obra_id);

-- Tarefa pode executar um item da planilha
alter table tarefas add column planilha_item_id uuid references planilha_itens(id);
create index on tarefas (planilha_item_id);

-- ---------------------------------------------------------------------
-- Lançamentos de execução (medições físicas por item)
-- ---------------------------------------------------------------------
create table medicoes (
  id               uuid primary key default gen_random_uuid(),
  obra_id          uuid not null references obras(id),
  planilha_item_id uuid not null references planilha_itens(id),
  tarefa_id        uuid references tarefas(id),
  data             date not null,
  quantidade       numeric(16,4) not null check (quantidade > 0),
  local            text,
  descricao        text,
  origem           text not null default 'manual',     -- manual | tarefa
  status           status_medicao not null default 'lancada',
  registrado_por   uuid not null references perfis(id),
  criado_em        timestamptz not null default now(),
  validado_por     uuid references perfis(id),
  validado_em      timestamptz,
  parecer          text
);
create index on medicoes (planilha_item_id, status);
create index on medicoes (obra_id, data);

-- ---------------------------------------------------------------------
-- Não conformidades
-- ---------------------------------------------------------------------
create sequence nc_numero_seq;
create table nao_conformidades (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null unique default nextval('nc_numero_seq'),
  obra_id          uuid not null references obras(id),
  tarefa_id        uuid references tarefas(id),
  planilha_item_id uuid references planilha_itens(id),
  local            text,
  descricao        text not null check (length(trim(descricao)) >= 5),
  gravidade        gravidade_nc not null default 'moderada',
  status           status_nc not null default 'aberta',
  responsavel_id   uuid not null references perfis(id),
  prazo_correcao   date not null,
  aberta_por       uuid not null references perfis(id),
  aberta_em        timestamptz not null default now(),
  acao_corretiva   text,
  corrigida_por    uuid references perfis(id),
  corrigida_em     timestamptz,
  verificada_por   uuid references perfis(id),
  verificada_em    timestamptz,
  parecer          text,
  reaberturas      int not null default 0
);
create index on nao_conformidades (obra_id, status);
create index on nao_conformidades (tarefa_id);
create index on nao_conformidades (responsavel_id, status);

create table nc_eventos (
  id         bigserial primary key,
  nc_id      uuid not null references nao_conformidades(id),
  usuario_id uuid references perfis(id),
  status_anterior status_nc,
  status_novo     status_nc,
  descricao  text,
  criado_em  timestamptz not null default now()
);
create index on nc_eventos (nc_id, criado_em);

-- ---------------------------------------------------------------------
-- Fotos: categoria + vínculo com medição e não conformidade
-- ---------------------------------------------------------------------
alter table anexos
  add column categoria categoria_foto not null default 'geral',
  add column medicao_id uuid references medicoes(id),
  add column nao_conformidade_id uuid references nao_conformidades(id);
create index on anexos (obra_id, categoria);
create index on anexos (nao_conformidade_id);
create index on anexos (medicao_id);

create or replace function _tg_anexos_vinculos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.medicao_id is not null and not exists (select 1 from medicoes where id = new.medicao_id and obra_id = new.obra_id) then
    raise exception 'Anexo: lançamento não pertence à obra';
  end if;
  if new.nao_conformidade_id is not null and not exists (select 1 from nao_conformidades where id = new.nao_conformidade_id and obra_id = new.obra_id) then
    raise exception 'Anexo: não conformidade não pertence à obra';
  end if;
  return new;
end $$;
create trigger tg_anexos_vinculos before insert on anexos for each row execute function _tg_anexos_vinculos();

-- Planilha original pode ser Excel/CSV
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
       'application/vnd.oasis.opendocument.spreadsheet','text/csv','application/octet-stream'],
       file_size_limit = 20971520
 where id = 'anexos';

-- ---------------------------------------------------------------------
-- Gatilhos: auditoria, sem exclusão, histórico imutável
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['planilhas','planilha_itens','medicoes','nao_conformidades'] loop
    execute format('create trigger tg_%s_audit after insert or update or delete on %I for each row execute function _tg_auditoria()', t, t);
  end loop;
  foreach t in array array['planilhas','planilha_itens','medicoes','nao_conformidades','nc_eventos'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
  end loop;
end $$;
create trigger tg_nc_eventos_noupdate before update on nc_eventos for each row execute function _tg_auditoria_imutavel();

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
create view v_planilha_itens with (security_invoker = true) as
select i.*,
       coalesce(m.validado, 0) as executado,
       coalesce(m.pendente, 0) as executado_pendente,
       case when i.tipo = 'servico' and coalesce(i.quantidade,0) > 0
            then round(least(100, coalesce(m.validado,0) / i.quantidade * 100), 1) end as percentual,
       case when i.tipo = 'servico' then greatest(0, coalesce(i.quantidade,0) - coalesce(m.validado,0) - coalesce(m.pendente,0)) end as saldo,
       case when i.tipo = 'servico' and coalesce(i.quantidade,0) > 0
            then round(coalesce(i.valor_total, 0) * least(1, coalesce(m.validado,0) / i.quantidade), 2) end as valor_executado,
       (coalesce(m.validado,0) + coalesce(m.pendente,0)) > coalesce(i.quantidade,0) + 0.0001 and i.tipo = 'servico' as excedido,
       p.ativa as planilha_ativa
  from planilha_itens i
  join planilhas p on p.id = i.planilha_id
  left join lateral (
    select sum(quantidade) filter (where status = 'validada') as validado,
           sum(quantidade) filter (where status = 'lancada')  as pendente
      from medicoes where planilha_item_id = i.id
  ) m on true;

create view v_medicoes with (security_invoker = true) as
select m.*, i.codigo as item_codigo, i.descricao as item_descricao, i.unidade, i.quantidade as item_quantidade,
       i.preco_unitario, round(m.quantidade * coalesce(i.preco_unitario, i.valor_total / nullif(i.quantidade,0), 0), 2) as valor,
       pr.nome as registrado_nome, pv.nome as validado_nome, t.numero as tarefa_numero,
       (select count(*) from anexos a where a.medicao_id = m.id) as fotos
  from medicoes m
  join planilha_itens i on i.id = m.planilha_item_id
  left join perfis pr on pr.id = m.registrado_por
  left join perfis pv on pv.id = m.validado_por
  left join tarefas t on t.id = m.tarefa_id;

create view v_nao_conformidades with (security_invoker = true) as
select n.*, 'NC-' || lpad(n.numero::text, 4, '0') as codigo,
       o.codigo as obra_codigo, o.nome as obra_nome,
       t.numero as tarefa_numero, t.titulo as tarefa_titulo,
       i.codigo as item_codigo, i.descricao as item_descricao,
       pr.nome as responsavel_nome, pa.nome as aberta_por_nome,
       (n.status in ('aberta','em_correcao') and n.prazo_correcao < hoje()) as vencida,
       (select count(*) from anexos a where a.nao_conformidade_id = n.id) as fotos
  from nao_conformidades n
  join obras o on o.id = n.obra_id
  left join tarefas t on t.id = n.tarefa_id
  left join planilha_itens i on i.id = n.planilha_item_id
  left join perfis pr on pr.id = n.responsavel_id
  left join perfis pa on pa.id = n.aberta_por;

-- ---------------------------------------------------------------------
-- Avanço físico da obra:
--  • com planilha orçada: ponderado pelo VALOR de cada serviço (físico-financeiro)
--  • planilha sem preços: média do % de cada serviço
--  • sem planilha: ponderado pela duração das tarefas (regra anterior)
-- Só conta execução VALIDADA pelo engenheiro.
-- ---------------------------------------------------------------------
create or replace function avanco_obra(p_obra uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_pl uuid; v_valor numeric; v numeric;
begin
  select id, valor_total into v_pl, v_valor from planilhas where obra_id = p_obra and ativa;
  if v_pl is not null then
    select case when sum(coalesce(i.valor_total,0)) > 0
                then sum(coalesce(i.valor_total,0) * least(1, coalesce(m.q,0) / nullif(i.quantidade,0))) / sum(coalesce(i.valor_total,0)) * 100
                else avg(least(1, coalesce(m.q,0) / nullif(i.quantidade,0))) * 100 end
      into v
      from planilha_itens i
      left join (select planilha_item_id, sum(quantidade) q from medicoes where status = 'validada' group by 1) m on m.planilha_item_id = i.id
     where i.planilha_id = v_pl and i.tipo = 'servico' and coalesce(i.quantidade,0) > 0;
    return coalesce(round(v, 1), 0);
  end if;
  select coalesce(round(sum(case when t.status = 'aprovado' then 100 else t.percentual end
                            * (t.fim_previsto - t.inicio_previsto + 1))::numeric
                        / nullif(sum(t.fim_previsto - t.inicio_previsto + 1), 0), 1), 0)
    into v from tarefas t where t.obra_id = p_obra;
  return v;
end $$;

create or replace function valor_executado_obra(p_obra uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(coalesce(i.valor_total,0) * least(1, coalesce(m.q,0) / nullif(i.quantidade,0))), 2), 0)
    from planilhas p
    join planilha_itens i on i.planilha_id = p.id and i.tipo = 'servico' and coalesce(i.quantidade,0) > 0
    left join (select planilha_item_id, sum(quantidade) q from medicoes where status = 'validada' group by 1) m on m.planilha_item_id = i.id
   where p.obra_id = p_obra and p.ativa
$$;

-- ---------------------------------------------------------------------
-- Tarefas ligadas a itens da planilha
-- ---------------------------------------------------------------------
create or replace function _tg_tarefas_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare it planilha_itens;
begin
  if tg_op = 'UPDATE' and new.planilha_item_id is distinct from old.planilha_item_id
     and exists (select 1 from medicoes where tarefa_id = new.id and status <> 'rejeitada') then
    raise exception 'Esta tarefa já tem execução lançada no item da planilha; o vínculo não pode ser trocado';
  end if;
  if new.planilha_item_id is not null and (tg_op = 'INSERT' or new.planilha_item_id is distinct from old.planilha_item_id) then
    select * into it from planilha_itens where id = new.planilha_item_id;
    if not found or it.obra_id <> new.obra_id or it.tipo <> 'servico' then
      raise exception 'O item da planilha precisa ser um serviço desta obra';
    end if;
    new.unidade := coalesce(new.unidade, it.unidade);
    if new.quantidade_prevista is null then
      select greatest(0, it.quantidade - coalesce(sum(m.quantidade),0)) into new.quantidade_prevista
        from medicoes m where m.planilha_item_id = it.id and m.status <> 'rejeitada';
    end if;
    new.etapa_id := coalesce(new.etapa_id, it.etapa_id);
  end if;
  -- Regra de qualidade: não aprova serviço com não conformidade em aberto
  if tg_op = 'UPDATE' and new.status = 'aprovado' and old.status <> 'aprovado'
     and exists (select 1 from nao_conformidades where tarefa_id = new.id and status in ('aberta','em_correcao','corrigida')) then
    raise exception 'Existem não conformidades abertas nesta tarefa. Verifique-as antes de aprovar o serviço.';
  end if;
  return new;
end $$;
create trigger tg_tarefas_item before insert or update on tarefas for each row execute function _tg_tarefas_item();

-- Andamento informado na tarefa vira lançamento de execução do item;
-- aprovação da tarefa valida os lançamentos dela.
create or replace function _tg_tarefas_medicao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_delta numeric;
begin
  if new.planilha_item_id is not null then
    v_delta := coalesce(new.quantidade_executada,0) - coalesce(old.quantidade_executada,0);
    if v_delta > 0 then
      insert into medicoes (obra_id, planilha_item_id, tarefa_id, data, quantidade, local, descricao, origem, registrado_por)
      values (new.obra_id, new.planilha_item_id, new.id, hoje(), v_delta, new.local,
              'Andamento informado na tarefa ' || _cod_tarefa(new.numero), 'tarefa', coalesce(auth.uid(), new.encarregado_id));
    end if;
  end if;
  if new.status = 'aprovado' and old.status <> 'aprovado' then
    update medicoes set status = 'validada', validado_por = auth.uid(), validado_em = now(),
           parecer = 'Validado na aprovação da tarefa'
     where tarefa_id = new.id and status = 'lancada';
  end if;
  return new;
end $$;
create trigger tg_tarefas_medicao after update on tarefas for each row execute function _tg_tarefas_medicao();

-- ---------------------------------------------------------------------
-- IMPORTAÇÃO DA PLANILHA
-- p_itens: [{codigo, codigo_referencia, fonte, descricao, unidade, quantidade,
--            preco_unitario, valor_total, tipo, nivel, pai}]  (pai = índice 0-based ou null)
-- ---------------------------------------------------------------------
create or replace function planilha_importar(p_obra uuid, p_nome text, p_caminho text, p_aba text,
                                             p_mapeamento jsonb, p_itens jsonb, p_criar_etapas boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_antiga planilhas; v_id uuid; v_versao int := 1; it jsonb; idx int; v_ids uuid[] := '{}';
        v_raizes uuid[] := '{}'; v_item uuid; v_pai uuid; v_raiz uuid; v_tipo tipo_item_planilha;
        v_qtd numeric; v_pu numeric; v_tot numeric; v_etapa uuid; r record; v_ordem int;
begin
  perform _exige_gestor(p_obra);
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A planilha não tem itens';
  end if;

  select * into v_antiga from planilhas where obra_id = p_obra and ativa for update;
  if found then
    if exists (select 1 from medicoes m join planilha_itens i on i.id = m.planilha_item_id where i.planilha_id = v_antiga.id) then
      raise exception 'Esta obra já tem execução lançada na planilha atual. Para alterar quantitativos, registre um aditivo (revisão) em vez de reimportar.';
    end if;
    perform _fluxo_on();
    update tarefas set planilha_item_id = null
     where planilha_item_id in (select id from planilha_itens where planilha_id = v_antiga.id);
    perform _fluxo_off();
    update planilhas set ativa = false where id = v_antiga.id;
    v_versao := v_antiga.versao + 1;
  end if;

  insert into planilhas (obra_id, versao, nome_arquivo, caminho, aba, mapeamento, importado_por)
  values (p_obra, v_versao, coalesce(nullif(trim(p_nome),''), 'planilha'), p_caminho, p_aba, p_mapeamento, auth.uid())
  returning id into v_id;

  for it, idx in select e, (o - 1)::int from jsonb_array_elements(p_itens) with ordinality as x(e, o) loop
    if coalesce(trim(it->>'descricao'),'') = '' then raise exception 'Linha % da planilha sem descrição', idx + 1; end if;
    v_tipo := coalesce((it->>'tipo')::tipo_item_planilha, 'servico');
    v_qtd  := nullif(it->>'quantidade','')::numeric;
    v_pu   := nullif(it->>'preco_unitario','')::numeric;
    v_tot  := coalesce(nullif(it->>'valor_total','')::numeric, case when v_tipo = 'servico' then round(v_qtd * v_pu, 2) end);
    if v_tipo = 'servico' and (v_qtd is null or v_qtd < 0) then
      raise exception 'Serviço "%" (linha %) sem quantidade válida', left(it->>'descricao', 60), idx + 1;
    end if;
    v_pai := case when it->>'pai' is not null and (it->>'pai')::int between 0 and idx - 1 then v_ids[(it->>'pai')::int + 1] end;
    v_raiz := case when v_pai is null then null else coalesce((select raiz_id from planilha_itens where id = v_pai), v_pai) end;

    insert into planilha_itens (planilha_id, obra_id, ordem, codigo, codigo_referencia, fonte, descricao, unidade,
                                quantidade, preco_unitario, valor_total, tipo, nivel, pai_id, raiz_id)
    values (v_id, p_obra, idx + 1, nullif(trim(it->>'codigo'),''), nullif(trim(it->>'codigo_referencia'),''),
            nullif(trim(it->>'fonte'),''), trim(it->>'descricao'), nullif(trim(it->>'unidade'),''),
            v_qtd, v_pu, v_tot, v_tipo, coalesce((it->>'nivel')::int, 1), v_pai, v_raiz)
    returning id into v_item;
    v_ids := v_ids || v_item;
  end loop;

  if not exists (select 1 from planilha_itens where planilha_id = v_id and tipo = 'servico') then
    raise exception 'Nenhum serviço com quantidade foi encontrado na planilha';
  end if;

  -- Etapas a partir dos grupos de 1º nível
  if p_criar_etapas then
    select coalesce(max(ordem), 0) into v_ordem from etapas where obra_id = p_obra;
    for r in select * from planilha_itens where planilha_id = v_id and tipo = 'grupo' and pai_id is null order by ordem loop
      select id into v_etapa from etapas where obra_id = p_obra and lower(nome) = lower(r.descricao) limit 1;
      if v_etapa is null then
        v_ordem := v_ordem + 1;
        insert into etapas (obra_id, nome, ordem) values (p_obra, r.descricao, v_ordem) returning id into v_etapa;
      end if;
      update planilha_itens set etapa_id = v_etapa where planilha_id = v_id and (id = r.id or raiz_id = r.id);
      v_etapa := null;
    end loop;
  end if;

  update planilhas p set
    total_itens = (select count(*) from planilha_itens where planilha_id = v_id),
    total_servicos = (select count(*) from planilha_itens where planilha_id = v_id and tipo = 'servico'),
    valor_total = (select sum(valor_total) from planilha_itens where planilha_id = v_id and tipo = 'servico')
   where p.id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- LANÇAMENTO DE EXECUÇÃO
-- ---------------------------------------------------------------------
create or replace function medicao_lancar(p_item uuid, p_quantidade numeric, p_data date,
                                          p_descricao text default null, p_local text default null, p_tarefa uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare it planilha_itens; v_saldo numeric; v_id uuid; v_gere boolean; v_ativa boolean;
begin
  select * into it from planilha_itens where id = p_item;
  if not found or it.tipo <> 'servico' then raise exception 'Selecione um serviço da planilha'; end if;
  select ativa into v_ativa from planilhas where id = it.planilha_id;
  if not v_ativa then raise exception 'Este item pertence a uma versão antiga da planilha'; end if;
  if not membro_obra(it.obra_id) or meu_papel() not in ('encarregado','engenheiro','admin') then
    raise exception 'Sem permissão para lançar execução nesta obra';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade executada'; end if;
  if p_data is null or p_data > hoje() then raise exception 'A data da execução não pode ser futura'; end if;
  if p_tarefa is not null and not exists (select 1 from tarefas where id = p_tarefa and obra_id = it.obra_id) then
    raise exception 'Tarefa não pertence à obra';
  end if;
  select it.quantidade - coalesce(sum(quantidade),0) into v_saldo
    from medicoes where planilha_item_id = p_item and status <> 'rejeitada';
  if p_quantidade > v_saldo + 0.0001 then
    raise exception 'Quantidade excede o saldo do item (% % disponíveis de % %). Se houve acréscimo, peça ao engenheiro a revisão da planilha.',
      trim_scale(greatest(v_saldo,0)), coalesce(it.unidade,''), trim_scale(it.quantidade), coalesce(it.unidade,'');
  end if;
  v_gere := gere_obra(it.obra_id);
  insert into medicoes (obra_id, planilha_item_id, tarefa_id, data, quantidade, local, descricao, registrado_por,
                        status, validado_por, validado_em)
  values (it.obra_id, p_item, p_tarefa, p_data, p_quantidade, p_local, p_descricao, auth.uid(),
          case when v_gere then 'validada'::status_medicao else 'lancada'::status_medicao end,
          case when v_gere then auth.uid() end, case when v_gere then now() end)
  returning id into v_id;
  if not v_gere then
    perform _notificar_engenheiros(it.obra_id, 'medicao_validar', 'Validar execução: ' || left(it.descricao, 60),
      format('%s %s lançados em %s', trim_scale(p_quantidade), coalesce(it.unidade,''), to_char(p_data,'DD/MM/YYYY')),
      '/obras/' || it.obra_id || '/avanco');
  end if;
  return v_id;
end $$;

create or replace function medicao_validar(p_medicao uuid, p_aprovar boolean, p_parecer text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m medicoes;
begin
  select * into m from medicoes where id = p_medicao for update;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  perform _exige_gestor(m.obra_id);
  if m.status <> 'lancada' then raise exception 'Lançamento já analisado'; end if;
  if not p_aprovar and coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo da rejeição'; end if;
  update medicoes set status = case when p_aprovar then 'validada'::status_medicao else 'rejeitada'::status_medicao end,
         validado_por = auth.uid(), validado_em = now(), parecer = p_parecer
   where id = p_medicao;
  perform _notificar(m.registrado_por, case when p_aprovar then 'medicao_validada' else 'medicao_rejeitada' end,
    case when p_aprovar then 'Execução validada' else 'Execução não aceita' end,
    coalesce(p_parecer, trim_scale(m.quantidade) || ' lançados em ' || to_char(m.data,'DD/MM')), '/obras/' || m.obra_id || '/avanco');
end $$;

-- ---------------------------------------------------------------------
-- NÃO CONFORMIDADES
-- ---------------------------------------------------------------------
create or replace function _nc_evento(p_nc uuid, p_de status_nc, p_para status_nc, p_desc text) returns void
language sql security definer set search_path = public as $$
  insert into nc_eventos (nc_id, usuario_id, status_anterior, status_novo, descricao) values (p_nc, auth.uid(), p_de, p_para, p_desc)
$$;

create or replace function nc_abrir(p_obra uuid, p_tarefa uuid, p_item uuid, p_local text, p_descricao text,
                                    p_gravidade gravidade_nc, p_responsavel uuid, p_prazo date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num bigint; v_resp uuid := p_responsavel; t tarefas;
begin
  if not membro_obra(p_obra) or meu_papel() not in ('engenheiro','admin','encarregado') then
    raise exception 'Sem permissão para registrar não conformidade nesta obra';
  end if;
  if p_tarefa is not null then
    select * into t from tarefas where id = p_tarefa;
    if not found or t.obra_id <> p_obra then raise exception 'Tarefa não pertence à obra'; end if;
    v_resp := coalesce(v_resp, t.encarregado_id);
    if p_item is null then p_item := t.planilha_item_id; end if;
  end if;
  if p_item is not null and not exists (select 1 from planilha_itens where id = p_item and obra_id = p_obra) then
    raise exception 'Item da planilha não pertence à obra';
  end if;
  if v_resp is null then raise exception 'Informe o responsável pela correção'; end if;
  if not exists (select 1 from perfis where id = v_resp and ativo and papel in ('encarregado','engenheiro')) then
    raise exception 'O responsável deve ser um encarregado ou engenheiro ativo';
  end if;
  if p_prazo is null or p_prazo < hoje() then raise exception 'Informe um prazo de correção (hoje ou depois)'; end if;

  insert into nao_conformidades (obra_id, tarefa_id, planilha_item_id, local, descricao, gravidade, responsavel_id, prazo_correcao, aberta_por)
  values (p_obra, p_tarefa, p_item, coalesce(p_local, t.local), p_descricao, coalesce(p_gravidade,'moderada'), v_resp, p_prazo, auth.uid())
  returning id, numero into v_id, v_num;
  perform _nc_evento(v_id, null, 'aberta', p_descricao);
  -- garante acesso do responsável à obra
  insert into obra_membros (obra_id, usuario_id, funcao, adicionado_por) values (p_obra, v_resp, 'Responsável por correção', auth.uid())
  on conflict do nothing;
  if p_tarefa is not null then
    perform _evento(p_tarefa, 'nao_conformidade', null, null, format('NC-%s aberta: %s', lpad(v_num::text,4,'0'), p_descricao),
                    jsonb_build_object('nc_id', v_id));
  end if;
  perform _notificar(v_resp, 'nc_aberta', format('Não conformidade NC-%s (%s)', lpad(v_num::text,4,'0'), p_gravidade),
    format('%s • corrigir até %s', p_descricao, to_char(p_prazo,'DD/MM/YYYY')), '/qualidade/' || v_id);
  perform _notificar_engenheiros(p_obra, 'nc_aberta', format('NC-%s registrada', lpad(v_num::text,4,'0')), p_descricao, '/qualidade/' || v_id);
  return v_id;
end $$;

create or replace function nc_iniciar_correcao(p_nc uuid, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare n nao_conformidades;
begin
  select * into n from nao_conformidades where id = p_nc for update;
  if not found then raise exception 'Não conformidade não encontrada'; end if;
  if n.responsavel_id <> auth.uid() and not gere_obra(n.obra_id) then raise exception 'Apenas o responsável inicia a correção'; end if;
  if n.status <> 'aberta' then raise exception 'A não conformidade não está aberta'; end if;
  update nao_conformidades set status = 'em_correcao' where id = p_nc;
  perform _nc_evento(p_nc, n.status, 'em_correcao', coalesce(p_obs, 'Correção iniciada'));
end $$;

create or replace function nc_registrar_correcao(p_nc uuid, p_acao text) returns void
language plpgsql security definer set search_path = public as $$
declare n nao_conformidades;
begin
  select * into n from nao_conformidades where id = p_nc for update;
  if not found then raise exception 'Não conformidade não encontrada'; end if;
  if n.responsavel_id <> auth.uid() and not gere_obra(n.obra_id) then raise exception 'Apenas o responsável registra a correção'; end if;
  if n.status not in ('aberta','em_correcao') then raise exception 'A não conformidade não está pendente de correção'; end if;
  if coalesce(length(trim(p_acao)),0) < 5 then raise exception 'Descreva a correção executada'; end if;
  if not exists (select 1 from anexos where nao_conformidade_id = p_nc and categoria = 'correcao' and criado_em > coalesce(
       (select max(criado_em) from nc_eventos where nc_id = p_nc and status_novo = 'aberta'), n.aberta_em)) then
    raise exception 'Anexe pelo menos uma foto da correção antes de informar a conclusão';
  end if;
  update nao_conformidades set status = 'corrigida', acao_corretiva = p_acao, corrigida_por = auth.uid(), corrigida_em = now() where id = p_nc;
  perform _nc_evento(p_nc, n.status, 'corrigida', p_acao);
  perform _notificar_engenheiros(n.obra_id, 'nc_corrigida', format('Verificar correção NC-%s', lpad(n.numero::text,4,'0')), p_acao, '/qualidade/' || p_nc);
end $$;

create or replace function nc_verificar(p_nc uuid, p_aceitar boolean, p_parecer text default null) returns void
language plpgsql security definer set search_path = public as $$
declare n nao_conformidades;
begin
  select * into n from nao_conformidades where id = p_nc for update;
  if not found then raise exception 'Não conformidade não encontrada'; end if;
  perform _exige_gestor(n.obra_id);
  if n.status <> 'corrigida' then raise exception 'A correção ainda não foi informada'; end if;
  if not p_aceitar and coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo para reabrir'; end if;
  if p_aceitar then
    update nao_conformidades set status = 'verificada', verificada_por = auth.uid(), verificada_em = now(), parecer = p_parecer where id = p_nc;
    perform _nc_evento(p_nc, n.status, 'verificada', coalesce(p_parecer, 'Correção verificada e aceita'));
  else
    update nao_conformidades set status = 'aberta', parecer = p_parecer, reaberturas = reaberturas + 1,
           corrigida_por = null, corrigida_em = null where id = p_nc;
    perform _nc_evento(p_nc, n.status, 'aberta', 'Reaberta: ' || p_parecer);
  end if;
  perform _notificar(n.responsavel_id, case when p_aceitar then 'nc_verificada' else 'nc_reaberta' end,
    format('NC-%s %s', lpad(n.numero::text,4,'0'), case when p_aceitar then 'encerrada' else 'reaberta — refazer correção' end),
    coalesce(p_parecer, 'Correção aceita pelo engenheiro.'), '/qualidade/' || p_nc);
end $$;

create or replace function nc_cancelar(p_nc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare n nao_conformidades;
begin
  select * into n from nao_conformidades where id = p_nc for update;
  if not found then raise exception 'Não conformidade não encontrada'; end if;
  perform _exige_gestor(n.obra_id);
  if n.status in ('verificada','cancelada') then raise exception 'Não conformidade já encerrada'; end if;
  if coalesce(length(trim(p_motivo)),0) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  update nao_conformidades set status = 'cancelada', parecer = p_motivo where id = p_nc;
  perform _nc_evento(p_nc, n.status, 'cancelada', p_motivo);
end $$;

-- ---------------------------------------------------------------------
-- Alertas: acrescenta não conformidades vencidas e lançamentos a validar
-- ---------------------------------------------------------------------
alter function gerar_alertas() rename to _gerar_alertas_prazos;

create or replace function gerar_alertas() returns int
language plpgsql security definer set search_path = public as $$
declare n int; r record; v_hoje date := hoje(); v_antes int; v_eng uuid;
begin
  if auth.uid() is not null and not e_admin() then
    raise exception 'Apenas a diretoria pode disparar os alertas manualmente';
  end if;
  n := _gerar_alertas_prazos();
  select count(*) into v_antes from notificacoes;
  for r in select * from nao_conformidades where status in ('aberta','em_correcao') and prazo_correcao < v_hoje loop
    perform _notificar(r.responsavel_id, 'nc_vencida', format('NC-%s com correção atrasada', lpad(r.numero::text,4,'0')),
      format('Prazo era %s: %s', to_char(r.prazo_correcao,'DD/MM'), left(r.descricao, 80)), '/qualidade/' || r.id, 'ncv:' || r.id || ':' || v_hoje);
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'nc_vencida', format('NC-%s com correção atrasada', lpad(r.numero::text,4,'0')),
        left(r.descricao, 80), '/qualidade/' || r.id, 'ncv:' || r.id || ':' || v_hoje);
    end loop;
  end loop;
  for r in select obra_id, count(*) q from medicoes where status = 'lancada' and criado_em < now() - interval '1 day' group by obra_id loop
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'medicao_validar', format('%s lançamento(s) de execução aguardando validação', r.q),
        'Valide para atualizar o avanço físico da obra.', '/obras/' || r.obra_id || '/avanco', 'medv:' || r.obra_id || ':' || v_hoje);
    end loop;
  end loop;
  return n + (select count(*) from notificacoes) - v_antes;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table planilhas         enable row level security;
alter table planilha_itens    enable row level security;
alter table medicoes          enable row level security;
alter table nao_conformidades enable row level security;
alter table nc_eventos        enable row level security;

revoke all on planilhas, planilha_itens, medicoes, nao_conformidades, nc_eventos from anon;
revoke all on sequence nc_numero_seq from anon;

create policy planilhas_select on planilhas         for select to authenticated using (membro_obra(obra_id));
create policy pitens_select    on planilha_itens    for select to authenticated using (membro_obra(obra_id));
create policy medicoes_select  on medicoes          for select to authenticated using (membro_obra(obra_id));
create policy nc_select        on nao_conformidades for select to authenticated using (membro_obra(obra_id));
create policy ncev_select      on nc_eventos        for select to authenticated
  using (exists (select 1 from nao_conformidades n where n.id = nc_id));

do $$ begin
  alter publication supabase_realtime add table nao_conformidades, medicoes;
exception when undefined_object then raise notice 'Publicação supabase_realtime não encontrada'; end $$;

-- Permissões de execução (mesma regra da migração 04)
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
