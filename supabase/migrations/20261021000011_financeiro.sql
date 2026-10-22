-- =====================================================================
-- 11. FINANCEIRO E OBRA — contrato da obra, contas a pagar/receber,
--     boletins de medição (BM) com retenções, integração com OC e folha,
--     fluxo de caixa e diário de obra (RDO) com fotos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contrato da obra (parâmetros do faturamento)
-- ---------------------------------------------------------------------
alter table obras
  add column valor_contrato           numeric(16,2) check (valor_contrato is null or valor_contrato >= 0),
  add column orcamento_custo          numeric(16,2) check (orcamento_custo is null or orcamento_custo >= 0),
  add column iss_pct                  numeric(5,2) not null default 5    check (iss_pct between 0 and 100),
  add column inss_ret_pct             numeric(5,2) not null default 11   check (inss_ret_pct between 0 and 100),
  add column base_mao_obra_pct        numeric(5,2) not null default 50   check (base_mao_obra_pct between 0 and 100),
  add column retencao_tecnica_pct     numeric(5,2) not null default 5    check (retencao_tecnica_pct between 0 and 100),
  add column impostos_faturamento_pct numeric(5,2) not null default 0    check (impostos_faturamento_pct between 0 and 100),
  add column prazo_recebimento_dias   int not null default 30            check (prazo_recebimento_dias between 0 and 365),
  add column contrato_conferido_em    timestamptz;

create or replace function obra_contrato_salvar(p_obra uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro alteram o contrato'; end if;
  update obras set
    valor_contrato           = nullif(p->>'valor_contrato','')::numeric,
    orcamento_custo          = nullif(p->>'orcamento_custo','')::numeric,
    iss_pct                  = coalesce(nullif(p->>'iss_pct','')::numeric, iss_pct),
    inss_ret_pct             = coalesce(nullif(p->>'inss_ret_pct','')::numeric, inss_ret_pct),
    base_mao_obra_pct        = coalesce(nullif(p->>'base_mao_obra_pct','')::numeric, base_mao_obra_pct),
    retencao_tecnica_pct     = coalesce(nullif(p->>'retencao_tecnica_pct','')::numeric, retencao_tecnica_pct),
    impostos_faturamento_pct = coalesce(nullif(p->>'impostos_faturamento_pct','')::numeric, impostos_faturamento_pct),
    prazo_recebimento_dias   = coalesce(nullif(p->>'prazo_recebimento_dias','')::int, prazo_recebimento_dias),
    contrato_conferido_em    = now(),
    atualizado_em            = now()
  where id = p_obra;
  if not found then raise exception 'Obra não encontrada'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Datas de vencimento legais
-- ---------------------------------------------------------------------
create or replace function _dia_util(d date, p_sabado_util boolean) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from d) <> 7 and (p_sabado_util or extract(isodow from d) <> 6)
     and not exists (select 1 from feriados f where f.data = d and f.ambito <> 'facultativo')
$$;
-- Salário: até o 5º dia útil do mês seguinte (sábado conta como dia útil)
create or replace function _quinto_dia_util(p_comp date) returns date
language plpgsql stable set search_path = public as $$
declare d date := (date_trunc('month', p_comp) + interval '1 month')::date; n int := 0;
begin
  loop
    if _dia_util(d, true) then n := n + 1; end if;
    exit when n = 5;
    d := d + 1;
  end loop;
  return d;
end $$;
-- Guias (FGTS, INSS, impostos): dia 20 do mês seguinte, antecipado se não for dia útil bancário
create or replace function _dia20(p_comp date) returns date
language plpgsql stable set search_path = public as $$
declare d date := (date_trunc('month', p_comp) + interval '1 month 19 days')::date;
begin
  while not _dia_util(d, false) loop d := d - 1; end loop;
  return d;
end $$;

