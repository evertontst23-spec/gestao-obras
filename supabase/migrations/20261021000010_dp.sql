-- =====================================================================
-- 10. DEPARTAMENTO PESSOAL — parâmetros, feriados, atestados, espelho de ponto,
--     horas extras 70%/100% calculadas pelo ponto, faltas, atrasos e folha.
-- Os valores legais (salário mínimo, faixas do INSS) ficam em parâmetros editáveis
-- pelo RH: confira-os a cada ano.
-- =====================================================================

create table dp_parametros (
  id                      int primary key default 1 check (id = 1),
  percentual_he_util      numeric(5,2) not null default 70,    -- dias úteis e sábados
  percentual_he_domingo   numeric(5,2) not null default 100,   -- domingos e feriados
  jornada_sabado_horas    numeric(4,2) not null default 0,     -- 0 = sábado inteiro é hora extra
  tolerancia_minutos      int not null default 10,             -- CLT art. 58 §1º
  divisor_horas_mes       int not null default 220,
  salario_minimo          numeric(10,2) not null default 1518.00,
  desconto_vt_pct         numeric(5,2) not null default 6,
  inss_faixas             jsonb not null default
    '[{"ate":1518.00,"aliquota":7.5},{"ate":2793.88,"aliquota":9},{"ate":4190.83,"aliquota":12},{"ate":8157.41,"aliquota":14}]',
  atualizado_por          uuid references perfis(id),
  atualizado_em           timestamptz not null default now()
);
insert into dp_parametros (id) values (1);

create table feriados (
  data      date primary key,
  descricao text not null,
  ambito    text not null default 'nacional'
);
insert into feriados (data, descricao, ambito) values
 ('2026-01-01','Confraternização Universal','nacional'), ('2026-02-16','Carnaval (ponto facultativo)','facultativo'),
 ('2026-02-17','Carnaval (ponto facultativo)','facultativo'), ('2026-04-03','Sexta-feira Santa','nacional'),
 ('2026-04-21','Tiradentes','nacional'), ('2026-05-01','Dia do Trabalho','nacional'), ('2026-06-04','Corpus Christi','facultativo'),
 ('2026-06-24','São João (Recife)','municipal'), ('2026-07-16','Nossa Senhora do Carmo (Recife)','municipal'),
 ('2026-09-07','Independência','nacional'), ('2026-10-12','Nossa Senhora Aparecida','nacional'),
 ('2026-11-02','Finados','nacional'), ('2026-11-15','Proclamação da República','nacional'),
 ('2026-11-20','Dia da Consciência Negra','nacional'), ('2026-12-08','Nossa Senhora da Conceição (Recife)','municipal'),
 ('2026-12-25','Natal','nacional'),
 ('2027-01-01','Confraternização Universal','nacional'), ('2027-03-26','Sexta-feira Santa','nacional'),
 ('2027-04-21','Tiradentes','nacional'), ('2027-05-01','Dia do Trabalho','nacional'), ('2027-06-24','São João (Recife)','municipal'),
 ('2027-07-16','Nossa Senhora do Carmo (Recife)','municipal'), ('2027-09-07','Independência','nacional'),
 ('2027-10-12','Nossa Senhora Aparecida','nacional'), ('2027-11-02','Finados','nacional'), ('2027-11-15','Proclamação da República','nacional'),
 ('2027-11-20','Dia da Consciência Negra','nacional'), ('2027-12-08','Nossa Senhora da Conceição (Recife)','municipal'), ('2027-12-25','Natal','nacional');

-- Atestados (dado de saúde: acesso restrito a RH/diretoria)
create table atestados (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id),
  tipo           text not null default 'medico' check (tipo in ('medico','odontologico','acompanhamento','declaracao_horas','acidente_trabalho')),
  data_inicio    date not null,
  dias           int not null default 1 check (dias between 0 and 365),
  horas          numeric(4,2),                -- declaração de comparecimento (horas abonadas)
  cid            text,
  profissional   text,
  caminho        text,
  observacoes    text,
  registrado_por uuid not null references perfis(id),
  criado_em      timestamptz not null default now(),
  check (tipo <> 'declaracao_horas' or horas is not null)
);
create index on atestados (funcionario_id, data_inicio);

