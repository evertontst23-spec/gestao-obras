-- =====================================================================
-- 0014 — Pagamentos do RH (dia 20 / dia 05 por empresa) e início do controle de ponto
--  * dp_parametros.ponto_inicio: o espelho só calcula falta, atraso e hora extra a partir dessa data.
--    Enquanto estiver vazio, a folha não desconta faltas (o ponto ainda não está em uso).
--  * pagamentos / pagamento_itens: cada data de pagamento (adiantamento do dia 20, saldo do dia 05,
--    rescisões) com o que vai para cada empresa (folha + taxa) e o que vai direto ao funcionário
--    (passagens e alimentação). Ao fechar, gera as contas a pagar no financeiro; ao quitar, dá baixa.
-- =====================================================================

alter table dp_parametros add column ponto_inicio date;

create or replace function _espelho_ponto(p_func uuid, p_inicio date, p_fim date)
returns table (data date, dia_semana int, feriado text, marcacoes jsonb, trabalhado_min int, previsto_min int,
               he_util_min int, he_100_min int, atraso_min int, falta boolean, abonado text, incompleto boolean)
language plpgsql stable security definer set search_path = public as $$
declare f record; par dp_parametros; d date; regs record; v_ent timestamptz; v_trab int; v_prev int; v_marc jsonb; v_inc boolean;
        v_fer text; v_ab text; v_dif int; v_horas_ab numeric; v_validas int;
begin
  select fu.*, coalesce(fn.carga_diaria_horas, 8) as carga into f from funcionarios fu left join funcoes fn on fn.id = fu.funcao_id where fu.id = p_func;
  if not found then return; end if;
  select * into par from dp_parametros where id = 1;
  d := p_inicio;
  while d <= p_fim loop
    if d >= f.data_admissao and (f.data_demissao is null or d <= f.data_demissao) and d <= hoje() then
      v_trab := 0; v_ent := null; v_inc := false; v_marc := '[]'::jsonb; v_validas := 0;
      for regs in select r.*, pd.motivo as desc_motivo from registros_ponto r left join ponto_desconsideracoes pd on pd.registro_id = r.id
                   where r.funcionario_id = p_func and r.data = d order by r.momento loop
        v_marc := v_marc || jsonb_strip_nulls(jsonb_build_object('id', regs.id, 't', regs.tipo,
                    'h', to_char(regs.momento at time zone 'America/Recife', 'HH24:MI'), 'm', regs.metodo,
                    'j', regs.justificativa, 'x', regs.desc_motivo));
        continue when regs.desc_motivo is not null;          -- desconsiderada pelo RH
        v_validas := v_validas + 1;
        if regs.tipo = 'entrada' then
          if v_ent is not null then v_inc := true; end if;
          v_ent := regs.momento;
        elsif v_ent is not null then
          v_trab := v_trab + floor(extract(epoch from regs.momento - v_ent) / 60)::int; v_ent := null;
        else v_inc := true; end if;
      end loop;
      if v_ent is not null and d < hoje() then v_inc := true; end if;   -- hoje: turno ainda em andamento
      select descricao into v_fer from feriados fe where fe.data = d and fe.ambito <> 'facultativo';
      v_prev := case when v_fer is not null or extract(isodow from d) = 7 then 0
                     when extract(isodow from d) = 6 then round(par.jornada_sabado_horas * 60)
                     else round(f.carga * 60) end;
      select string_agg(a.tipo || coalesce(' ' || a.horas || 'h', ''), ', '), sum(case when a.tipo = 'declaracao_horas' then a.horas end)
        into v_ab, v_horas_ab
        from atestados a where a.funcionario_id = p_func and d between a.data_inicio and a.data_inicio + greatest(a.dias - 1, 0);
      data := d; dia_semana := extract(isodow from d); feriado := v_fer; marcacoes := v_marc; trabalhado_min := v_trab;
      previsto_min := v_prev; incompleto := v_inc; abonado := v_ab;
      he_util_min := 0; he_100_min := 0; atraso_min := 0; falta := false;
      if v_inc or d = hoje() or par.ponto_inicio is null or d < par.ponto_inicio then  -- antes do início do controle de ponto não há falta/atraso
        null;   -- marcação incompleta (ou o dia de hoje, ainda aberto): não calcula HE/atraso/falta
      elsif v_fer is not null or extract(isodow from d) = 7 then
        he_100_min := v_trab;
      else
        v_dif := v_trab - v_prev;
        if v_dif > par.tolerancia_minutos then he_util_min := v_dif; end if;
        if v_prev > 0 and v_trab = 0 and v_validas = 0 and v_ab is null then
          falta := true;
        elsif v_dif < -par.tolerancia_minutos and v_prev > 0 then
          atraso_min := greatest(0, -v_dif - coalesce(round(v_horas_ab * 60), 0)::int);
          if v_ab is not null and coalesce(v_horas_ab, 0) = 0 then atraso_min := 0; end if;  -- atestado de dia inteiro
        end if;
      end if;
      return next;
    end if;
    d := d + 1;
  end loop;