-- ---------------------------------------------------------------------
-- Boletins de medição
-- ---------------------------------------------------------------------
create table boletins_medicao (
  id                     uuid primary key default gen_random_uuid(),
  obra_id                uuid not null references obras(id),
  numero                 int  not null,
  periodo_inicio         date not null,
  periodo_fim            date not null,
  status                 text not null default 'aberto' check (status in ('aberto','aprovado','cancelado')),
  valor_bruto            numeric(16,2) not null,
  iss_pct                numeric(5,2)  not null,
  iss_valor              numeric(14,2) not null,
  inss_pct               numeric(5,2)  not null,
  base_mao_obra_pct      numeric(5,2)  not null,
  inss_valor             numeric(14,2) not null,
  retencao_tecnica_pct   numeric(5,2)  not null,
  retencao_tecnica_valor numeric(14,2) not null,
  outras_retencoes       numeric(14,2) not null default 0,
  valor_liquido          numeric(16,2) not null,
  nf_numero              text,
  observacoes            text,
  criado_por             uuid not null references perfis(id),
  criado_em              timestamptz not null default now(),
  aprovado_por           uuid references perfis(id),
  aprovado_em            date,
  cancelado_motivo       text,
  unique (obra_id, numero),
  check (periodo_fim >= periodo_inicio)
);
create index on boletins_medicao (obra_id, status);

create table bm_itens (
  bm_id                 uuid not null references boletins_medicao(id),
  planilha_item_id      uuid not null references planilha_itens(id),
  quantidade            numeric(16,4) not null,
  quantidade_anterior   numeric(16,4) not null default 0,
  quantidade_contratada numeric(16,4),
  preco_unitario        numeric(16,4) not null,
  valor                 numeric(16,2) not null,
  primary key (bm_id, planilha_item_id)
);

alter table medicoes add column bm_id uuid references boletins_medicao(id);
create index on medicoes (bm_id);

-- v_medicoes usa m.* — recria para incluir bm_id
drop view v_medicoes;
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
grant select on v_medicoes to authenticated;

-- ---------------------------------------------------------------------
-- Contas a pagar e a receber
-- ---------------------------------------------------------------------
create sequence lancamento_numero_seq;
create table lancamentos (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint not null unique default nextval('lancamento_numero_seq'),
  obra_id             uuid references obras(id),                 -- nulo = administração central
  tipo                text not null check (tipo in ('receita','despesa')),
  categoria           text not null check (categoria in (
                        'medicao','retencao_tecnica','outras_receitas',
                        'material','mao_de_obra','encargos','beneficios','equipamentos','servicos_terceiros',
                        'impostos','administrativo','outras_despesas')),
  descricao           text not null check (length(trim(descricao)) >= 3),
  fornecedor_id       uuid references fornecedores(id),
  favorecido          text,
  valor               numeric(14,2) not null check (valor > 0),
  competencia         date not null default hoje(),
  vencimento          date not null,
  status              text not null default 'aberto' check (status in ('aberto','liquidado','cancelado')),
  liquidado_em        date,
  valor_liquidado     numeric(14,2),
  forma_pagamento     text,
  documento_numero    text,
  caminho             text,                                       -- comprovante / documento
  origem              text not null default 'manual' check (origem in ('manual','oc','folha','bm')),
  oc_id               uuid references ordens_compra(id),
  folha_id            uuid references folhas(id),
  bm_id               uuid references boletins_medicao(id),
  motivo_cancelamento text,
  criado_por          uuid references perfis(id),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint lanc_liq_ck check (status <> 'liquidado' or (liquidado_em is not null and valor_liquidado is not null)),
  constraint lanc_tipo_cat_ck check ((tipo = 'receita') = (categoria in ('medicao','retencao_tecnica','outras_receitas')))
);
create index on lancamentos (obra_id, status);
create index on lancamentos (vencimento) where status = 'aberto';
create unique index lancamentos_um_por_oc on lancamentos (oc_id) where origem = 'oc';

create or replace function _cod_bm(n int) returns text language sql immutable set search_path = public as $$ select 'BM-' || lpad(n::text, 2, '0') $$;