-- ---------------------------------------------------------------------
-- ESPELHO DE PONTO (cálculo por dia)
-- ---------------------------------------------------------------------
create or replace function _pode_ver_dp(p_func uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from funcionarios f where f.id = p_func and
    (tem_papel('admin','rh','financeiro') or (tem_papel('engenheiro') and f.obra_id is not null and gere_obra(f.obra_id)) or f.usuario_id = auth.uid()))
$$;

create or replace function espelho_ponto(p_func uuid, p_inicio date, p_fim date)
returns table (data date, dia_semana int, feriado text, marcacoes jsonb, trabalhado_min int, previsto_min int,
               he_util_min int, he_100_min int, atraso_min int, falta boolean, abonado text, incompleto boolean)
language plpgsql stable security definer set search_path = public as $$
declare f record; par dp_parametros; d date; regs record; v_ent timestamptz; v_trab int; v_prev int; v_marc jsonb; v_inc boolean;
        v_fer text; v_ab text; v_dif int; v_horas_ab numeric;
begin
  if not _pode_ver_dp(p_func) then raise exception 'Sem permissão para ver o ponto deste funcionário'; end if;
  select fu.*, coalesce(fn.carga_diaria_horas, 8) as carga into f from funcionarios fu left join funcoes fn on fn.id = fu.funcao_id where fu.id = p_func;
  select * into par from dp_parametros where id = 1;
  d := p_inicio;
  while d <= p_fim loop
    if d >= f.data_admissao and (f.data_demissao is null or d <= f.data_demissao) and d <= hoje() then
      v_trab := 0; v_ent := null; v_inc := false; v_marc := '[]'::jsonb;
      for regs in select * from registros_ponto r where r.funcionario_id = p_func and r.data = d order by r.momento loop
        v_marc := v_marc || jsonb_build_object('t', regs.tipo, 'h', to_char(regs.momento at time zone 'America/Recife', 'HH24:MI'), 'm', regs.metodo);
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
      if v_inc or d = hoje() then
        null;   -- marcação incompleta (ou o dia de hoje, ainda aberto): não calcula HE/atraso/falta
      elsif v_fer is not null or extract(isodow from d) = 7 then
        he_100_min := v_trab;
      else
        v_dif := v_trab - v_prev;
        if v_dif > par.tolerancia_minutos then he_util_min := v_dif; end if;
        if v_prev > 0 and v_trab = 0 and jsonb_array_length(v_marc) = 0 and v_ab is null then
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

-- Resumo do mês por funcionário
create or replace function resumo_ponto(p_func uuid, p_mes date)
returns table (dias_trabalhados int, faltas int, dias_abonados int, he_util_min int, he_100_min int, atraso_min int,
               incompletos int, domingos_feriados int, dias_uteis int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where trabalhado_min > 0)::int, count(*) filter (where falta)::int,
         count(*) filter (where abonado is not null and trabalhado_min = 0)::int,
         coalesce(sum(he_util_min),0)::int, coalesce(sum(he_100_min),0)::int, coalesce(sum(atraso_min),0)::int,
         count(*) filter (where incompleto)::int,
         (select count(*) from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, '1 day') g(d)
           where extract(isodow from g.d) = 7 or exists (select 1 from feriados fe where fe.data = g.d::date and fe.ambito <> 'facultativo'))::int,
         (select count(*) from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, '1 day') g(d)
           where extract(isodow from g.d) between 1 and 6 and not exists (select 1 from feriados fe where fe.data = g.d::date and fe.ambito <> 'facultativo'))::int
    from espelho_ponto(p_func, date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date)
$$;

