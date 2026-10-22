-- =====================================================================
-- GESTÃO DE OBRAS — 01. ESQUEMA (tipos, tabelas, funções auxiliares, views)
-- Banco: PostgreSQL 15+ (Supabase)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
create type papel_usuario as enum ('admin','engenheiro','encarregado','compras','almoxarifado');

create type situacao_obra as enum ('planejamento','em_andamento','paralisada','concluida','cancelada');

create type prioridade as enum ('baixa','normal','alta','urgente');

-- Status de execução (itens 1 a 9 da especificação)
create type status_tarefa as enum (
  'pendente',                -- 1. sem responsável definido / rascunho
  'aguardando_confirmacao',  -- 2. atribuída, aguardando o encarregado confirmar
  'programado',              -- 3. recebida e programada
  'em_andamento',            -- 4.
  'aguardando_material',     -- 5.
  'paralisado',              -- 6.
  'concluido_encarregado',   -- 7. (registrado como evento; ver doc)
  'aguardando_validacao',    -- 8.
  'aprovado'                 -- 9. aprovado e finalizado
);

create type status_material as enum (
  'solicitado','aguardando_aprovacao','aprovado','disponivel_estoque','em_cotacao',
  'compra_autorizada','comprado','em_transporte','parcialmente_entregue','entregue','cancelado'
);

create type status_solicitacao as enum ('aguardando_aprovacao','aprovada','rejeitada','em_atendimento','concluida','cancelada');

create type status_reprogramacao as enum ('pendente','aprovada','rejeitada');

create type causa_atraso as enum ('falta_material','mao_de_obra','clima','equipamento','projeto','cliente','interferencia','outro');

-- Data local do canteiro (Recife, UTC-3)
create or replace function hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Recife')::date $$;