create or replace function _lanc_inserir(p_obra uuid, p_tipo text, p_cat text, p_desc text, p_valor numeric, p_comp date, p_venc date,
                                         p_origem text, p_oc uuid default null, p_folha uuid default null, p_bm uuid default null,
                                         p_fornecedor uuid default null, p_favorecido text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(p_valor, 0) <= 0 then return null; end if;
  insert into lancamentos (obra_id, tipo, categoria, descricao, valor, competencia, vencimento, origem, oc_id, folha_id, bm_id,
                           fornecedor_id, favorecido, criado_por)
  values (p_obra, p_tipo, p_cat, p_desc, round(p_valor, 2), p_comp, p_venc, p_origem, p_oc, p_folha, p_bm, p_fornecedor, p_favorecido, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Operações manuais (diretoria / financeiro)
create or replace function lancamento_criar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tipo text := p->>'tipo'; v_id uuid;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro lançam contas'; end if;
  if nullif(p->>'vencimento','') is null then raise exception 'Informe o vencimento'; end if;
  if coalesce(nullif(p->>'valor','')::numeric, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  insert into lancamentos (obra_id, tipo, categoria, descricao, fornecedor_id, favorecido, valor, competencia, vencimento,
                           documento_numero, caminho, origem, criado_por)
  values (nullif(p->>'obra_id','')::uuid, v_tipo, p->>'categoria', trim(p->>'descricao'), nullif(p->>'fornecedor_id','')::uuid,
          nullif(trim(p->>'favorecido'),''), (p->>'valor')::numeric, coalesce(nullif(p->>'competencia','')::date, hoje()),
          (p->>'vencimento')::date, nullif(p->>'documento_numero',''), nullif(p->>'caminho',''), 'manual', auth.uid())
  returning id into v_id;
  if (p->>'liquidado')::boolean then
    perform lancamento_liquidar(v_id, coalesce(nullif(p->>'liquidado_em','')::date, hoje()), null, nullif(p->>'forma_pagamento',''), null);
  end if;
  return v_id;
end $$;

create or replace function lancamento_liquidar(p_id uuid, p_data date, p_valor numeric, p_forma text, p_caminho text)
returns void language plpgsql security definer set search_path = public as $$
declare l lancamentos;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro registram pagamentos e recebimentos'; end if;
  select * into l from lancamentos where id = p_id for update;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  if l.status <> 'aberto' then raise exception 'Lançamento já %', case l.status when 'liquidado' then 'baixado' else 'cancelado' end; end if;
  if p_data is null or p_data > hoje() then raise exception 'Data de pagamento/recebimento inválida (não pode ser futura)'; end if;
  if p_valor is not null and p_valor <= 0 then raise exception 'Valor inválido'; end if;
  update lancamentos set status = 'liquidado', liquidado_em = p_data, valor_liquidado = coalesce(p_valor, l.valor),
         forma_pagamento = coalesce(p_forma, forma_pagamento), caminho = coalesce(p_caminho, caminho), atualizado_em = now()
   where id = p_id;
  if l.oc_id is not null then
    perform _oc_evento(l.oc_id, 'pagamento', format('Pagamento de %s registrado no financeiro em %s', _brl(coalesce(p_valor, l.valor)), to_char(p_data, 'DD/MM/YYYY')));
  end if;
end $$;

create or replace function lancamento_reprogramar(p_id uuid, p_vencimento date, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare l lancamentos;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Sem permissão'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo da alteração do vencimento'; end if;
  select * into l from lancamentos where id = p_id for update;
  if not found or l.status <> 'aberto' then raise exception 'Só é possível reprogramar lançamentos em aberto'; end if;
  update lancamentos set vencimento = p_vencimento, atualizado_em = now() where id = p_id;
end $$;

create or replace function lancamento_cancelar(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare l lancamentos;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Sem permissão'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into l from lancamentos where id = p_id for update;
  if not found or l.status <> 'aberto' then raise exception 'Só é possível cancelar lançamentos em aberto'; end if;
  if l.origem = 'oc' then raise exception 'Este lançamento vem de uma ordem de compra: cancele a OC'; end if;
  if l.origem = 'bm' then raise exception 'Este lançamento vem de um boletim de medição: cancele o BM'; end if;
  if l.origem = 'folha' and not tem_papel('admin') then raise exception 'Lançamentos da folha só podem ser cancelados pela diretoria'; end if;
  update lancamentos set status = 'cancelado', motivo_cancelamento = p_motivo, atualizado_em = now() where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Integração: ordens de compra → contas a pagar
-- ---------------------------------------------------------------------
create or replace function _tg_oc_financeiro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dias int; v_forn text;
begin
  if tg_op = 'INSERT' then
    v_dias := coalesce(substring(coalesce(new.condicao_pagamento, '') from '(\d+)')::int, 0);
    select nome into v_forn from fornecedores where id = new.fornecedor_id;
    perform _lanc_inserir(new.obra_id, 'despesa', 'material', format('OC-%s — %s', lpad(new.numero::text, 5, '0'), v_forn),
                          new.valor_total, new.emitida_em::date, new.emitida_em::date + v_dias, 'oc', p_oc => new.id, p_fornecedor => new.fornecedor_id);
    return new;
  end if;
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    update lancamentos set status = 'cancelado', motivo_cancelamento = 'OC cancelada', atualizado_em = now()
     where oc_id = new.id and origem = 'oc' and status = 'aberto';
  end if;
  if new.pagamento = 'pago' and old.pagamento is distinct from 'pago' then
    update lancamentos set status = 'liquidado', liquidado_em = coalesce(new.pago_em, now())::date, valor_liquidado = valor,
           forma_pagamento = 'Pago antes da entrega (compras)', atualizado_em = now()
     where oc_id = new.id and origem = 'oc' and status = 'aberto';
  end if;
  if new.nf_valor is not null and new.nf_valor is distinct from old.nf_valor then
    update lancamentos set valor = new.nf_valor, documento_numero = coalesce(new.nf_numero, documento_numero), atualizado_em = now()
     where oc_id = new.id and origem = 'oc' and status = 'aberto';
  end if;
  return new;
end $$;
create trigger tg_oc_financeiro after insert or update on ordens_compra for each row execute function _tg_oc_financeiro();

create or replace function _tg_ocdoc_financeiro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'boleto' and new.vencimento is not null then
    update lancamentos set vencimento = new.vencimento, caminho = coalesce(caminho, new.caminho), atualizado_em = now()
     where oc_id = new.oc_id and origem = 'oc' and status = 'aberto';
  end if;
  return new;
end $$;
create trigger tg_ocdoc_financeiro after insert on oc_documentos for each row execute function _tg_ocdoc_financeiro();

-- OCs emitidas antes deste módulo também viram contas a pagar
insert into lancamentos (obra_id, tipo, categoria, descricao, fornecedor_id, valor, competencia, vencimento, status, liquidado_em,
                         valor_liquidado, forma_pagamento, documento_numero, origem, oc_id)
select oc.obra_id, 'despesa', 'material', format('OC-%s — %s', lpad(oc.numero::text, 5, '0'), f.nome), oc.fornecedor_id,
       coalesce(oc.nf_valor, oc.valor_total), oc.emitida_em::date,
       oc.emitida_em::date + coalesce(substring(coalesce(oc.condicao_pagamento, '') from '(\d+)')::int, 0),
       case when oc.pagamento = 'pago' then 'liquidado' else 'aberto' end,
       case when oc.pagamento = 'pago' then coalesce(oc.pago_em, now())::date end,
       case when oc.pagamento = 'pago' then coalesce(oc.nf_valor, oc.valor_total) end,
       case when oc.pagamento = 'pago' then 'Pago antes da entrega (compras)' end, oc.nf_numero, 'oc', oc.id
  from ordens_compra oc join fornecedores f on f.id = oc.fornecedor_id
 where oc.status <> 'cancelada';

-- ---------------------------------------------------------------------
-- Integração: folha fechada → salários, encargos e benefícios por obra
-- ---------------------------------------------------------------------
create or replace function _tg_folha_financeiro() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_mes text := to_char(new.competencia, 'MM/YYYY');
begin
  for r in select nullif(e->>'obra_id','')::uuid as obra,
                  sum((e->>'liquido_estimado')::numeric) liq, sum((e->>'bruto')::numeric) bruto, sum((e->>'inss')::numeric) inss,
                  sum((e->>'vale_alimentacao')::numeric + (e->>'vale_transporte')::numeric - (e->>'desconto_vt')::numeric) benef
             from jsonb_array_elements(new.itens) e group by 1 loop
    perform _lanc_inserir(r.obra, 'despesa', 'mao_de_obra', 'Folha ' || v_mes || ' — salários (líquido)', r.liq,
                          new.competencia, _quinto_dia_util(new.competencia), 'folha', p_folha => new.id);
    perform _lanc_inserir(r.obra, 'despesa', 'encargos', 'Folha ' || v_mes || ' — INSS descontado dos empregados', r.inss,
                          new.competencia, _dia20(new.competencia), 'folha', p_folha => new.id);
    perform _lanc_inserir(r.obra, 'despesa', 'encargos', 'Folha ' || v_mes || ' — FGTS (8%)', r.bruto * 0.08,
                          new.competencia, _dia20(new.competencia), 'folha', p_folha => new.id);
    perform _lanc_inserir(r.obra, 'despesa', 'beneficios', 'Folha ' || v_mes || ' — vale-alimentação e transporte', r.benef,
                          new.competencia, (date_trunc('month', new.competencia) + interval '1 month')::date, 'folha', p_folha => new.id);
  end loop;
  return new;
end $$;
create trigger tg_folha_financeiro after insert on folhas for each row execute function _tg_folha_financeiro();

-- ---------------------------------------------------------------------
-- Boletim de medição: gerar, aprovar, cancelar
-- ---------------------------------------------------------------------
create or replace function bm_gerar(p_obra uuid, p_inicio date, p_fim date, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o obras; v_id uuid; v_num int; v_bruto numeric; v_iss numeric; v_inss numeric; v_ret numeric;
begin
  if not (tem_papel('admin','financeiro') or gere_obra(p_obra)) then raise exception 'Sem permissão para gerar medição desta obra'; end if;
  select * into o from obras where id = p_obra;
  if not found then raise exception 'Obra não encontrada'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido'; end if;
  if p_fim > hoje() then raise exception 'O período não pode terminar no futuro'; end if;
  if exists (select 1 from medicoes m where m.obra_id = p_obra and m.status = 'lancada' and m.data between p_inicio and p_fim) then
    raise exception 'Há lançamentos de execução aguardando validação do engenheiro neste período';
  end if;
  if not exists (select 1 from medicoes m where m.obra_id = p_obra and m.status = 'validada' and m.bm_id is null and m.data between p_inicio and p_fim) then
    raise exception 'Nenhuma execução validada e ainda não medida neste período';
  end if;
  select coalesce(max(numero), 0) + 1 into v_num from boletins_medicao where obra_id = p_obra;
  insert into boletins_medicao (obra_id, numero, periodo_inicio, periodo_fim, valor_bruto, iss_pct, iss_valor, inss_pct, base_mao_obra_pct,
                                inss_valor, retencao_tecnica_pct, retencao_tecnica_valor, valor_liquido, observacoes, criado_por)
  values (p_obra, v_num, p_inicio, p_fim, 0, o.iss_pct, 0, o.inss_ret_pct, o.base_mao_obra_pct, 0, o.retencao_tecnica_pct, 0, 0, p_obs, auth.uid())
  returning id into v_id;

  update medicoes set bm_id = v_id
   where obra_id = p_obra and status = 'validada' and bm_id is null and data between p_inicio and p_fim;

  insert into bm_itens (bm_id, planilha_item_id, quantidade, quantidade_anterior, quantidade_contratada, preco_unitario, valor)
  select v_id, i.id, sum(m.quantidade),
         coalesce((select sum(bi.quantidade) from bm_itens bi join boletins_medicao b on b.id = bi.bm_id
                    where bi.planilha_item_id = i.id and b.status <> 'cancelado' and b.id <> v_id), 0),
         i.quantidade, coalesce(i.preco_unitario, i.valor_total / nullif(i.quantidade, 0), 0),
         round(sum(m.quantidade) * coalesce(i.preco_unitario, i.valor_total / nullif(i.quantidade, 0), 0), 2)
    from medicoes m join planilha_itens i on i.id = m.planilha_item_id
   where m.bm_id = v_id
   group by i.id, i.quantidade, i.preco_unitario, i.valor_total;

  select coalesce(sum(valor), 0) into v_bruto from bm_itens where bm_id = v_id;
  v_iss  := round(v_bruto * o.iss_pct / 100, 2);
  v_inss := round(v_bruto * o.base_mao_obra_pct / 100 * o.inss_ret_pct / 100, 2);
  v_ret  := round(v_bruto * o.retencao_tecnica_pct / 100, 2);
  update boletins_medicao set valor_bruto = v_bruto, iss_valor = v_iss, inss_valor = v_inss, retencao_tecnica_valor = v_ret,
         valor_liquido = v_bruto - v_iss - v_inss - v_ret
   where id = v_id;

  perform _notificar_papeis(array['financeiro','admin'], 'bm_aprovar', format('%s de %s aguardando aprovação', _cod_bm(v_num), o.codigo),
    format('Medição de %s a %s — %s', to_char(p_inicio,'DD/MM'), to_char(p_fim,'DD/MM/YYYY'), _brl(v_bruto)), '/financeiro/medicoes/' || v_id);
  return v_id;
end $$;

create or replace function bm_aprovar(p_bm uuid, p_data date, p_nf text, p_outras numeric default 0) returns void
language plpgsql security definer set search_path = public as $$
declare b boletins_medicao; o obras; v_cod text;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro aprovam a medição'; end if;
  select * into b from boletins_medicao where id = p_bm for update;
  if not found or b.status <> 'aberto' then raise exception 'O boletim não está aberto'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Data de aprovação inválida'; end if;
  if coalesce(p_outras, 0) < 0 or coalesce(p_outras, 0) >= b.valor_liquido then raise exception 'Outras retenções inválidas'; end if;
  select * into o from obras where id = b.obra_id;
  v_cod := _cod_bm(b.numero);
  update boletins_medicao set status = 'aprovado', aprovado_por = auth.uid(), aprovado_em = p_data, nf_numero = nullif(trim(p_nf), ''),
         outras_retencoes = coalesce(p_outras, 0), valor_liquido = valor_bruto - iss_valor - inss_valor - retencao_tecnica_valor - coalesce(p_outras, 0)
   where id = p_bm returning * into b;
  perform _lanc_inserir(b.obra_id, 'receita', 'medicao', format('%s — %s (%s a %s)', v_cod, o.codigo, to_char(b.periodo_inicio,'DD/MM'), to_char(b.periodo_fim,'DD/MM/YYYY')),
                        b.valor_liquido, b.periodo_fim, p_data + o.prazo_recebimento_dias, 'bm', p_bm => p_bm, p_favorecido => o.cliente);
  perform _lanc_inserir(b.obra_id, 'receita', 'retencao_tecnica', format('%s — retenção técnica (%s%%)', v_cod, trim_scale(b.retencao_tecnica_pct)),
                        b.retencao_tecnica_valor, b.periodo_fim, greatest(coalesce(o.data_prevista_conclusao, p_data), p_data) + o.prazo_recebimento_dias,
                        'bm', p_bm => p_bm, p_favorecido => o.cliente);
  perform _lanc_inserir(b.obra_id, 'despesa', 'impostos', format('%s — impostos sobre faturamento (%s%%)', v_cod, trim_scale(o.impostos_faturamento_pct)),
                        b.valor_bruto * o.impostos_faturamento_pct / 100, b.periodo_fim, _dia20(p_data), 'bm', p_bm => p_bm);
end $$;

create or replace function bm_cancelar(p_bm uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare b boletins_medicao;
begin
  select * into b from boletins_medicao where id = p_bm for update;
  if not found or b.status = 'cancelado' then raise exception 'Boletim não encontrado ou já cancelado'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  if b.status = 'aberto' and not (tem_papel('admin','financeiro') or gere_obra(b.obra_id)) then raise exception 'Sem permissão'; end if;
  if b.status = 'aprovado' then
    if not tem_papel('admin') then raise exception 'Medição aprovada só pode ser cancelada pela diretoria'; end if;
    if exists (select 1 from lancamentos where bm_id = p_bm and status = 'liquidado') then
      raise exception 'Já houve recebimento/pagamento ligado a esta medição — estorne pelo financeiro antes';
    end if;
    update lancamentos set status = 'cancelado', motivo_cancelamento = 'BM cancelado: ' || p_motivo, atualizado_em = now()
     where bm_id = p_bm and status = 'aberto';
  end if;
  update medicoes set bm_id = null where bm_id = p_bm;
  update boletins_medicao set status = 'cancelado', cancelado_motivo = p_motivo where id = p_bm;
end $$;

-- ---------------------------------------------------------------------
-- Resumo financeiro por obra (respeita o RLS de quem consulta)
-- ---------------------------------------------------------------------
create view v_financeiro_obras with (security_invoker = true) as
select o.id, o.codigo, o.nome, o.situacao, o.cliente, o.valor_contrato, o.orcamento_custo, o.contrato_conferido_em,
       (select p.valor_total from planilhas p where p.obra_id = o.id and p.ativa) as valor_planilha,
       coalesce((select sum(b.valor_bruto) from boletins_medicao b where b.obra_id = o.id and b.status = 'aprovado'), 0) as medido_aprovado,
       coalesce((select sum(b.valor_bruto) from boletins_medicao b where b.obra_id = o.id and b.status = 'aberto'), 0) as medido_em_aprovacao,
       coalesce((select sum(l.valor_liquidado) from lancamentos l where l.obra_id = o.id and l.tipo = 'receita' and l.status = 'liquidado'), 0) as recebido,
       coalesce((select sum(l.valor) from lancamentos l where l.obra_id = o.id and l.tipo = 'receita' and l.status = 'aberto'), 0) as a_receber,
       coalesce((select sum(l.valor_liquidado) from lancamentos l where l.obra_id = o.id and l.tipo = 'despesa' and l.status = 'liquidado'), 0) as pago,
       coalesce((select sum(l.valor) from lancamentos l where l.obra_id = o.id and l.tipo = 'despesa' and l.status = 'aberto'), 0) as a_pagar
  from obras o;

-- ---------------------------------------------------------------------
-- Diário de obra: fotos vinculadas
-- ---------------------------------------------------------------------
create or replace function _tg_anexos_vinculos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.medicao_id is not null and not exists (select 1 from medicoes where id = new.medicao_id and obra_id = new.obra_id) then
    raise exception 'Anexo: lançamento não pertence à obra';
  end if;
  if new.nao_conformidade_id is not null and not exists (select 1 from nao_conformidades where id = new.nao_conformidade_id and obra_id = new.obra_id) then
    raise exception 'Anexo: não conformidade não pertence à obra';
  end if;
  if new.diario_id is not null and not exists (select 1 from diario_obra where id = new.diario_id and obra_id = new.obra_id) then
    raise exception 'Anexo: diário não pertence à obra';
  end if;
  return new;
end $$;
create index if not exists anexos_diario_idx on anexos (diario_id);

-- ---------------------------------------------------------------------
-- Alertas: contas vencendo/vencidas e BMs parados
-- ---------------------------------------------------------------------
alter function gerar_alertas() rename to _gerar_alertas_obra;
create or replace function gerar_alertas() returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_hoje date := hoje(); v_antes int; r record;
begin
  n := _gerar_alertas_obra();
  select count(*) into v_antes from notificacoes;
  select count(*) filter (where vencimento < v_hoje) as vencidas, count(*) filter (where vencimento between v_hoje and v_hoje + 3) as proximas,
         coalesce(sum(valor) filter (where vencimento between v_hoje and v_hoje + 3), 0) as valor
    into r from lancamentos where status = 'aberto' and tipo = 'despesa';
  if r.vencidas > 0 then
    perform _notificar_papeis(array['financeiro','admin'], 'conta_vencida', format('%s conta(s) a pagar vencida(s)', r.vencidas),
      'Regularize ou reprograme o vencimento.', '/financeiro/lancamentos?situacao=vencidos', 'cv:' || v_hoje);
  end if;
  if r.proximas > 0 then
    perform _notificar_papeis(array['financeiro'], 'conta_vencer', format('%s conta(s) vencem em até 3 dias', r.proximas),
      'Total ' || _brl(r.valor), '/financeiro/lancamentos?situacao=abertos', 'cp:' || v_hoje);
  end if;
  for r in select b.id, b.numero, o.codigo from boletins_medicao b join obras o on o.id = b.obra_id
            where b.status = 'aberto' and b.criado_em < now() - interval '5 days' loop
    perform _notificar_papeis(array['financeiro','admin'], 'bm_aprovar', format('%s de %s aberto há mais de 5 dias', _cod_bm(r.numero), r.codigo),
      'Aprove ou cancele a medição.', '/financeiro/medicoes/' || r.id, 'bm:' || r.id || ':' || v_hoje);
  end loop;
  return n + (select count(*) from notificacoes) - v_antes;
end $$;

-- ---------------------------------------------------------------------
-- Imutabilidade, auditoria e RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lancamentos','boletins_medicao','bm_itens'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
    execute format('create trigger tg_%s_audit after insert or update or delete on %I for each row execute function _tg_auditoria()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

create policy lanc_sel on lancamentos for select to authenticated
  using (tem_papel('admin','financeiro') or (obra_id is not null and gere_obra(obra_id)));
create policy bm_sel on boletins_medicao for select to authenticated
  using (tem_papel('admin','financeiro') or gere_obra(obra_id));
create policy bmi_sel on bm_itens for select to authenticated
  using (exists (select 1 from boletins_medicao b where b.id = bm_id));

-- Comprovantes e documentos financeiros ("fin/...")
create policy fin_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'fin' and public.tem_papel('admin','financeiro'));
create policy fin_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'fin' and public.tem_papel('admin','financeiro'));

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