-- ---------------------------------------------------------------------
-- FOLHA (prévia calculada e fechamento com snapshot imutável)
-- ---------------------------------------------------------------------
create or replace function _inss(p_base numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare fx jsonb; v numeric := 0; ant numeric := 0; lim numeric;
begin
  for fx in select * from jsonb_array_elements((select inss_faixas from dp_parametros where id = 1)) loop
    lim := (fx->>'ate')::numeric;
    if p_base > ant then v := v + (least(p_base, lim) - ant) * (fx->>'aliquota')::numeric / 100; end if;
    ant := lim;
  end loop;
  return round(v, 2);
end $$;

create or replace function folha_previa(p_mes date, p_obra uuid default null)
returns table (funcionario_id uuid, matricula text, nome text, funcao text, obra_id uuid, obra_codigo text,
               salario_base numeric, insalubridade numeric, periculosidade numeric, valor_hora numeric,
               he_util_h numeric, he_util_valor numeric, he_100_h numeric, he_100_valor numeric, dsr_he numeric,
               faltas int, desconto_faltas numeric, atraso_h numeric, desconto_atrasos numeric,
               dias_trabalhados int, vale_alimentacao numeric, vale_transporte numeric, desconto_vt numeric,
               bruto numeric, inss numeric, liquido_estimado numeric, incompletos int)
language plpgsql stable security definer set search_path = public as $$
declare par dp_parametros; r record; rp record; v_ini date := date_trunc('month', p_mes)::date; v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if not tem_papel('admin','rh','financeiro') and not (tem_papel('engenheiro') and p_obra is not null and gere_obra(p_obra)) then
    raise exception 'Sem permissão para ver a folha';
  end if;
  select * into par from dp_parametros where id = 1;
  for r in select f.*, fn.nome as fnome, coalesce(f.salario, fn.salario_base, 0) as sal, fn.adicional_insalubridade_pct as ins_pct,
                  fn.adicional_periculosidade as peric, fn.vale_alimentacao_dia as va, fn.vale_transporte_dia as vt, o.codigo as ocod
             from funcionarios f left join funcoes fn on fn.id = f.funcao_id left join obras o on o.id = f.obra_id
            where f.data_admissao <= v_fim and (f.data_demissao is null or f.data_demissao >= v_ini)
              and (p_obra is null or f.obra_id = p_obra)
            order by f.nome loop
    select * into rp from resumo_ponto(r.id, p_mes);
    funcionario_id := r.id; matricula := r.matricula; nome := r.nome; funcao := r.fnome; obra_id := r.obra_id; obra_codigo := r.ocod;
    salario_base := r.sal;
    insalubridade := round(par.salario_minimo * coalesce(r.ins_pct,0) / 100, 2);
    periculosidade := case when r.peric then round(r.sal * 0.30, 2) else 0 end;
    valor_hora := round((r.sal + insalubridade + periculosidade) / par.divisor_horas_mes, 4);
    he_util_h := round(rp.he_util_min / 60.0, 2); he_100_h := round(rp.he_100_min / 60.0, 2);
    he_util_valor := round(he_util_h * valor_hora * (1 + par.percentual_he_util / 100), 2);
    he_100_valor := round(he_100_h * valor_hora * (1 + par.percentual_he_domingo / 100), 2);
    -- DSR sobre horas extras (Súmula 172 TST)
    dsr_he := case when rp.dias_uteis > 0 then round((he_util_valor + he_100_valor) / rp.dias_uteis * rp.domingos_feriados, 2) else 0 end;
    faltas := rp.faltas; desconto_faltas := round(r.sal / 30 * rp.faltas, 2);
    atraso_h := round(rp.atraso_min / 60.0, 2); desconto_atrasos := round(atraso_h * valor_hora, 2);
    dias_trabalhados := rp.dias_trabalhados;
    vale_alimentacao := round(coalesce(r.va,0) * rp.dias_trabalhados, 2);
    vale_transporte := round(coalesce(r.vt,0) * rp.dias_trabalhados, 2);
    desconto_vt := least(vale_transporte, round(r.sal * par.desconto_vt_pct / 100, 2));
    bruto := r.sal + insalubridade + periculosidade + he_util_valor + he_100_valor + dsr_he - desconto_faltas - desconto_atrasos;
    inss := _inss(bruto);
    liquido_estimado := bruto - inss - desconto_vt;
    incompletos := rp.incompletos;
    return next;
  end loop;
end $$;

create table folhas (
  id           uuid primary key default gen_random_uuid(),
  competencia  date not null unique check (extract(day from competencia) = 1),
  total_bruto  numeric(14,2) not null,
  total_liquido numeric(14,2) not null,
  total_he     numeric(14,2) not null,
  funcionarios int not null,
  fechada_por  uuid not null references perfis(id),
  fechada_em   timestamptz not null default now(),
  itens        jsonb not null            -- snapshot linha a linha (não muda depois)
);

create or replace function folha_fechar(p_mes date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_itens jsonb; v_comp date := date_trunc('month', p_mes)::date;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria fecham a folha'; end if;
  if v_comp >= date_trunc('month', hoje())::date and hoje() < (v_comp + interval '1 month - 1 day')::date then
    raise exception 'A competência ainda não terminou';
  end if;
  if exists (select 1 from folhas where competencia = v_comp) then raise exception 'Folha de % já fechada', to_char(v_comp, 'MM/YYYY'); end if;
  select jsonb_agg(to_jsonb(p)) into v_itens from folha_previa(v_comp) p;
  if v_itens is null then raise exception 'Nenhum funcionário na competência'; end if;
  if exists (select 1 from jsonb_array_elements(v_itens) e where (e->>'incompletos')::int > 0) then
    raise exception 'Há marcações de ponto incompletas no mês. Corrija com lançamento manual antes de fechar.';
  end if;
  insert into folhas (competencia, total_bruto, total_liquido, total_he, funcionarios, fechada_por, itens)
  select v_comp, sum((e->>'bruto')::numeric), sum((e->>'liquido_estimado')::numeric),
         sum((e->>'he_util_valor')::numeric + (e->>'he_100_valor')::numeric + (e->>'dsr_he')::numeric), count(*), auth.uid(), v_itens
    from jsonb_array_elements(v_itens) e
  returning id into v_id;
  return v_id;
end $$;

create or replace function atestado_registrar(p_func uuid, p_tipo text, p_inicio date, p_dias int, p_horas numeric, p_cid text,
                                              p_profissional text, p_caminho text, p_obs text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas o RH registra atestados'; end if;
  if not exists (select 1 from funcionarios where id = p_func) then raise exception 'Funcionário não encontrado'; end if;
  if p_inicio > hoje() + 30 then raise exception 'Data de início inválida'; end if;
  insert into atestados (funcionario_id, tipo, data_inicio, dias, horas, cid, profissional, caminho, observacoes, registrado_por)
  values (p_func, p_tipo, p_inicio, case when p_tipo = 'declaracao_horas' then 1 else coalesce(p_dias, 1) end, p_horas,
          nullif(upper(trim(p_cid)),''), p_profissional, p_caminho, p_obs, auth.uid())
  returning id into v_id;
  return v_id;
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
    inss_faixas = coalesce(p->'inss_faixas', inss_faixas),
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = 1;
end $$;

-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['atestados','folhas'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
  end loop;
  foreach t in array array['atestados','folhas','dp_parametros','feriados'] loop
    execute format('create trigger tg_%s_audit after insert or update or delete on %I for each row execute function _tg_auditoria()', t, t);
  end loop;
end $$;
create trigger tg_folhas_noupdate before update on folhas for each row execute function _tg_auditoria_imutavel();

alter table dp_parametros enable row level security;
alter table feriados      enable row level security;
alter table atestados     enable row level security;
alter table folhas        enable row level security;
revoke all on dp_parametros, feriados, atestados, folhas from anon;
create policy dpp_sel on dp_parametros for select to authenticated using (meu_papel() is not null);
create policy fer_sel on feriados      for select to authenticated using (meu_papel() is not null);
create policy fer_ins on feriados      for insert to authenticated with check (tem_papel('admin','rh'));
create policy fer_del on feriados      for delete to authenticated using (tem_papel('admin','rh'));
create policy ate_sel on atestados     for select to authenticated using (tem_papel('admin','rh'));
create policy fol_sel on folhas        for select to authenticated using (tem_papel('admin','rh','financeiro'));

-- Arquivos de atestado ("dp/..."): só RH e diretoria (a pasta "rh/" também é vista pela segurança)
create policy dp_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'dp' and public.tem_papel('admin','rh'));
create policy dp_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = 'dp' and public.tem_papel('admin','rh'));

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