-- ---------------------------------------------------------------------
-- Usuários (perfil ligado ao auth.users do Supabase)
-- ---------------------------------------------------------------------
create table perfis (
  id            uuid primary key references auth.users(id) on delete restrict,
  nome          text not null,
  email         text,
  telefone      text,
  papel         papel_usuario not null default 'encarregado',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Obras
-- ---------------------------------------------------------------------
create table obras (
  id                       uuid primary key default gen_random_uuid(),
  codigo                   text not null unique,
  nome                     text not null,
  endereco                 text,
  cliente                  text,
  engenheiro_id            uuid references perfis(id),
  encarregado_id           uuid references perfis(id),
  data_inicio              date,
  data_prevista_conclusao  date,
  situacao                 situacao_obra not null default 'planejamento',
  exige_aprovacao_material boolean not null default true,
  criado_por               uuid references perfis(id),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  constraint obras_datas_ck check (data_prevista_conclusao is null or data_inicio is null or data_prevista_conclusao >= data_inicio)
);

-- Equipe vinculada à obra (controla o acesso por obra)
create table obra_membros (
  obra_id        uuid not null references obras(id),
  usuario_id     uuid not null references perfis(id),
  funcao         text,
  adicionado_por uuid references perfis(id),
  criado_em      timestamptz not null default now(),
  primary key (obra_id, usuario_id)
);

-- Etapas construtivas
create table etapas (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references obras(id),
  nome            text not null,
  ordem           int not null default 0,
  inicio_previsto date,
  fim_previsto    date,
  criado_em       timestamptz not null default now()
);
create index on etapas (obra_id, ordem);

-- ---------------------------------------------------------------------
-- Plano de ação / tarefas
-- ---------------------------------------------------------------------
create sequence tarefa_numero_seq;

create table tarefas (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint not null unique default nextval('tarefa_numero_seq'),
  obra_id              uuid not null references obras(id),
  etapa_id             uuid references etapas(id),
  titulo               text not null check (length(trim(titulo)) >= 3),
  descricao            text,
  local                text,
  quantidade_prevista  numeric(14,3) check (quantidade_prevista is null or quantidade_prevista >= 0),
  quantidade_executada numeric(14,3) not null default 0,
  unidade              text,
  encarregado_id       uuid not null references perfis(id),   -- regra 1: responsável obrigatório
  prioridade           prioridade not null default 'normal',
  status               status_tarefa not null default 'aguardando_confirmacao',
  percentual           int not null default 0 check (percentual between 0 and 100),
  inicio_previsto      date not null,                         -- regra 1: prazo obrigatório
  fim_previsto         date not null,
  recebido_em          timestamptz,
  inicio_real          timestamptz,
  concluido_em         timestamptz,
  aprovado_em          timestamptz,
  aprovado_por         uuid references perfis(id),
  observacoes          text,
  criado_por           uuid references perfis(id),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint tarefas_prazo_ck check (fim_previsto >= inicio_previsto)
);
create index on tarefas (obra_id, status);
create index on tarefas (encarregado_id, status);
create index on tarefas (fim_previsto);

-- Histórico permanente da tarefa
create table tarefa_eventos (
  id              bigserial primary key,
  tarefa_id       uuid not null references tarefas(id),
  usuario_id      uuid references perfis(id),
  tipo            text not null,
  status_anterior status_tarefa,
  status_novo     status_tarefa,
  percentual      int,
  descricao       text,
  dados           jsonb,
  criado_em       timestamptz not null default now()
);
create index on tarefa_eventos (tarefa_id, criado_em);

-- Reprogramações de prazo (regras 2 e 3)
create table reprogramacoes (
  id              uuid primary key default gen_random_uuid(),
  tarefa_id       uuid not null references tarefas(id),
  solicitado_por  uuid not null references perfis(id),
  inicio_anterior date not null,
  fim_anterior    date not null,
  inicio_novo     date not null,
  fim_novo        date not null,
  causa           causa_atraso not null default 'outro',
  justificativa   text not null check (length(trim(justificativa)) >= 10),
  status          status_reprogramacao not null default 'pendente',
  decidido_por    uuid references perfis(id),
  decidido_em     timestamptz,
  parecer         text,
  criado_em       timestamptz not null default now(),
  constraint reprog_datas_ck check (fim_novo >= inicio_novo)
);
create index on reprogramacoes (tarefa_id);

-- Impedimentos / dificuldades (regra 10)
create table impedimentos (
  id             uuid primary key default gen_random_uuid(),
  tarefa_id      uuid not null references tarefas(id),
  causa          causa_atraso not null,
  descricao      text not null,
  paralisou      boolean not null default false,
  registrado_por uuid not null references perfis(id),
  criado_em      timestamptz not null default now(),
  resolvido_em   timestamptz,
  resolvido_por  uuid references perfis(id)
);
create index on impedimentos (tarefa_id);

-- ---------------------------------------------------------------------
-- Solicitações de materiais
-- ---------------------------------------------------------------------
create sequence solicitacao_numero_seq;

create table solicitacoes (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null unique default nextval('solicitacao_numero_seq'),
  obra_id          uuid not null references obras(id),
  tarefa_id        uuid references tarefas(id),         -- regra 7: vínculo imutável
  solicitante_id   uuid not null references perfis(id),
  data_necessidade date not null,
  prioridade       prioridade not null default 'normal',
  justificativa    text,
  observacoes      text,
  status           status_solicitacao not null default 'aguardando_aprovacao',
  aprovado_por     uuid references perfis(id),
  aprovado_em      timestamptz,
  parecer          text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index on solicitacoes (obra_id, status);
create index on solicitacoes (tarefa_id);

create table solicitacao_itens (
  id                  uuid primary key default gen_random_uuid(),
  solicitacao_id      uuid not null references solicitacoes(id),
  item_origem_id      uuid references solicitacao_itens(id),  -- desmembramento estoque/compra
  material            text not null,
  especificacao       text,
  unidade             text not null,
  quantidade          numeric(14,3) not null check (quantidade > 0),
  quantidade_enviada  numeric(14,3) not null default 0,
  quantidade_recebida numeric(14,3) not null default 0,
  data_necessidade    date not null,
  status              status_material not null default 'solicitado',
  fornecedor          text,
  previsao_entrega    date,
  comprado_em         timestamptz,
  entregue_em         timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint itens_qtd_ck check (quantidade_recebida <= quantidade and quantidade_enviada <= quantidade)
);
create index on solicitacao_itens (solicitacao_id);
create index on solicitacao_itens (status);

-- Registro de cada etapa do item (datas reais)
create table item_eventos (
  id              bigserial primary key,
  item_id         uuid not null references solicitacao_itens(id),
  usuario_id      uuid references perfis(id),
  status_anterior status_material,
  status_novo     status_material,
  quantidade      numeric(14,3),
  descricao       text,
  dados           jsonb,
  criado_em       timestamptz not null default now()
);
create index on item_eventos (item_id, criado_em);

-- Entregas (permite entregas parciais — regra 6)
create table entregas (
  id                     uuid primary key default gen_random_uuid(),
  item_id                uuid not null references solicitacao_itens(id),
  quantidade_enviada     numeric(14,3) not null check (quantidade_enviada > 0),
  enviado_por            uuid not null references perfis(id),
  enviado_em             timestamptz not null default now(),
  observacao             text,
  quantidade_recebida    numeric(14,3),
  recebido_por           uuid references perfis(id),
  recebido_em            timestamptz,
  observacao_recebimento text
);
create index on entregas (item_id);

-- ---------------------------------------------------------------------
-- Anexos / fotografias (arquivos no Storage, bucket "anexos")
-- ---------------------------------------------------------------------
create table anexos (
  id             uuid primary key default gen_random_uuid(),
  obra_id        uuid not null references obras(id),
  tarefa_id      uuid references tarefas(id),
  solicitacao_id uuid references solicitacoes(id),
  diario_id      uuid,
  caminho        text not null unique,
  nome           text not null,
  tipo_mime      text,
  tamanho        bigint,
  legenda        text,
  enviado_por    uuid not null references perfis(id),
  criado_em      timestamptz not null default now()
);
create index on anexos (tarefa_id);
create index on anexos (solicitacao_id);

-- ---------------------------------------------------------------------
-- Diário de obra
-- ---------------------------------------------------------------------
create table diario_obra (
  id                     uuid primary key default gen_random_uuid(),
  obra_id                uuid not null references obras(id),
  data                   date not null,
  clima                  text,
  equipe_presente        int check (equipe_presente is null or equipe_presente >= 0),
  equipe_descricao       text,
  servicos_executados    text,
  ocorrencias            text,
  paralisacoes           text,
  necessidades_material  text,
  observacoes            text,
  registrado_por         uuid not null references perfis(id),
  validado_por           uuid references perfis(id),
  validado_em            timestamptz,
  criado_em              timestamptz not null default now(),
  unique (obra_id, data)
);
alter table anexos add constraint anexos_diario_fk foreign key (diario_id) references diario_obra(id);

create table diario_tarefas (
  diario_id            uuid not null references diario_obra(id),
  tarefa_id            uuid not null references tarefas(id),
  quantidade_produzida numeric(14,3),
  observacao           text,
  primary key (diario_id, tarefa_id)
);

-- ---------------------------------------------------------------------
-- Notificações (central de alertas)
-- ---------------------------------------------------------------------
create table notificacoes (
  id         bigserial primary key,
  usuario_id uuid not null references perfis(id),
  tipo       text not null,
  titulo     text not null,
  mensagem   text,
  link       text,
  chave      text,          -- evita alerta duplicado
  lida       boolean not null default false,
  criado_em  timestamptz not null default now(),
  unique (usuario_id, chave)
);
create index on notificacoes (usuario_id, lida, criado_em desc);

-- ---------------------------------------------------------------------
-- Auditoria (LGPD / rastreabilidade)
-- ---------------------------------------------------------------------
create table auditoria (
  id          bigserial primary key,
  tabela      text not null,
  registro_id text,
  acao        text not null,
  usuario_id  uuid,
  antes       jsonb,
  depois      jsonb,
  criado_em   timestamptz not null default now()
);
create index on auditoria (tabela, registro_id);
create index on auditoria (criado_em desc);

-- =====================================================================
-- Funções auxiliares de permissão (SECURITY DEFINER evita recursão de RLS)
-- =====================================================================
create or replace function meu_papel() returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'admin', false)
$$;

-- Diretoria, compras e almoxarifado enxergam todas as obras
create or replace function ve_todas_obras() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('admin','compras','almoxarifado'), false)
$$;