end $$;

create or replace function dp_salvar_parametros(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria alteram os parâmetros'; end if;
  update dp_parametros set
    percentual_he_util = coalesce((p->>'percentual_he_util')::numeric, percentual_he_util),
    percentual_he_domingo = coalesce((p->>'percentual_he_domingo')::numeric, percentual_he_domingo),
    jornada_sabado_horas = coalesce((p->>'jornada_sabado_horas')::numeric, jornada_sabado_horas),
    tolerancia_minutos = coalesce((p->>'tolerancia_minutos')::int, tolerancia_minutos),
    salario_minimo = coalesce((p->>'salario_minimo')::numeric, salario_minimo),
    desconto_vt_pct = coalesce((p->>'desconto_vt_pct')::numeric, desconto_vt_pct),
    valor_passagem = coalesce((p->>'valor_passagem')::numeric, valor_passagem),
    ponto_inicio = case when p ? 'ponto_inicio' then nullif(p->>'ponto_inicio', '')::date else ponto_inicio end,
    inss_faixas = coalesce(p->'inss_faixas', inss_faixas),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = 1;
end $$;

-- ---------------------------------------------------------------------
-- Pagamentos
-- ---------------------------------------------------------------------
create table pagamentos (
  id               uuid primary key default gen_random_uuid(),
  data_pagamento   date not null,
  titulo           text not null check (length(trim(titulo)) >= 3),
  tipo             text not null default 'adiantamento' check (tipo in ('adiantamento','saldo','rescisao','outro')),
  periodo_inicio   date,                       -- período das passagens e da alimentação
  periodo_fim      date,
  status           text not null default 'rascunho' check (status in ('rascunho','fechado','pago','cancelado')),
  observacoes      text,
  criado_por       uuid references perfis(id),
  criado_em        timestamptz not null default now(),
  fechado_por      uuid references perfis(id),
  fechado_em       timestamptz,
  pago_em          date,
  motivo_cancelamento text,
  check (periodo_fim is null or periodo_inicio is null or periodo_fim >= periodo_inicio)
);
create index on pagamentos (data_pagamento);

create table pagamento_itens (
  id              bigserial primary key,
  pagamento_id    uuid not null references pagamentos(id),
  funcionario_id  uuid references funcionarios(id),
  empregador_id   uuid references empregadores(id),
  obra_id         uuid references obras(id),
  categoria       text not null check (categoria in ('adiantamento','saldo','quinzena','rescisao','salario','hora_extra',
                    'desconto','taxa','passagem','alimentacao','outro')),
  destino         text not null check (destino in ('empresa','funcionario')),
  descricao       text not null check (length(trim(descricao)) >= 2),
  valor           numeric(14,2) not null,
  removido        boolean not null default false,
  criado_por      uuid references perfis(id),
  criado_em       timestamptz not null default now(),
  check (categoria = 'desconto' or valor >= 0)
);
create index on pagamento_itens (pagamento_id) where not removido;
create index on pagamento_itens (funcionario_id);

alter table lancamentos add column pagamento_id uuid references pagamentos(id);
create index on lancamentos (pagamento_id);

create or replace function _pg_rascunho(p_id uuid) returns pagamentos
language plpgsql security definer set search_path = public as $$
declare p pagamentos;
begin
  if not tem_papel('admin','rh','financeiro') then raise exception 'Apenas RH, financeiro ou diretoria mexem nos pagamentos'; end if;
  select * into p from pagamentos where id = p_id for update;
  if not found then raise exception 'Pagamento não encontrado'; end if;
  if p.status <> 'rascunho' then raise exception 'Este pagamento já foi fechado — reabra ou crie outro'; end if;
  return p;
end $$;

create or replace function pagamento_criar(p_data date, p_titulo text, p_tipo text, p_inicio date default null, p_fim date default null,
  p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not tem_papel('admin','rh','financeiro') then raise exception 'Apenas RH, financeiro ou diretoria criam pagamentos'; end if;
  if p_data is null then raise exception 'Informe a data do pagamento'; end if;
  insert into pagamentos (data_pagamento, titulo, tipo, periodo_inicio, periodo_fim, observacoes, criado_por)
  values (p_data, coalesce(nullif(trim(p_titulo), ''), 'Pagamento de ' || to_char(p_data, 'DD/MM/YYYY')), coalesce(p_tipo, 'outro'),
          p_inicio, p_fim, p_obs, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function pagamento_item_salvar(p_pagamento uuid, p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_func funcionarios; v_cat text := p->>'categoria'; v_dest text := p->>'destino';
begin
  perform _pg_rascunho(p_pagamento);
  if nullif(p->>'funcionario_id', '') is not null then
    select * into v_func from funcionarios where id = (p->>'funcionario_id')::uuid;
    if not found then raise exception 'Funcionário não encontrado'; end if;
  end if;
  if v_dest is null then
    v_dest := case when v_cat in ('passagem','alimentacao') then 'funcionario'
                   when (select tipo from empregadores where id = coalesce(nullif(p->>'empregador_id','')::uuid, v_func.empregador_id)) in ('fornecedora_mao_obra','parceira') then 'empresa'
                   else 'funcionario' end;
  end if;
  insert into pagamento_itens (pagamento_id, funcionario_id, empregador_id, obra_id, categoria, destino, descricao, valor, criado_por)
  values (p_pagamento, v_func.id, coalesce(nullif(p->>'empregador_id','')::uuid, v_func.empregador_id),
          coalesce(nullif(p->>'obra_id','')::uuid, v_func.obra_id), v_cat, v_dest,
          coalesce(nullif(trim(p->>'descricao'), ''), initcap(replace(v_cat, '_', ' '))),
          round((p->>'valor')::numeric, 2), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function pagamento_item_remover(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_pg uuid;
begin
  select pagamento_id into v_pg from pagamento_itens where id = p_item and not removido;
  if v_pg is null then raise exception 'Item não encontrado'; end if;
  perform _pg_rascunho(v_pg);
  update pagamento_itens set removido = true where id = p_item;
end $$;

-- dias úteis (seg a sex, sem feriado) entre duas datas
create or replace function _dias_uteis(p_ini date, p_fim date) returns int
language sql stable set search_path = public as $$
  select count(*)::int from generate_series(p_ini, p_fim, interval '1 day') g(d)
   where p_ini <= p_fim and extract(isodow from g.d) between 1 and 5
     and not exists (select 1 from feriados f where f.data = g.d::date and f.ambito <> 'facultativo')
$$;
create or replace function _semanas_uteis(p_ini date, p_fim date) returns int
language sql stable set search_path = public as $$
  select count(distinct date_trunc('week', g.d))::int from generate_series(p_ini, p_fim, interval '1 day') g(d)
   where p_ini <= p_fim and extract(isodow from g.d) between 1 and 5
     and not exists (select 1 from feriados f where f.data = g.d::date and f.ambito <> 'facultativo')
$$;

-- Gera as linhas sugeridas (o RH confere e ajusta antes de fechar)
create or replace function pagamento_gerar(p_pagamento uuid, p_beneficios boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare pg pagamentos; par dp_parametros; r record; e record; n int := 0; v_ini_mes date; v_fim_mes date;
        v_sal numeric; v_val numeric; v_dias int; v_bi date; v_bf date; v_adiant numeric; v_folha record; v_base numeric; v_qtd int;
begin
  pg := _pg_rascunho(p_pagamento);
  select * into par from dp_parametros where id = 1;
  if exists (select 1 from pagamento_itens where pagamento_id = p_pagamento and not removido) then
    raise exception 'Este pagamento já tem linhas. Remova-as antes de gerar de novo';
  end if;
  -- competência: adiantamento do dia 20 = mês do pagamento; saldo do dia 05 = mês anterior
  v_ini_mes := case when pg.tipo = 'saldo' then (date_trunc('month', pg.data_pagamento) - interval '1 month')::date
                    else date_trunc('month', pg.data_pagamento)::date end;
  v_fim_mes := (v_ini_mes + interval '1 month - 1 day')::date;
  for r in select f.*, fn.nome as fnome, coalesce(f.alimentacao_dia, fn.vale_alimentacao_dia) as va, em.nome as enome,
                  em.tipo as etipo, em.fechamento_externo as eext, em.adiantamento_pct as epct,
                  case when em.fechamento_externo and f.salario is null then null
                       else round(coalesce(f.salario, fn.salario_base, 0) * (1 + f.adicional_pct / 100), 2) end as sal
             from funcionarios f join empregadores em on em.id = f.empregador_id left join funcoes fn on fn.id = f.funcao_id
            where f.data_admissao <= coalesce(pg.periodo_fim, pg.data_pagamento)
              and (f.data_demissao is null or f.data_demissao >= v_ini_mes)
            order by em.nome, f.nome loop
    v_sal := r.sal;
    -- 1) salário
    if pg.tipo in ('adiantamento','saldo','rescisao') then
      if r.eext then
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'quinzena', 'valor', 0,
          'descricao', 'Quinzena — informar o valor do fechamento da ' || r.enome));
        n := n + 1;
      elsif r.data_demissao is not null and r.data_demissao <= coalesce(pg.periodo_fim, pg.data_pagamento) then
        if not exists (select 1 from pagamento_itens i join pagamentos p on p.id = i.pagamento_id
                        where i.funcionario_id = r.id and i.categoria = 'rescisao' and not i.removido and p.status <> 'cancelado') then
          v_dias := r.data_demissao - greatest(v_ini_mes, r.data_admissao) + 1;
          v_val := round(coalesce(v_sal, 0) / 30 * v_dias, 2);
          perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'rescisao', 'valor', v_val,
            'descricao', format('Saldo de salário — %s dia(s) até %s (desligado). Férias, 13º, aviso e FGTS no acerto da rescisão',
                                v_dias, to_char(r.data_demissao, 'DD/MM'))));
          n := n + 1;
        end if;
      elsif pg.tipo = 'adiantamento' then
        v_val := round(coalesce(v_sal, 0) * r.epct / 100, 2);
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'adiantamento', 'valor', v_val,
          'descricao', format('Adiantamento %s%% de %s', trim_scale(r.epct), _brl(coalesce(v_sal, 0)))));
        n := n + 1;
      elsif pg.tipo = 'saldo' then
        select coalesce(sum(i.valor), 0) into v_adiant from pagamento_itens i join pagamentos p on p.id = i.pagamento_id
         where i.funcionario_id = r.id and i.categoria = 'adiantamento' and not i.removido and p.status <> 'cancelado'
           and p.data_pagamento between v_ini_mes and v_fim_mes;
        select * into v_folha from folha_previa(v_ini_mes) fp where fp.funcionario_id = r.id;
        v_base := coalesce(v_folha.bruto, v_sal, 0);
        v_val := greatest(v_base - v_adiant, 0);
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'saldo', 'valor', v_val,
          'descricao', format('Saldo de %s: %s − adiantamento %s%s', to_char(v_ini_mes, 'MM/YYYY'), _brl(v_base), _brl(v_adiant),
            case when coalesce(v_folha.faltas, 0) > 0 or coalesce(v_folha.he_util_valor, 0) + coalesce(v_folha.he_100_valor, 0) > 0
                 then format(' (faltas: %s; horas extras: %s)', v_folha.faltas, _brl(coalesce(v_folha.he_util_valor,0) + coalesce(v_folha.he_100_valor,0) + coalesce(v_folha.dsr_he,0)))
                 else '' end)));
        n := n + 1;
      end if;
    end if;
    -- 2) passagens e alimentação (só ativos no período)
    if p_beneficios and pg.periodo_inicio is not null and pg.periodo_fim is not null
       and (r.data_demissao is null or r.data_demissao > pg.periodo_fim) then
      v_bi := greatest(pg.periodo_inicio, r.data_admissao); v_bf := pg.periodo_fim;
      v_dias := _dias_uteis(v_bi, v_bf);
      if v_dias > 0 and coalesce(r.passagens_dia, 0) > 0 then
        v_val := v_dias * r.passagens_dia * coalesce(r.valor_passagem, par.valor_passagem);
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'passagem', 'valor', v_val,
          'descricao', format('Passagens %s a %s: %s dia(s) × %s × %s', to_char(v_bi,'DD/MM'), to_char(v_bf,'DD/MM'), v_dias,
                              trim_scale(r.passagens_dia), _brl(coalesce(r.valor_passagem, par.valor_passagem)))));
        n := n + 1;
      elsif v_dias > 0 and coalesce(r.passagem_semanal, 0) > 0 then
        v_qtd := _semanas_uteis(v_bi, v_bf);
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'passagem',
          'valor', v_qtd * r.passagem_semanal, 'descricao', format('Passagem/combustível: %s semana(s) × %s', v_qtd, _brl(r.passagem_semanal))));
        n := n + 1;
      end if;
      if v_dias > 0 and coalesce(r.va, 0) > 0 then
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'alimentacao', 'valor', v_dias * r.va,
          'descricao', format('Alimentação %s a %s: %s dia(s) × %s', to_char(v_bi,'DD/MM'), to_char(v_bf,'DD/MM'), v_dias, _brl(r.va))));
        n := n + 1;
      end if;
    end if;
  end loop;
  -- 3) taxa das empresas fornecedoras de mão de obra
  for e in select em.id, em.nome, em.taxa_tipo, em.taxa_valor,
                  sum(i.valor) filter (where i.categoria in ('adiantamento','saldo','rescisao','salario','hora_extra','desconto')) as folha,
                  count(distinct i.funcionario_id) filter (where i.categoria in ('adiantamento','saldo','rescisao','salario')) as pessoas
             from pagamento_itens i join empregadores em on em.id = i.empregador_id
            where i.pagamento_id = p_pagamento and not i.removido and i.destino = 'empresa' and em.taxa_tipo <> 'nenhuma'
            group by em.id, em.nome, em.taxa_tipo, em.taxa_valor loop
    if e.taxa_tipo = 'percentual_folha' and coalesce(e.folha, 0) > 0 then
      perform pagamento_item_salvar(p_pagamento, jsonb_build_object('empregador_id', e.id, 'categoria', 'taxa', 'destino', 'empresa',
        'valor', round(e.folha * e.taxa_valor / 100, 2), 'descricao', format('Taxa administrativa %s%% sobre a folha de %s', trim_scale(e.taxa_valor), _brl(e.folha))));
      n := n + 1;
    elsif e.taxa_tipo = 'fixo_funcionario_mes' and e.pessoas > 0 then
      perform pagamento_item_salvar(p_pagamento, jsonb_build_object('empregador_id', e.id, 'categoria', 'taxa', 'destino', 'empresa',
        'valor', e.pessoas * round(e.taxa_valor / 2, 2),
        'descricao', format('Taxa administrativa: %s funcionário(s) × %s (metade de %s/mês)', e.pessoas, _brl(round(e.taxa_valor / 2, 2)), _brl(e.taxa_valor))));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Fecha: congela as linhas e lança as contas a pagar no financeiro (uma por empresa/obra e uma de benefícios por obra)
