-- =====================================================================
-- 08. CADASTROS BASE + SUPRIMENTOS UNIFICADO
--   Funções (tabela salarial), funcionários (centro de custo por obra),
--   dossiê, fornecedores, insumos com código, estoque por local,
--   cotações com aprovação da diretoria, ordens de compra, NF/boleto,
--   pronto para coleta e recebimento na obra.
-- =====================================================================

-- Novos perfis enxergam todas as obras
create or replace function ve_todas_obras() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel()::text in ('admin','compras','almoxarifado','financeiro','rh','seguranca'), false)
$$;

-- Valor em reais no padrão brasileiro (independe do idioma do servidor)
create or replace function _brl(v numeric) returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(v,0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

create or replace function tem_papel(variadic p text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel()::text = any(p), false)
$$;

create or replace function _notificar_papeis(p_papeis text[], p_tipo text, p_titulo text, p_msg text, p_link text, p_chave text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from perfis where ativo and papel::text = any(p_papeis) and id is distinct from auth.uid() loop
    perform _notificar(u, p_tipo, p_titulo, p_msg, p_link, p_chave);
  end loop;
end $$;

-- =====================================================================
-- CADASTROS
-- =====================================================================
create table funcoes (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null unique,
  cbo                 text,
  salario_base        numeric(12,2) not null default 0 check (salario_base >= 0),
  carga_diaria_horas  numeric(4,2) not null default 8 check (carga_diaria_horas > 0),
  vale_alimentacao_dia numeric(10,2) not null default 0,
  vale_transporte_dia  numeric(10,2) not null default 0,
  adicional_insalubridade_pct numeric(5,2) not null default 0,
  adicional_periculosidade boolean not null default false,
  epis_obrigatorios   text[] not null default '{}',
  riscos              text[] not null default '{}',
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create sequence funcionario_matricula_seq start 1001;
create table funcionarios (
  id                uuid primary key default gen_random_uuid(),
  matricula         text not null unique default nextval('funcionario_matricula_seq')::text,
  nome              text not null check (length(trim(nome)) >= 3),
  cpf               text unique,
  rg                text,
  data_nascimento   date,
  telefone          text,
  endereco          text,
  funcao_id         uuid references funcoes(id),
  obra_id           uuid references obras(id),          -- centro de custo
  salario           numeric(12,2),                       -- nulo = salário da função
  data_admissao     date not null default hoje(),
  ativo             boolean not null default true,
  data_demissao     date,
  motivo_demissao   text,
  banco             text,
  agencia           text,
  conta             text,
  pix               text,
  usuario_id        uuid unique references perfis(id),   -- quando o funcionário também usa o sistema
  face_descritor    real[],                              -- biometria (LGPD: só com consentimento)
  biometria_consentida_em timestamptz,
  observacoes       text,
  criado_por        uuid references perfis(id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint func_demissao_ck check (ativo or data_demissao is not null),
  constraint func_bio_ck check (face_descritor is null or biometria_consentida_em is not null)
);
create index on funcionarios (obra_id, ativo);
create index on funcionarios (funcao_id);

create table funcionario_documentos (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id),
  tipo           text not null,          -- ASO, NR-35, NR-18, Contrato, CTPS, RG/CPF, Certificado, Outro
  descricao      text,
  emissao        date,
  validade       date,
  caminho        text,
  tipo_mime      text,
  substituido    boolean not null default false,
  enviado_por    uuid references perfis(id),
  criado_em      timestamptz not null default now()
);
create index on funcionario_documentos (funcionario_id);

create table fornecedores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  documento  text unique,                 -- CNPJ ou CPF
  categoria  text,
  contato    text,
  telefone   text,
  email      text,
  endereco   text,
  pix        text,
  ativo      boolean not null default true,
  criado_por uuid references perfis(id),
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table insumos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique check (length(trim(codigo)) >= 2),
  descricao      text not null,
  unidade        text not null,
  categoria      text not null default 'Material',   -- Material, EPI, Ferramenta, Equipamento, Serviço…
  estoque_minimo numeric(14,3) not null default 0,
  ca             text,                               -- EPI: certificado de aprovação
  ca_validade    date,
  vida_util_dias int,                                -- EPI: periodicidade de troca
  ativo          boolean not null default true,
  criado_por     uuid references perfis(id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index on insumos (categoria);

-- Movimentos de estoque. obra_id nulo = depósito central.
create table estoque_movimentos (
  id          bigserial primary key,
  obra_id     uuid references obras(id),
  insumo_id   uuid not null references insumos(id),
  tipo        text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade  numeric(14,3) not null check (quantidade <> 0),
  origem      text not null,                -- recebimento_oc, envio_solicitacao, entrega_epi, consumo, ajuste_inventario, transferencia
  referencia  uuid,
  observacao  text,
  usuario_id  uuid references perfis(id),
  criado_em   timestamptz not null default now()
);
create index on estoque_movimentos (insumo_id, obra_id);

create view v_estoque with (security_invoker = true) as
select m.obra_id, m.insumo_id, i.codigo, i.descricao, i.unidade, i.categoria, i.estoque_minimo, i.ca,
       o.codigo as obra_codigo, coalesce(o.nome, 'Depósito central') as local_nome,
       sum(case when m.tipo = 'saida' then -abs(m.quantidade) else m.quantidade end) as saldo,
       sum(case when m.tipo = 'saida' then -abs(m.quantidade) else m.quantidade end) < i.estoque_minimo as abaixo_minimo,
       max(m.criado_em) as ultimo_movimento
  from estoque_movimentos m
  join insumos i on i.id = m.insumo_id
  left join obras o on o.id = m.obra_id
 group by m.obra_id, m.insumo_id, i.codigo, i.descricao, i.unidade, i.categoria, i.estoque_minimo, i.ca, o.codigo, o.nome;

create or replace function saldo_estoque(p_insumo uuid, p_obra uuid default null, p_todos boolean default false) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'saida' then -abs(quantidade) else quantidade end), 0)
    from estoque_movimentos
   where insumo_id = p_insumo and (p_todos or obra_id is not distinct from p_obra)
$$;

create or replace function _movimentar(p_obra uuid, p_insumo uuid, p_tipo text, p_qtd numeric, p_origem text, p_ref uuid, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo = 'saida' and saldo_estoque(p_insumo, p_obra) < abs(p_qtd) then
    raise exception 'Saldo insuficiente de % em %: disponível %',
      (select codigo || ' — ' || descricao from insumos where id = p_insumo),
      coalesce((select nome from obras where id = p_obra), 'Depósito central'),
      trim_scale(saldo_estoque(p_insumo, p_obra));
  end if;
  insert into estoque_movimentos (obra_id, insumo_id, tipo, quantidade, origem, referencia, observacao, usuario_id)
  values (p_obra, p_insumo, p_tipo, case when p_tipo = 'saida' then abs(p_qtd) else p_qtd end, p_origem, p_ref, p_obs, auth.uid());
  -- alerta de estoque mínimo
  if p_tipo <> 'entrada' and exists (select 1 from insumos where id = p_insumo and estoque_minimo > 0
        and saldo_estoque(p_insumo, p_obra) < estoque_minimo) then
    perform _notificar_papel('compras', 'estoque_minimo',
      'Estoque abaixo do mínimo: ' || (select codigo || ' — ' || descricao from insumos where id = p_insumo),
      format('%s • saldo %s', coalesce((select nome from obras where id = p_obra), 'Depósito central'), trim_scale(saldo_estoque(p_insumo, p_obra))),
      '/suprimentos/estoque', 'min:' || p_insumo || ':' || coalesce(p_obra::text,'c') || ':' || hoje());
    perform _notificar_papel('almoxarifado', 'estoque_minimo',
      'Estoque abaixo do mínimo: ' || (select codigo || ' — ' || descricao from insumos where id = p_insumo),
      format('%s • saldo %s', coalesce((select nome from obras where id = p_obra), 'Depósito central'), trim_scale(saldo_estoque(p_insumo, p_obra))),
      '/suprimentos/estoque', 'min:' || p_insumo || ':' || coalesce(p_obra::text,'c') || ':' || hoje());
  end if;
end $$;

-- Lançamento manual (inventário, consumo, entrada avulsa, transferência)
create or replace function estoque_lancar(p_obra uuid, p_insumo uuid, p_tipo text, p_quantidade numeric, p_observacao text,
                                          p_destino uuid default null, p_transferir boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('almoxarifado','admin') then raise exception 'Apenas o almoxarifado movimenta o estoque'; end if;
  if p_quantidade is null or p_quantidade = 0 then raise exception 'Informe a quantidade'; end if;
  if coalesce(length(trim(p_observacao)),0) < 3 then raise exception 'Informe o motivo / documento do lançamento'; end if;
  if p_transferir then
    if p_destino is not distinct from p_obra then raise exception 'Origem e destino iguais'; end if;
    perform _movimentar(p_obra, p_insumo, 'saida', abs(p_quantidade), 'transferencia', p_destino, p_observacao);
    perform _movimentar(p_destino, p_insumo, 'entrada', abs(p_quantidade), 'transferencia', p_obra, p_observacao);
  elsif p_tipo in ('entrada','saida') then
    perform _movimentar(p_obra, p_insumo, p_tipo, abs(p_quantidade), case when p_tipo = 'saida' then 'consumo' else 'entrada_avulsa' end, null, p_observacao);
  elsif p_tipo = 'ajuste' then
    if saldo_estoque(p_insumo, p_obra) + p_quantidade < 0 then raise exception 'Ajuste deixaria o saldo negativo'; end if;
    perform _movimentar(p_obra, p_insumo, 'ajuste', p_quantidade, 'ajuste_inventario', null, p_observacao);
  else
    raise exception 'Tipo de lançamento inválido';
  end if;
end $$;

-- Desligamento sem apagar dossiê (risco trabalhista)
create or replace function funcionario_desligar(p_func uuid, p_data date, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('rh','admin') then raise exception 'Apenas RH ou diretoria desliga funcionários'; end if;
  if coalesce(length(trim(p_motivo)),0) < 3 then raise exception 'Informe o motivo do desligamento'; end if;
  update funcionarios set ativo = false, data_demissao = coalesce(p_data, hoje()), motivo_demissao = p_motivo where id = p_func and ativo;
  if not found then raise exception 'Funcionário não encontrado ou já desligado'; end if;
end $$;

create or replace function funcionario_reativar(p_func uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('rh','admin') then raise exception 'Apenas RH ou diretoria reativa funcionários'; end if;
  update funcionarios set ativo = true, data_demissao = null, motivo_demissao = null where id = p_func and not ativo;
end $$;

-- =====================================================================
-- SUPRIMENTOS — liga os itens pedidos aos insumos e ao estoque
-- =====================================================================
alter table solicitacao_itens
  add column insumo_id uuid references insumos(id),
  add column origem_estoque boolean not null default false,
  add column estoque_obra_id uuid references obras(id),
  add column cotacao_id uuid,
  add column oc_id uuid;
create index on solicitacao_itens (insumo_id);

-- Reconhece o insumo pelo texto "CÓDIGO — descrição" ou pela descrição exata
create or replace function _tg_itens_insumo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v insumos;
begin
  if new.insumo_id is null then
    select * into v from insumos where ativo and (
        upper(codigo) = upper(trim(split_part(new.material, ' — ', 1)))
     or lower(descricao) = lower(trim(new.material))) limit 1;
    if found then
      new.insumo_id := v.id;
      if position(' — ' in new.material) > 0 then new.material := v.descricao; end if;
      new.unidade := coalesce(nullif(new.unidade,''), v.unidade);
    end if;
  end if;
  return new;
end $$;
create trigger tg_itens_insumo before insert on solicitacao_itens for each row execute function _tg_itens_insumo();

-- Verificação de estoque usa o saldo real quando o item tem insumo
create or replace function item_verificar_estoque(p_item uuid, p_disponivel numeric, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes; v_novo uuid; v_local uuid; v_saldo numeric;
begin
  if meu_papel() not in ('almoxarifado','admin') then raise exception 'Apenas o almoxarifado registra a verificação de estoque'; end if;
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if i.status <> 'aprovado' then raise exception 'O item precisa estar aprovado para verificação de estoque'; end if;
  if p_disponivel is null or p_disponivel < 0 or p_disponivel > i.quantidade then
    raise exception 'Quantidade disponível deve estar entre 0 e %', trim_scale(i.quantidade);
  end if;
  select * into s from solicitacoes where id = i.solicitacao_id;

  if i.insumo_id is not null and p_disponivel > 0 then
    -- prioriza o estoque da própria obra; depois o depósito central
    if saldo_estoque(i.insumo_id, s.obra_id) >= p_disponivel then v_local := s.obra_id;
    elsif saldo_estoque(i.insumo_id, null) >= p_disponivel then v_local := null;
    else
      v_saldo := greatest(saldo_estoque(i.insumo_id, s.obra_id), saldo_estoque(i.insumo_id, null));
      raise exception 'O sistema registra só % % disponíveis num mesmo local (obra ou depósito central). Ajuste a quantidade ou lance a entrada no estoque.',
        trim_scale(v_saldo), i.unidade;
    end if;
  end if;

  if p_disponivel = i.quantidade then
    update solicitacao_itens set status = 'disponivel_estoque', origem_estoque = true, estoque_obra_id = v_local where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel, coalesce(p_observacao, 'Disponível em estoque — separado'));
  elsif p_disponivel = 0 then
    update solicitacao_itens set status = 'em_cotacao' where id = p_item;
    perform _item_evento(p_item, i.status, 'em_cotacao', 0, coalesce(p_observacao, 'Sem estoque — encaminhado para compras'));
  else
    update solicitacao_itens set status = 'disponivel_estoque', quantidade = p_disponivel, origem_estoque = true, estoque_obra_id = v_local where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel,
      format('Estoque parcial: %s de %s %s separados', trim_scale(p_disponivel), trim_scale(i.quantidade), i.unidade));
    insert into solicitacao_itens (solicitacao_id, item_origem_id, insumo_id, material, especificacao, unidade, quantidade, data_necessidade, status)
    values (i.solicitacao_id, p_item, i.insumo_id, i.material, i.especificacao, i.unidade, i.quantidade - p_disponivel, i.data_necessidade, 'em_cotacao')
    returning id into v_novo;
    perform _item_evento(v_novo, 'aprovado', 'em_cotacao', i.quantidade - p_disponivel, 'Saldo sem estoque encaminhado para compras');
  end if;

  if p_disponivel < i.quantidade then
    perform _notificar_papel('compras', 'compra_necessaria', 'Cotar: ' || i.material,
      format('%s • %s %s • necessário em %s', _cod_sm(s.numero), trim_scale(i.quantidade - p_disponivel), i.unidade,
             to_char(i.data_necessidade,'DD/MM/YYYY')), '/suprimentos/cotacoes/nova');
  end if;
  perform _sol_atualizar_status(i.solicitacao_id);
end $$;

-- Saída do estoque quando o almoxarifado envia para a obra
create or replace function _tg_entregas_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens;
begin
  select * into i from solicitacao_itens where id = new.item_id;
  if i.oc_id is not null and i.status in ('compra_autorizada','comprado','em_transporte') then
    raise exception 'Este item foi comprado pela % e ainda não chegou. Lance o recebimento da OC antes de enviar para a obra.',
      (select _cod_oc(numero) from ordens_compra where id = i.oc_id);
  end if;
  if i.insumo_id is not null and i.origem_estoque then
    perform _movimentar(i.estoque_obra_id, i.insumo_id, 'saida', new.quantidade_enviada, 'envio_solicitacao', new.id,
      'Envio para a obra — ' || (select _cod_sm(numero) from solicitacoes where id = i.solicitacao_id));
  end if;
  return new;
end $$;
create trigger tg_entregas_estoque after insert on entregas for each row execute function _tg_entregas_estoque();

-- =====================================================================
-- COTAÇÕES (ORÇAMENTOS) → aprovação da diretoria
-- =====================================================================
create sequence cotacao_numero_seq;
create table cotacoes (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint not null unique default nextval('cotacao_numero_seq'),
  obra_id         uuid references obras(id),          -- nulo = reposição do depósito central
  status          text not null default 'em_cotacao' check (status in ('em_cotacao','aguardando_aprovacao','aprovada','recusada','cancelada')),
  justificativa_estoque text,                          -- obrigatória quando já existe estoque do insumo
  proposta_escolhida_id uuid,
  justificativa_escolha text,
  observacoes     text,
  criado_por      uuid not null references perfis(id),
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz,
  decidido_por    uuid references perfis(id),
  decidido_em     timestamptz,
  parecer         text,
  atualizado_em   timestamptz not null default now()
);
create table cotacao_itens (
  id                  uuid primary key default gen_random_uuid(),
  cotacao_id          uuid not null references cotacoes(id),
  solicitacao_item_id uuid references solicitacao_itens(id),
  insumo_id           uuid references insumos(id),
  descricao           text not null,
  unidade             text not null,
  quantidade          numeric(14,3) not null check (quantidade > 0),
  estoque_no_momento  numeric(14,3)
);
create index on cotacao_itens (cotacao_id);
create unique index cotacao_itens_unico on cotacao_itens (solicitacao_item_id) where solicitacao_item_id is not null;

create table cotacao_propostas (
  id                  uuid primary key default gen_random_uuid(),
  cotacao_id          uuid not null references cotacoes(id),
  fornecedor_id       uuid not null references fornecedores(id),
  prazo_entrega_dias  int not null check (prazo_entrega_dias >= 0),
  condicao_pagamento  text,
  frete               numeric(12,2) not null default 0,
  observacoes         text,
  anexo_caminho       text,
  valor_total         numeric(14,2) not null default 0,
  criado_por          uuid references perfis(id),
  criado_em           timestamptz not null default now(),
  unique (cotacao_id, fornecedor_id)
);
create table cotacao_precos (
  proposta_id      uuid not null references cotacao_propostas(id),
  cotacao_item_id  uuid not null references cotacao_itens(id),
  preco_unitario   numeric(14,4) not null check (preco_unitario >= 0),
  primary key (proposta_id, cotacao_item_id)
);
alter table cotacoes add constraint cot_proposta_fk foreign key (proposta_escolhida_id) references cotacao_propostas(id);
alter table solicitacao_itens add constraint itens_cot_fk foreign key (cotacao_id) references cotacoes(id);

-- =====================================================================
-- ORDENS DE COMPRA
-- =====================================================================
create sequence oc_numero_seq;
create table ordens_compra (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint not null unique default nextval('oc_numero_seq'),
  cotacao_id         uuid not null unique references cotacoes(id),
  obra_id            uuid references obras(id),
  fornecedor_id      uuid not null references fornecedores(id),
  valor_total        numeric(14,2) not null,
  frete              numeric(12,2) not null default 0,
  condicao_pagamento text,
  previsao_entrega   date,
  modalidade         text not null default 'entrega' check (modalidade in ('entrega','retirada')),
  retirante          text,
  status             text not null default 'emitida'
                     check (status in ('emitida','pronta_coleta','recebida_parcial','recebida','cancelada')),
  pagamento          text check (pagamento in ('pago','faturado')),
  pago_em            timestamptz,
  nf_numero          text,
  nf_valor           numeric(14,2),
  nf_divergente      boolean not null default false,
  emitida_por        uuid references perfis(id),
  emitida_em         timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index on ordens_compra (status);
create index on ordens_compra (obra_id);
alter table solicitacao_itens add constraint itens_oc_fk foreign key (oc_id) references ordens_compra(id);

create table oc_itens (
  id                  uuid primary key default gen_random_uuid(),
  oc_id               uuid not null references ordens_compra(id),
  cotacao_item_id     uuid not null references cotacao_itens(id),
  solicitacao_item_id uuid references solicitacao_itens(id),
  insumo_id           uuid references insumos(id),
  descricao           text not null,
  unidade             text not null,
  quantidade          numeric(14,3) not null,
  preco_unitario      numeric(14,4) not null,
  quantidade_recebida numeric(14,3) not null default 0
);
create index on oc_itens (oc_id);

create table oc_documentos (
  id          uuid primary key default gen_random_uuid(),
  oc_id       uuid not null references ordens_compra(id),
  tipo        text not null check (tipo in ('nf','boleto','comprovante','outro')),
  numero      text,
  valor       numeric(14,2),
  vencimento  date,
  caminho     text,
  tipo_mime   text,
  enviado_por uuid not null references perfis(id),
  criado_em   timestamptz not null default now()
);
create index on oc_documentos (oc_id);

create table oc_eventos (
  id         bigserial primary key,
  oc_id      uuid not null references ordens_compra(id),
  usuario_id uuid references perfis(id),
  tipo       text not null,
  descricao  text,
  criado_em  timestamptz not null default now()
);
create index on oc_eventos (oc_id, criado_em);

create or replace function _oc_evento(p_oc uuid, p_tipo text, p_desc text) returns void
language sql security definer set search_path = public as $$
  insert into oc_eventos (oc_id, usuario_id, tipo, descricao) values (p_oc, auth.uid(), p_tipo, p_desc)
$$;
create or replace function _cod_oc(n bigint) returns text language sql immutable set search_path = public as $$ select 'OC-' || lpad(n::text, 5, '0') $$;
create or replace function _cod_cot(n bigint) returns text language sql immutable set search_path = public as $$ select 'COT-' || lpad(n::text, 5, '0') $$;

-- ---------------------------------------------------------------------
-- Criar cotação a partir dos itens pendentes (e/ou reposição de estoque)
-- p_itens: [{solicitacao_item_id}] ou [{insumo_id, quantidade}]
-- ---------------------------------------------------------------------
create or replace function cotacao_criar(p_obra uuid, p_itens jsonb, p_justificativa_estoque text default null, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; si solicitacao_itens; ins insumos; v_saldo numeric; v_com_estoque text := ''; v_obra uuid := p_obra; v_sol solicitacoes;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador cria cotações'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Selecione os itens a cotar'; end if;

  insert into cotacoes (obra_id, justificativa_estoque, observacoes, criado_por)
  values (p_obra, nullif(trim(p_justificativa_estoque),''), p_observacoes, auth.uid()) returning id into v_id;

  for it in select * from jsonb_array_elements(p_itens) loop
    if it ? 'solicitacao_item_id' then
      select * into si from solicitacao_itens where id = (it->>'solicitacao_item_id')::uuid for update;
      if not found or si.status <> 'em_cotacao' then raise exception 'Item de solicitação inválido ou já cotado'; end if;
      select * into v_sol from solicitacoes where id = si.solicitacao_id;
      if v_obra is null then v_obra := v_sol.obra_id; update cotacoes set obra_id = v_obra where id = v_id;
      elsif v_sol.obra_id <> v_obra then raise exception 'Uma cotação só pode ter itens de uma mesma obra'; end if;
      v_saldo := case when si.insumo_id is not null then saldo_estoque(si.insumo_id, null, true) end;
      insert into cotacao_itens (cotacao_id, solicitacao_item_id, insumo_id, descricao, unidade, quantidade, estoque_no_momento)
      values (v_id, si.id, si.insumo_id, si.material || coalesce(' — ' || si.especificacao, ''), si.unidade, si.quantidade, v_saldo);
      update solicitacao_itens set cotacao_id = v_id where id = si.id;
      perform _item_evento(si.id, si.status, si.status, si.quantidade, 'Incluído na cotação ' || _cod_cot((select numero from cotacoes where id = v_id)));
    else
      select * into ins from insumos where id = (it->>'insumo_id')::uuid and ativo;
      if not found then raise exception 'Insumo inválido'; end if;
      if coalesce((it->>'quantidade')::numeric, 0) <= 0 then raise exception 'Quantidade inválida para %', ins.codigo; end if;
      v_saldo := saldo_estoque(ins.id, null, true);
      insert into cotacao_itens (cotacao_id, insumo_id, descricao, unidade, quantidade, estoque_no_momento)
      values (v_id, ins.id, ins.codigo || ' — ' || ins.descricao, ins.unidade, (it->>'quantidade')::numeric, v_saldo);
    end if;
    if coalesce(v_saldo, 0) > 0 then
      v_com_estoque := v_com_estoque || format('%s (%s em estoque); ', coalesce(ins.descricao, si.material), trim_scale(v_saldo));
    end if;
  end loop;

  -- Regra da FJ: questionar o comprador quando já existe estoque do item
  if v_com_estoque <> '' and coalesce(length(trim(p_justificativa_estoque)),0) < 10 then
    raise exception 'Já existe estoque de: %Justifique a compra (mín. 10 caracteres) ou peça ao almoxarifado para dar baixa.', v_com_estoque;
  end if;
  return v_id;
end $$;

create or replace function cotacao_proposta_salvar(p_cotacao uuid, p_fornecedor uuid, p_prazo int, p_condicao text,
                                                   p_frete numeric, p_precos jsonb, p_obs text default null, p_anexo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c cotacoes; v_id uuid; it jsonb; v_total numeric;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador registra propostas'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'em_cotacao' then raise exception 'A cotação não está aberta para propostas'; end if;
  insert into cotacao_propostas (cotacao_id, fornecedor_id, prazo_entrega_dias, condicao_pagamento, frete, observacoes, anexo_caminho, criado_por)
  values (p_cotacao, p_fornecedor, coalesce(p_prazo,0), p_condicao, coalesce(p_frete,0), p_obs, p_anexo, auth.uid())
  on conflict (cotacao_id, fornecedor_id) do update set prazo_entrega_dias = excluded.prazo_entrega_dias,
     condicao_pagamento = excluded.condicao_pagamento, frete = excluded.frete, observacoes = excluded.observacoes,
     anexo_caminho = coalesce(excluded.anexo_caminho, cotacao_propostas.anexo_caminho)
  returning id into v_id;
  delete from cotacao_precos where proposta_id = v_id;
  for it in select * from jsonb_array_elements(p_precos) loop
    if not exists (select 1 from cotacao_itens where id = (it->>'cotacao_item_id')::uuid and cotacao_id = p_cotacao) then
      raise exception 'Item não pertence à cotação';
    end if;
    if nullif(it->>'preco_unitario','') is not null then
      insert into cotacao_precos values (v_id, (it->>'cotacao_item_id')::uuid, (it->>'preco_unitario')::numeric);
    end if;
  end loop;
  if (select count(*) from cotacao_precos where proposta_id = v_id) < (select count(*) from cotacao_itens where cotacao_id = p_cotacao) then
    raise exception 'Informe o preço de todos os itens da cotação';
  end if;
  select round(sum(p.preco_unitario * i.quantidade), 2) + coalesce(p_frete,0) into v_total
    from cotacao_precos p join cotacao_itens i on i.id = p.cotacao_item_id where p.proposta_id = v_id;
  update cotacao_propostas set valor_total = v_total where id = v_id;
  return v_id;
end $$;

create or replace function cotacao_enviar_aprovacao(p_cotacao uuid, p_proposta uuid, p_justificativa text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c cotacoes; p cotacao_propostas; v_min numeric; v_n int;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador envia para aprovação'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'em_cotacao' then raise exception 'A cotação não está em andamento'; end if;
  select * into p from cotacao_propostas where id = p_proposta and cotacao_id = p_cotacao;
  if not found then raise exception 'Escolha uma das propostas desta cotação'; end if;
  select count(*), min(valor_total) into v_n, v_min from cotacao_propostas where cotacao_id = p_cotacao;
  if p.valor_total > v_min and coalesce(length(trim(p_justificativa)),0) < 10 then
    raise exception 'A proposta escolhida não é a de menor valor (menor: %). Justifique a escolha.', _brl(v_min);
  end if;
  update cotacoes set status = 'aguardando_aprovacao', proposta_escolhida_id = p_proposta,
         justificativa_escolha = nullif(trim(p_justificativa),''), enviado_em = now() where id = p_cotacao;
  perform _notificar_papel('admin', 'cotacao_aprovar', 'Aprovar compra ' || _cod_cot(c.numero),
    format('%s • %s proposta(s) • escolhida: %s — %s', coalesce((select nome from obras where id = c.obra_id), 'Depósito central'), v_n,
           (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total)),
    '/suprimentos/cotacoes/' || p_cotacao);
end $$;

-- Aprovação da diretoria gera a OC
create or replace function cotacao_decidir(p_cotacao uuid, p_aprovar boolean, p_parecer text default null,
                                           p_modalidade text default 'entrega', p_retirante text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c cotacoes; p cotacao_propostas; v_oc uuid; v_num bigint; r record; v_prev date; v_sol solicitacoes;
begin
  if not tem_papel('admin') then raise exception 'Apenas a diretoria aprova compras'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'aguardando_aprovacao' then raise exception 'A cotação não está aguardando aprovação'; end if;
  if not p_aprovar then
    if coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo da recusa'; end if;
    update cotacoes set status = 'em_cotacao', decidido_por = auth.uid(), decidido_em = now(), parecer = p_parecer,
           proposta_escolhida_id = null where id = p_cotacao;
    perform _notificar(c.criado_por, 'cotacao_recusada', 'Compra recusada ' || _cod_cot(c.numero), p_parecer, '/suprimentos/cotacoes/' || p_cotacao);
    return null;
  end if;

  select * into p from cotacao_propostas where id = c.proposta_escolhida_id;
  v_prev := hoje() + p.prazo_entrega_dias;
  insert into ordens_compra (cotacao_id, obra_id, fornecedor_id, valor_total, frete, condicao_pagamento, previsao_entrega,
                             modalidade, retirante, emitida_por)
  values (p_cotacao, c.obra_id, p.fornecedor_id, p.valor_total, p.frete, p.condicao_pagamento, v_prev,
          coalesce(p_modalidade,'entrega'), p_retirante, auth.uid())
  returning id, numero into v_oc, v_num;

  for r in select i.*, pr.preco_unitario from cotacao_itens i join cotacao_precos pr on pr.cotacao_item_id = i.id and pr.proposta_id = p.id
            where i.cotacao_id = p_cotacao loop
    insert into oc_itens (oc_id, cotacao_item_id, solicitacao_item_id, insumo_id, descricao, unidade, quantidade, preco_unitario)
    values (v_oc, r.id, r.solicitacao_item_id, r.insumo_id, r.descricao, r.unidade, r.quantidade, r.preco_unitario);
    if r.solicitacao_item_id is not null then
      update solicitacao_itens set status = 'compra_autorizada', oc_id = v_oc, fornecedor = (select nome from fornecedores where id = p.fornecedor_id),
             previsao_entrega = v_prev where id = r.solicitacao_item_id;
      perform _item_evento(r.solicitacao_item_id, 'em_cotacao', 'compra_autorizada', r.quantidade, 'Compra aprovada pela diretoria — ' || _cod_oc(v_num));
      select s.* into v_sol from solicitacoes s join solicitacao_itens si on si.solicitacao_id = s.id where si.id = r.solicitacao_item_id;
      perform _sol_atualizar_status(v_sol.id);
      if v_prev > (select data_necessidade from solicitacao_itens where id = r.solicitacao_item_id) then
        perform _notificar_engenheiros(v_sol.obra_id, 'risco_atraso_material', 'Risco de atraso: ' || r.descricao,
          format('%s • entrega prevista %s, necessário em %s', _cod_oc(v_num), to_char(v_prev,'DD/MM/YYYY'),
                 to_char((select data_necessidade from solicitacao_itens where id = r.solicitacao_item_id),'DD/MM/YYYY')),
          '/suprimentos/ordens/' || v_oc, 'risco:' || r.solicitacao_item_id || ':' || v_prev);
        perform _notificar(v_sol.solicitante_id, 'risco_atraso_material', 'Material pode atrasar: ' || r.descricao,
          'Entrega prevista para ' || to_char(v_prev,'DD/MM/YYYY'), '/materiais/' || v_sol.id, 'risco:' || r.solicitacao_item_id || ':' || v_prev);
      end if;
    end if;
  end loop;

  update cotacoes set status = 'aprovada', decidido_por = auth.uid(), decidido_em = now(), parecer = p_parecer where id = p_cotacao;
  perform _oc_evento(v_oc, 'emitida', format('OC emitida após aprovação da diretoria. Fornecedor: %s. Valor: %s',
    (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total)));
  -- "a partir do momento que aprova, todos visualizam"
  perform _notificar_papeis(array['compras','financeiro','almoxarifado'], 'oc_emitida', 'Ordem de compra ' || _cod_oc(v_num) || ' emitida',
    format('%s • %s • %s', coalesce((select nome from obras where id = c.obra_id), 'Depósito central'),
           (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total)),
    '/suprimentos/ordens/' || v_oc);
  if c.obra_id is not null then
    perform _notificar_engenheiros(c.obra_id, 'oc_emitida', 'Compra aprovada: ' || _cod_oc(v_num),
      'Previsão de entrega ' || to_char(v_prev,'DD/MM/YYYY'), '/suprimentos/ordens/' || v_oc);
  end if;
  return v_oc;
end $$;

create or replace function cotacao_cancelar(p_cotacao uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare c cotacoes;
begin
  if not tem_papel('compras','admin') then raise exception 'Sem permissão'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status not in ('em_cotacao','aguardando_aprovacao') then raise exception 'Cotação não pode ser cancelada'; end if;
  if coalesce(length(trim(p_motivo)),0) < 5 then raise exception 'Informe o motivo'; end if;
  update cotacoes set status = 'cancelada', parecer = p_motivo where id = p_cotacao;
  update solicitacao_itens set cotacao_id = null where cotacao_id = p_cotacao;   -- itens voltam para a fila de cotação
end $$;

-- ---------------------------------------------------------------------
-- OC: documentos (NF/boleto/comprovante por foto), pagamento, recebimento
-- ---------------------------------------------------------------------
create or replace function oc_anexar_documento(p_oc uuid, p_tipo text, p_numero text, p_valor numeric, p_vencimento date,
                                               p_caminho text, p_mime text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o ordens_compra; v_id uuid; v_div boolean;
begin
  select * into o from ordens_compra where id = p_oc for update;
  if not found then raise exception 'OC não encontrada'; end if;
  if not (tem_papel('compras','financeiro','almoxarifado','admin') or (o.obra_id is not null and membro_obra(o.obra_id) and tem_papel('engenheiro','encarregado'))) then
    raise exception 'Sem permissão para anexar documentos a esta OC';
  end if;
  if o.status = 'cancelada' then raise exception 'OC cancelada'; end if;
  if p_tipo = 'nf' and coalesce(trim(p_numero),'') = '' then raise exception 'Informe o número da nota fiscal'; end if;
  insert into oc_documentos (oc_id, tipo, numero, valor, vencimento, caminho, tipo_mime, enviado_por)
  values (p_oc, p_tipo, nullif(trim(p_numero),''), p_valor, p_vencimento, p_caminho, p_mime, auth.uid()) returning id into v_id;
  if p_tipo = 'nf' then
    -- "a NF tem que conversar com a ordem de compra sempre"
    v_div := p_valor is not null and abs(p_valor - o.valor_total) > greatest(1, o.valor_total * 0.01);
    update ordens_compra set nf_numero = trim(p_numero), nf_valor = p_valor, nf_divergente = v_div where id = p_oc;
    perform _oc_evento(p_oc, 'nf', format('NF %s anexada%s', trim(p_numero),
      case when v_div then format(' — DIVERGENTE: NF %s × OC %s', _brl(p_valor), _brl(o.valor_total)) else '' end));
    if v_div then
      perform _notificar_papeis(array['admin','compras','financeiro'], 'nf_divergente', 'NF divergente da ' || _cod_oc(o.numero),
        format('NF %s: %s • OC: %s', trim(p_numero), _brl(p_valor), _brl(o.valor_total)),
        '/suprimentos/ordens/' || p_oc);
    else
      perform _notificar_papeis(array['compras','financeiro'], 'nf_lancada', 'NF lançada na ' || _cod_oc(o.numero),
        'NF ' || trim(p_numero) || ' pronta para lançamento financeiro.', '/suprimentos/ordens/' || p_oc);
    end if;
  else
    perform _oc_evento(p_oc, p_tipo, initcap(p_tipo) || coalesce(' ' || p_numero, '') || ' anexado');
    if p_tipo = 'boleto' then
      perform _notificar_papeis(array['financeiro','compras'], 'boleto_lancado', 'Boleto da ' || _cod_oc(o.numero),
        format('%s • vence %s', _brl(coalesce(p_valor,o.valor_total)), coalesce(to_char(p_vencimento,'DD/MM/YYYY'),'—')),
        '/suprimentos/ordens/' || p_oc);
    end if;
  end if;
  return v_id;
end $$;

create or replace function oc_liberar_coleta(p_oc uuid, p_pagamento text, p_retirante text default null, p_previsao date default null)
returns void language plpgsql security definer set search_path = public as $$
declare o ordens_compra;
begin
  if not tem_papel('compras','financeiro','admin') then raise exception 'Apenas compras/financeiro registram o pagamento'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status <> 'emitida' then raise exception 'A OC não está aguardando pagamento/faturamento'; end if;
  if p_pagamento not in ('pago','faturado') then raise exception 'Informe se foi pago ou faturado'; end if;
  if o.modalidade = 'retirada' and coalesce(trim(coalesce(p_retirante, o.retirante)),'') = '' then
    raise exception 'Informe quem vai retirar o material (a OC acompanha o retirante)';
  end if;
  update ordens_compra set status = 'pronta_coleta', pagamento = p_pagamento, pago_em = now(),
         retirante = coalesce(nullif(trim(p_retirante),''), retirante), previsao_entrega = coalesce(p_previsao, previsao_entrega)
   where id = p_oc;
  update solicitacao_itens set status = 'comprado', comprado_em = now(), previsao_entrega = coalesce(p_previsao, previsao_entrega)
   where oc_id = p_oc and status = 'compra_autorizada';
  perform _oc_evento(p_oc, 'pronta_coleta', format('%s — %s', initcap(p_pagamento),
    case when o.modalidade = 'retirada' then 'pronto para coleta por ' || coalesce(nullif(trim(p_retirante),''), o.retirante) else 'aguardando entrega do fornecedor' end));
  perform _notificar_papeis(array['almoxarifado','compras','financeiro'], 'oc_pronta_coleta',
    _cod_oc(o.numero) || case when o.modalidade = 'retirada' then ' pronta para coleta' else ' paga — aguardando entrega' end,
    format('%s • %s', (select nome from fornecedores where id = o.fornecedor_id),
      case when o.modalidade = 'retirada' then 'Retirante: ' || coalesce(nullif(trim(p_retirante),''), o.retirante) else 'Previsão ' || to_char(coalesce(p_previsao, o.previsao_entrega),'DD/MM/YYYY') end),
    '/suprimentos/ordens/' || p_oc);
  if o.obra_id is not null then
    perform _notificar_engenheiros(o.obra_id, 'oc_pronta_coleta', _cod_oc(o.numero) || ' paga/faturada', 'Material a caminho da obra.', '/suprimentos/ordens/' || p_oc);
  end if;
end $$;

-- Recebimento na obra (almoxarifado): entra no estoque e libera os itens pedidos
create or replace function oc_receber(p_oc uuid, p_itens jsonb, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o ordens_compra; it jsonb; oi oc_itens; q numeric; si solicitacao_itens; v_sol solicitacoes; v_txt text := '';
begin
  if not tem_papel('almoxarifado','admin') then raise exception 'Apenas o almoxarifado registra o recebimento'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status not in ('emitida','pronta_coleta','recebida_parcial') then raise exception 'OC não está aguardando recebimento'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    q := coalesce(nullif(it->>'quantidade','')::numeric, 0);
    continue when q = 0;
    select * into oi from oc_itens where id = (it->>'oc_item_id')::uuid and oc_id = p_oc for update;
    if not found then raise exception 'Item não pertence à OC'; end if;
    if q < 0 or oi.quantidade_recebida + q > oi.quantidade then
      raise exception 'Quantidade recebida de "%" excede o pedido (restam %)', oi.descricao, trim_scale(oi.quantidade - oi.quantidade_recebida);
    end if;
    update oc_itens set quantidade_recebida = quantidade_recebida + q where id = oi.id;
    v_txt := v_txt || format('%s %s %s; ', trim_scale(q), oi.unidade, oi.descricao);
    if oi.insumo_id is not null then
      perform _movimentar(o.obra_id, oi.insumo_id, 'entrada', q, 'recebimento_oc', p_oc, _cod_oc(o.numero) || coalesce(' NF ' || o.nf_numero, ''));
    end if;
    -- item pedido pela obra: quando chega tudo, fica disponível para envio/entrega ao encarregado
    if oi.solicitacao_item_id is not null and oi.quantidade_recebida + q >= oi.quantidade then
      select * into si from solicitacao_itens where id = oi.solicitacao_item_id;
      update solicitacao_itens set status = 'disponivel_estoque', origem_estoque = (oi.insumo_id is not null),
             estoque_obra_id = o.obra_id where id = si.id;
      perform _item_evento(si.id, si.status, 'disponivel_estoque', q, 'Recebido na obra — ' || _cod_oc(o.numero));
      select * into v_sol from solicitacoes where id = si.solicitacao_id;
      perform _notificar(v_sol.solicitante_id, 'material_recebido_obra', 'Chegou: ' || si.material,
        format('%s %s recebidos pelo almoxarifado (%s)', trim_scale(oi.quantidade), oi.unidade, _cod_oc(o.numero)), '/materiais/' || v_sol.id);
      perform _sol_atualizar_status(v_sol.id);
    end if;
  end loop;
  if v_txt = '' then raise exception 'Informe a quantidade recebida de pelo menos um item'; end if;
  update ordens_compra set status = case when not exists (select 1 from oc_itens where oc_id = p_oc and quantidade_recebida < quantidade)
                                         then 'recebida' else 'recebida_parcial' end where id = p_oc;
  perform _oc_evento(p_oc, 'recebimento', 'Recebido: ' || v_txt || coalesce(' Obs.: ' || p_observacao, ''));
  -- "o que chegar na obra o almoxarifado lança e todos visualizam"
  perform _notificar_papeis(array['compras','financeiro'], 'oc_recebida', 'Material recebido — ' || _cod_oc(o.numero), v_txt, '/suprimentos/ordens/' || p_oc);
  if o.obra_id is not null then
    perform _notificar_engenheiros(o.obra_id, 'oc_recebida', 'Material recebido — ' || _cod_oc(o.numero), v_txt, '/suprimentos/ordens/' || p_oc);
  end if;
end $$;

create or replace function oc_cancelar(p_oc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordens_compra;
begin
  if not tem_papel('admin') then raise exception 'Apenas a diretoria cancela ordens de compra'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status not in ('emitida','pronta_coleta') then raise exception 'OC não pode ser cancelada (já recebida ou cancelada)'; end if;
  if coalesce(length(trim(p_motivo)),0) < 5 then raise exception 'Informe o motivo'; end if;
  update ordens_compra set status = 'cancelada' where id = p_oc;
  update solicitacao_itens set status = 'em_cotacao', oc_id = null, cotacao_id = null, fornecedor = null, previsao_entrega = null
   where oc_id = p_oc and status in ('compra_autorizada','comprado');
  perform _oc_evento(p_oc, 'cancelada', p_motivo);
end $$;

-- Views criadas com "t.*"/"i.*" precisam ser recriadas para enxergar colunas novas
-- (tarefas.planilha_item_id da 05; solicitacao_itens.insumo_id/cotacao_id/oc_id desta 08)
drop view if exists v_tarefas;
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

drop view if exists v_itens;
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

-- ---------------------------------------------------------------------
-- Views de leitura
-- ---------------------------------------------------------------------
create view v_cotacoes with (security_invoker = true) as
select c.*, 'COT-' || lpad(c.numero::text, 5, '0') as codigo, o.codigo as obra_codigo, coalesce(o.nome, 'Depósito central') as obra_nome,
       pc.nome as comprador_nome, pd.nome as decidido_nome,
       (select count(*) from cotacao_itens i where i.cotacao_id = c.id) as total_itens,
       (select count(*) from cotacao_propostas p where p.cotacao_id = c.id) as total_propostas,
       (select min(valor_total) from cotacao_propostas p where p.cotacao_id = c.id) as menor_valor,
       pe.valor_total as valor_escolhido, fe.nome as fornecedor_escolhido,
       (select id from ordens_compra oc where oc.cotacao_id = c.id) as oc_id
  from cotacoes c
  left join obras o on o.id = c.obra_id
  left join perfis pc on pc.id = c.criado_por
  left join perfis pd on pd.id = c.decidido_por
  left join cotacao_propostas pe on pe.id = c.proposta_escolhida_id
  left join fornecedores fe on fe.id = pe.fornecedor_id;

create view v_ordens_compra with (security_invoker = true) as
select oc.*, 'OC-' || lpad(oc.numero::text, 5, '0') as codigo, 'COT-' || lpad(c.numero::text, 5, '0') as cotacao_codigo,
       o.codigo as obra_codigo, coalesce(o.nome, 'Depósito central') as obra_nome,
       f.nome as fornecedor_nome, f.documento as fornecedor_documento, f.telefone as fornecedor_telefone,
       pe.nome as emitida_por_nome,
       (select count(*) from oc_documentos d where d.oc_id = oc.id) as total_documentos,
       (select count(*) from oc_documentos d where d.oc_id = oc.id and d.tipo = 'boleto') as total_boletos,
       (oc.status in ('emitida','pronta_coleta') and oc.previsao_entrega < hoje()) as entrega_atrasada
  from ordens_compra oc
  left join cotacoes c on c.id = oc.cotacao_id
  join fornecedores f on f.id = oc.fornecedor_id
  left join obras o on o.id = oc.obra_id
  left join perfis pe on pe.id = oc.emitida_por;

create or replace function funcionario_tem_biometria(p_func uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select face_descritor is not null from funcionarios where id = p_func
$$;

create view v_funcionarios with (security_invoker = true) as
select f.id, f.matricula, f.nome, f.cpf, f.rg, f.data_nascimento, f.telefone, f.endereco, f.funcao_id, f.obra_id, f.salario,
       f.data_admissao, f.ativo, f.data_demissao, f.motivo_demissao, f.banco, f.agencia, f.conta, f.pix, f.usuario_id,
       funcionario_tem_biometria(f.id) as biometria_cadastrada, f.biometria_consentida_em, f.observacoes, f.criado_em,
       fn.nome as funcao_nome, coalesce(f.salario, fn.salario_base) as salario_efetivo, fn.carga_diaria_horas,
       fn.vale_alimentacao_dia, fn.vale_transporte_dia, fn.epis_obrigatorios, fn.riscos,
       o.codigo as obra_codigo, o.nome as obra_nome,
       (select count(*) from funcionario_documentos d where d.funcionario_id = f.id and not d.substituido
          and d.validade is not null and d.validade < hoje()) as documentos_vencidos,
       (select count(*) from funcionario_documentos d where d.funcionario_id = f.id and not d.substituido
          and d.validade between hoje() and hoje() + 30) as documentos_a_vencer
  from funcionarios f
  left join funcoes fn on fn.id = f.funcao_id
  left join obras o on o.id = f.obra_id;

-- ---------------------------------------------------------------------
-- Gatilhos: atualizado_em, auditoria, sem exclusão
-- ---------------------------------------------------------------------
create trigger tg_funcoes_upd   before update on funcoes        for each row execute function _tg_atualizado_em();
create trigger tg_func_upd      before update on funcionarios   for each row execute function _tg_atualizado_em();
create trigger tg_forn_upd      before update on fornecedores   for each row execute function _tg_atualizado_em();
create trigger tg_insumos_upd   before update on insumos        for each row execute function _tg_atualizado_em();
create trigger tg_cot_upd       before update on cotacoes       for each row execute function _tg_atualizado_em();
create trigger tg_oc_upd        before update on ordens_compra  for each row execute function _tg_atualizado_em();

create or replace function _tg_cadastro_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.criado_por := coalesce(auth.uid(), new.criado_por); return new; end $$;
create trigger tg_func_autor   before insert on funcionarios for each row execute function _tg_cadastro_autor();
create trigger tg_forn_autor   before insert on fornecedores for each row execute function _tg_cadastro_autor();
create trigger tg_insumo_autor before insert on insumos      for each row execute function _tg_cadastro_autor();

create or replace function _tg_doc_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.enviado_por := coalesce(auth.uid(), new.enviado_por); return new; end $$;
create trigger tg_fdoc_autor before insert on funcionario_documentos for each row execute function _tg_doc_autor();

do $$
declare t text;
begin
  foreach t in array array['funcoes','funcionarios','funcionario_documentos','fornecedores','insumos','cotacoes',
                           'cotacao_propostas','ordens_compra','oc_itens','oc_documentos'] loop
    execute format('create trigger tg_%s_audit after insert or update or delete on %I for each row execute function _tg_auditoria()', t, t);
  end loop;
  foreach t in array array['funcoes','funcionarios','funcionario_documentos','fornecedores','insumos','estoque_movimentos',
                           'cotacoes','cotacao_itens','ordens_compra','oc_itens','oc_documentos','oc_eventos'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
  end loop;
end $$;
create trigger tg_estoque_noupdate before update on estoque_movimentos for each row execute function _tg_auditoria_imutavel();
create trigger tg_ocev_noupdate    before update on oc_eventos         for each row execute function _tg_auditoria_imutavel();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table funcoes                enable row level security;
alter table funcionarios           enable row level security;
alter table funcionario_documentos enable row level security;
alter table fornecedores           enable row level security;
alter table insumos                enable row level security;
alter table estoque_movimentos     enable row level security;
alter table cotacoes               enable row level security;
alter table cotacao_itens          enable row level security;
alter table cotacao_propostas      enable row level security;
alter table cotacao_precos         enable row level security;
alter table ordens_compra          enable row level security;
alter table oc_itens               enable row level security;
alter table oc_documentos          enable row level security;
alter table oc_eventos             enable row level security;

revoke all on funcoes, funcionarios, funcionario_documentos, fornecedores, insumos, estoque_movimentos, cotacoes, cotacao_itens,
  cotacao_propostas, cotacao_precos, ordens_compra, oc_itens, oc_documentos, oc_eventos from anon;
-- Biometria facial não é legível pela API: grant por coluna, sem face_descritor
revoke select, update on funcionarios from authenticated;
grant select (id, matricula, nome, cpf, rg, data_nascimento, telefone, endereco, funcao_id, obra_id, salario, data_admissao, ativo,
              data_demissao, motivo_demissao, banco, agencia, conta, pix, usuario_id, biometria_consentida_em, observacoes,
              criado_por, criado_em, atualizado_em) on funcionarios to authenticated;
grant update (nome, cpf, rg, data_nascimento, telefone, endereco, funcao_id, obra_id, salario, data_admissao, banco, agencia,
              conta, pix, usuario_id, observacoes) on funcionarios to authenticated;

-- Funções / tabela salarial
create policy funcoes_sel on funcoes for select to authenticated using (meu_papel() is not null);
create policy funcoes_ins on funcoes for insert to authenticated with check (tem_papel('admin','rh'));
create policy funcoes_upd on funcoes for update to authenticated using (tem_papel('admin','rh')) with check (tem_papel('admin','rh'));

-- Funcionários: dados pessoais só para diretoria, RH, segurança e financeiro; engenheiro vê os da sua obra
create or replace function ve_funcionario(p_obra uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tem_papel('admin','rh','seguranca','financeiro') or (tem_papel('engenheiro') and p_obra is not null and gere_obra(p_obra))
$$;
create policy func_sel on funcionarios for select to authenticated using (ve_funcionario(obra_id) or usuario_id = auth.uid());
create policy func_ins on funcionarios for insert to authenticated with check (tem_papel('admin','rh'));
create policy func_upd on funcionarios for update to authenticated using (tem_papel('admin','rh')) with check (tem_papel('admin','rh'));

create policy fdoc_sel on funcionario_documentos for select to authenticated
  using (exists (select 1 from funcionarios f where f.id = funcionario_id));
create policy fdoc_ins on funcionario_documentos for insert to authenticated with check (tem_papel('admin','rh','seguranca'));
create policy fdoc_upd on funcionario_documentos for update to authenticated using (tem_papel('admin','rh','seguranca'));

-- Fornecedores e insumos: todos consultam; compras/diretoria cadastram
create policy forn_sel on fornecedores for select to authenticated using (meu_papel() is not null);
create policy forn_ins on fornecedores for insert to authenticated with check (tem_papel('admin','compras','financeiro'));
create policy forn_upd on fornecedores for update to authenticated using (tem_papel('admin','compras','financeiro'));
create policy ins_sel on insumos for select to authenticated using (meu_papel() is not null);
create policy ins_ins on insumos for insert to authenticated with check (tem_papel('admin','compras'));
create policy ins_upd on insumos for update to authenticated using (tem_papel('admin','compras'));

-- Estoque: leitura para quem atua na obra (ou depósito central para suprimentos/diretoria)
create policy est_sel on estoque_movimentos for select to authenticated
  using (case when obra_id is null then ve_todas_obras() else membro_obra(obra_id) end);

-- Cotações: suprimentos, financeiro, diretoria e engenheiros da obra
create or replace function ve_cotacao(p_obra uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tem_papel('admin','compras','financeiro','almoxarifado') or (p_obra is not null and gere_obra(p_obra))
$$;
create policy cot_sel  on cotacoes          for select to authenticated using (ve_cotacao(obra_id));
create policy coti_sel on cotacao_itens     for select to authenticated using (exists (select 1 from cotacoes c where c.id = cotacao_id));
create policy cotp_sel on cotacao_propostas for select to authenticated using (exists (select 1 from cotacoes c where c.id = cotacao_id));
create policy cotr_sel on cotacao_precos    for select to authenticated using (exists (select 1 from cotacao_propostas p where p.id = proposta_id));

-- OC: "todos visualizam" — qualquer colaborador com acesso à obra
create policy oc_sel  on ordens_compra for select to authenticated
  using (case when obra_id is null then ve_todas_obras() else membro_obra(obra_id) end);
create policy oci_sel on oc_itens      for select to authenticated using (exists (select 1 from ordens_compra o where o.id = oc_id));
create policy ocd_sel on oc_documentos for select to authenticated using (exists (select 1 from ordens_compra o where o.id = oc_id));
create policy oce_sel on oc_eventos    for select to authenticated using (exists (select 1 from ordens_compra o where o.id = oc_id));

-- Storage: pastas de suprimentos ("sup/...") e de RH ("rh/<funcionario>/...")
create policy sup_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'sup' and public.meu_papel() is not null);
create policy sup_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'sup' and public.meu_papel() is not null);
create policy rh_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'rh' and public.tem_papel('admin','rh','seguranca'));
create policy rh_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'rh' and public.tem_papel('admin','rh','seguranca'));

do $$ begin
  alter publication supabase_realtime add table ordens_compra, cotacoes;
exception when undefined_object then null; end $$;

-- Permissões de execução (funções internas "_" fora da API)
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