create or replace function membro_obra(p_obra uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select meu_papel() is not null and (
       ve_todas_obras()
    or exists (select 1 from obras o where o.id = p_obra and auth.uid() in (o.engenheiro_id, o.encarregado_id))
    or exists (select 1 from obra_membros m where m.obra_id = p_obra and m.usuario_id = auth.uid())
  )
$$;

-- Pode planejar/gerir a obra: admin ou engenheiro vinculado
create or replace function gere_obra(p_obra uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'admin', false) or (
    coalesce(meu_papel() = 'engenheiro', false) and (
         exists (select 1 from obras o where o.id = p_obra and o.engenheiro_id = auth.uid())
      or exists (select 1 from obra_membros m where m.obra_id = p_obra and m.usuario_id = auth.uid())
    )
  )
$$;

-- Engenheiros vinculados à obra (destinatários de alertas)
create or replace function _engenheiros_obra(p_obra uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select o.engenheiro_id from obras o where o.id = p_obra and o.engenheiro_id is not null
  union
  select m.usuario_id from obra_membros m join perfis p on p.id = m.usuario_id
   where m.obra_id = p_obra and p.papel = 'engenheiro' and p.ativo
$$;

create or replace function uuid_ou_nulo(t text) returns uuid
language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

-- =====================================================================
-- Views de leitura (security_invoker: respeitam o RLS de quem consulta)
-- =====================================================================
create view v_tarefas with (security_invoker = true) as
select t.*,
       'T-' || lpad(t.numero::text, 5, '0') as codigo,
       o.codigo as obra_codigo, o.nome as obra_nome,
       e.nome   as etapa_nome,
       p.nome   as encarregado_nome,
       case
         when t.status in ('aprovado','aguardando_validacao','concluido_encarregado') then 'concluido'
         when hoje() > t.fim_previsto then 'atrasado'
         when t.fim_previsto - hoje() <= 2 then 'atencao'
         else 'no_prazo'
       end as situacao_prazo,
       case
         when t.concluido_em is not null then greatest(0, (t.concluido_em at time zone 'America/Recife')::date - t.fim_previsto)
         else greatest(0, hoje() - t.fim_previsto)
       end as dias_atraso,
       (t.fim_previsto - hoje()) as dias_restantes
  from tarefas t
  join obras o on o.id = t.obra_id
  left join etapas e on e.id = t.etapa_id
  left join perfis p on p.id = t.encarregado_id;

create view v_itens with (security_invoker = true) as
select i.*,
       s.numero as solicitacao_numero, 'SM-' || lpad(s.numero::text, 5, '0') as solicitacao_codigo,
       s.obra_id, s.tarefa_id, s.solicitante_id, s.prioridade, s.status as solicitacao_status,
       o.codigo as obra_codigo, o.nome as obra_nome,
       t.numero as tarefa_numero, t.titulo as tarefa_titulo,
       ps.nome as solicitante_nome,
       (i.status not in ('entregue','cancelado') and i.previsao_entrega is not null
          and i.previsao_entrega > i.data_necessidade) as risco_atraso,
       (i.status in ('em_cotacao','compra_autorizada','comprado','em_transporte')
          and i.previsao_entrega is not null and i.previsao_entrega < hoje()) as entrega_atrasada,
       (i.status not in ('entregue','cancelado') and i.data_necessidade < hoje()) as necessidade_vencida,
       (i.data_necessidade - hoje()) as dias_para_necessidade
  from solicitacao_itens i
  join solicitacoes s on s.id = i.solicitacao_id
  join obras o on o.id = s.obra_id
  left join tarefas t on t.id = s.tarefa_id
  left join perfis ps on ps.id = s.solicitante_id;

create view v_solicitacoes with (security_invoker = true) as
select s.*,
       'SM-' || lpad(s.numero::text, 5, '0') as codigo,
       o.codigo as obra_codigo, o.nome as obra_nome,
       t.numero as tarefa_numero, t.titulo as tarefa_titulo,
       ps.nome as solicitante_nome, pa.nome as aprovador_nome,
       (select count(*) from solicitacao_itens i where i.solicitacao_id = s.id) as total_itens,
       (select count(*) from solicitacao_itens i where i.solicitacao_id = s.id and i.status = 'entregue') as itens_entregues,
       (select count(*) from solicitacao_itens i where i.solicitacao_id = s.id
          and i.status not in ('entregue','cancelado') and i.previsao_entrega > i.data_necessidade) as itens_em_risco
  from solicitacoes s
  join obras o on o.id = s.obra_id
  left join tarefas t on t.id = s.tarefa_id
  left join perfis ps on ps.id = s.solicitante_id
  left join perfis pa on pa.id = s.aprovado_por;

-- Avanço físico ponderado pela duração planejada de cada tarefa.
-- Calculado com SECURITY DEFINER para que todos vejam o mesmo número
-- (a view só devolve obras que o usuário já pode ver).
create or replace function avanco_obra(p_obra uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(case when t.status = 'aprovado' then 100 else t.percentual end
                            * (t.fim_previsto - t.inicio_previsto + 1))::numeric
                        / nullif(sum(t.fim_previsto - t.inicio_previsto + 1), 0), 1), 0)
    from tarefas t where t.obra_id = p_obra
$$;

create or replace function resumo_obra(p_obra uuid, out total bigint, out atrasadas bigint, out aprovadas bigint)
language sql stable security definer set search_path = public as $$
  select count(*),
         count(*) filter (where t.status not in ('aprovado','aguardando_validacao','concluido_encarregado') and t.fim_previsto < hoje()),
         count(*) filter (where t.status = 'aprovado')
    from tarefas t where t.obra_id = p_obra
$$;

create view v_obras with (security_invoker = true) as
select o.*,
       pe.nome as engenheiro_nome, pc.nome as encarregado_nome,
       avanco_obra(o.id) as avanco_fisico,
       (resumo_obra(o.id)).total     as total_tarefas,
       (resumo_obra(o.id)).atrasadas as tarefas_atrasadas,
       (resumo_obra(o.id)).aprovadas as tarefas_aprovadas
  from obras o
  left join perfis pe on pe.id = o.engenheiro_id
  left join perfis pc on pc.id = o.encarregado_id;