create or replace function pagamento_fechar(p_pagamento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pg pagamentos; r record;
begin
  pg := _pg_rascunho(p_pagamento);
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria fecham o pagamento'; end if;
  if not exists (select 1 from pagamento_itens where pagamento_id = p_pagamento and not removido and valor <> 0) then
    raise exception 'O pagamento não tem valores';
  end if;
  for r in select i.obra_id, i.destino, case when i.destino = 'empresa' then i.empregador_id end as emp,
                  max(em.nome) filter (where i.destino = 'empresa') as enome,
                  bool_or(i.categoria not in ('passagem','alimentacao')) as tem_salario,
                  sum(i.valor) as total
             from pagamento_itens i left join empregadores em on em.id = i.empregador_id
            where i.pagamento_id = p_pagamento and not i.removido
            group by i.obra_id, i.destino, case when i.destino = 'empresa' then i.empregador_id end
           having sum(i.valor) > 0 loop
    insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento, origem, pagamento_id, criado_por)
    values (r.obra_id, 'despesa', case when r.destino = 'empresa' or r.tem_salario then 'mao_de_obra' else 'beneficios' end,
            format('%s — %s', pg.titulo, case when r.destino = 'empresa' then coalesce(r.enome, 'empresa') || ' (folha e taxa)'
                                             when r.tem_salario then 'pagamentos diretos aos funcionários'
                                             else 'passagens e alimentação' end),
            case when r.destino = 'empresa' then r.enome else 'Funcionários' end,
            r.total, pg.data_pagamento, pg.data_pagamento, 'folha', p_pagamento, auth.uid());
  end loop;
  update pagamentos set status = 'fechado', fechado_por = auth.uid(), fechado_em = now() where id = p_pagamento;
end $$;

create or replace function pagamento_quitar(p_pagamento uuid, p_data date) returns void
language plpgsql security definer set search_path = public as $$
declare pg pagamentos;
begin
  if not tem_papel('admin','financeiro','rh') then raise exception 'Sem permissão'; end if;
  select * into pg from pagamentos where id = p_pagamento for update;
  if not found or pg.status <> 'fechado' then raise exception 'Só é possível dar baixa em pagamento fechado'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Data de pagamento inválida (não pode ser futura)'; end if;
  update lancamentos set status = 'liquidado', liquidado_em = p_data, valor_liquidado = valor, forma_pagamento = 'Pagamento do RH',
         atualizado_em = now()
   where pagamento_id = p_pagamento and status = 'aberto';
  update pagamentos set status = 'pago', pago_em = p_data where id = p_pagamento;
end $$;

-- Reabre um pagamento fechado (ainda não pago): cancela as contas geradas e volta a rascunho
create or replace function pagamento_reabrir(p_pagamento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare pg pagamentos;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria reabrem o pagamento'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo'; end if;
  select * into pg from pagamentos where id = p_pagamento for update;
  if not found or pg.status <> 'fechado' then raise exception 'Só é possível reabrir pagamento fechado e ainda não pago'; end if;
  update lancamentos set status = 'cancelado', motivo_cancelamento = 'Pagamento reaberto: ' || p_motivo, atualizado_em = now()
   where pagamento_id = p_pagamento and status = 'aberto';
  update pagamentos set status = 'rascunho', fechado_por = null, fechado_em = null where id = p_pagamento;
end $$;

create or replace function pagamento_cancelar(p_pagamento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare pg pagamentos;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria cancelam o pagamento'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo'; end if;
  select * into pg from pagamentos where id = p_pagamento for update;
  if not found or pg.status not in ('rascunho','fechado') then raise exception 'Só é possível cancelar pagamento ainda não pago'; end if;
  update lancamentos set status = 'cancelado', motivo_cancelamento = 'Pagamento cancelado: ' || p_motivo, atualizado_em = now()
   where pagamento_id = p_pagamento and status = 'aberto';
  update pagamentos set status = 'cancelado', motivo_cancelamento = p_motivo where id = p_pagamento;
end $$;

create view v_pagamentos with (security_invoker = true) as
select p.*, pc.nome as criado_nome,
       coalesce(sum(i.valor) filter (where not i.removido), 0) as total,
       coalesce(sum(i.valor) filter (where not i.removido and i.destino = 'empresa'), 0) as total_empresas,
       coalesce(sum(i.valor) filter (where not i.removido and i.destino = 'funcionario' and i.categoria in ('passagem','alimentacao')), 0) as total_beneficios,
       coalesce(sum(i.valor) filter (where not i.removido and i.destino = 'funcionario' and i.categoria not in ('passagem','alimentacao')), 0) as total_pessoas,
       count(distinct i.funcionario_id) filter (where not i.removido) as funcionarios
  from pagamentos p left join pagamento_itens i on i.pagamento_id = p.id left join perfis pc on pc.id = p.criado_por
 group by p.id, pc.nome;

do $$
declare t text;
begin
  foreach t in array array['pagamentos','pagamento_itens'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
    execute format('create trigger tg_%s_audit after insert or update on %I for each row execute function _tg_auditoria()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
grant select on pagamentos, pagamento_itens, v_pagamentos to authenticated;
grant usage on sequence pagamento_itens_id_seq to authenticated;
create policy pag_sel on pagamentos for select to authenticated using (tem_papel('admin','rh','financeiro'));
create policy pagi_sel on pagamento_itens for select to authenticated using (exists (select 1 from pagamentos p where p.id = pagamento_id));

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
grant execute on function espelho_publico(text, date) to anon;
grant execute on function ponto_contestar(text, date, text) to anon;
