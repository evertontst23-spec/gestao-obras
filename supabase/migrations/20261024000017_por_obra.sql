-- =====================================================================
-- 0017 — Por obra: folha fechada por obra, pagamentos por obra (centro de custo) e foto do rosto
-- =====================================================================

-- ---------------------------------------------------------------------
-- Foto do rosto tirada no cadastro da biometria (aparece na ficha, na lista e no dossiê)
-- ---------------------------------------------------------------------
alter table funcionarios add column foto_caminho text;
-- a tabela funcionarios usa permissões por coluna (esconde a biometria)
grant select (foto_caminho), update (foto_caminho) on funcionarios to authenticated;

-- ---------------------------------------------------------------------
-- Folha fechada por obra (centro de custo). Folha "geral" (obra vazia) continua existindo.
-- ---------------------------------------------------------------------
alter table folhas add column obra_id uuid references obras(id);
alter table folhas drop constraint folhas_competencia_key;
create unique index folhas_competencia_obra_uk on folhas (competencia, coalesce(obra_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- a folha do funcionário está fechada? (folha geral do mês ou a folha da obra dele)
create or replace function _folha_fechada(p_obra uuid, p_comp date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from folhas where competencia = date_trunc('month', p_comp)::date
                  and (obra_id is null or obra_id = p_obra))
$$;

create or replace function folha_fechar_obra(p_mes date, p_obra uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_itens jsonb; v_comp date := date_trunc('month', p_mes)::date; v_cod text;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria fecham a folha'; end if;
  if p_obra is null then raise exception 'Escolha a obra'; end if;
  select codigo into v_cod from obras where id = p_obra;
  if not found then raise exception 'Obra não encontrada'; end if;
  if v_comp >= date_trunc('month', hoje())::date and hoje() < (v_comp + interval '1 month - 1 day')::date then
    raise exception 'A competência ainda não terminou';
  end if;
  if _folha_fechada(p_obra, v_comp) then raise exception 'Folha de % da obra % já fechada', to_char(v_comp, 'MM/YYYY'), v_cod; end if;
  select jsonb_agg(to_jsonb(p)) into v_itens from folha_previa(v_comp, p_obra) p;
  if v_itens is null then raise exception 'Nenhum funcionário da obra % na competência', v_cod; end if;
  if exists (select 1 from jsonb_array_elements(v_itens) e where (e->>'incompletos')::int > 0) then
    raise exception 'Há marcações de ponto incompletas no mês nesta obra. Corrija com lançamento manual antes de fechar.';
  end if;
  insert into folhas (competencia, obra_id, total_bruto, total_liquido, total_he, funcionarios, fechada_por, itens)
  select v_comp, p_obra, sum((e->>'bruto')::numeric), sum((e->>'liquido_estimado')::numeric),
         sum((e->>'he_util_valor')::numeric + (e->>'he_100_valor')::numeric + (e->>'dsr_he')::numeric), count(*), auth.uid(), v_itens
    from jsonb_array_elements(v_itens) e
  returning id into v_id;
  return v_id;
end $$;

create or replace function ponto_corrigir_dia(p_func uuid, p_data date, p_desconsiderar bigint[], p_incluir jsonb,
                                              p_justificativa text, p_contestacao uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare f funcionarios; v_id bigint; it jsonb; v_mom timestamptz; n int := 0;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas o RH corrige marcações de ponto'; end if;
  select * into f from funcionarios where id = p_func;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if coalesce(length(trim(p_justificativa)), 0) < 5 then raise exception 'Justifique a correção (ex.: esqueceu de bater a saída — confirmado pelo encarregado)'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Data inválida'; end if;
  if _folha_fechada(f.obra_id, date_trunc('month', p_data)::date) then
    raise exception 'A folha de % já foi fechada — o ponto deste mês não pode mais ser alterado', to_char(p_data, 'MM/YYYY');
  end if;
  foreach v_id in array coalesce(p_desconsiderar, '{}') loop
    if not exists (select 1 from registros_ponto where id = v_id and funcionario_id = p_func and data = p_data) then
      raise exception 'Marcação % não pertence a este funcionário/dia', v_id;
    end if;
    insert into ponto_desconsideracoes (registro_id, motivo, por) values (v_id, trim(p_justificativa), auth.uid())
    on conflict (registro_id) do nothing;
    n := n + 1;
  end loop;
  for it in select * from jsonb_array_elements(coalesce(p_incluir, '[]')) loop
    continue when coalesce(it->>'hora', '') = '';
    if it->>'tipo' not in ('entrada','saida') then raise exception 'Informe se a marcação é entrada ou saída'; end if;
    v_mom := (p_data + (it->>'hora')::time) at time zone 'America/Recife';
    if v_mom > now() then raise exception 'Não é possível incluir marcação no futuro'; end if;
    perform _ponto_inserir(p_func, f.obra_id, v_mom, it->>'tipo', 'manual', null, null, null, null, 'Correção RH: ' || trim(p_justificativa));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nada a corrigir: marque uma marcação para desconsiderar ou inclua um horário'; end if;
  if p_contestacao is not null then
    update ponto_contestacoes set status = 'corrigida', resposta = trim(p_justificativa), respondido_por = auth.uid(), respondido_em = now()
     where id = p_contestacao and funcionario_id = p_func and status = 'aberta';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Link pessoal do funcionário

create or replace function espelho_publico(p_token text, p_mes date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f funcionarios; v_ini date := date_trunc('month', coalesce(p_mes, hoje()))::date; v_fim date; v jsonb;
begin
  f := _func_do_token(p_token);
  v_ini := greatest(v_ini, date_trunc('month', hoje() - interval '12 months')::date);   -- últimos 12 meses
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  update funcionario_acessos set ultimo_acesso = now() where token = p_token;
  select jsonb_build_object(
    'funcionario', jsonb_build_object('nome', f.nome, 'matricula', f.matricula,
       'funcao', (select nome from funcoes where id = f.funcao_id), 'obra', (select codigo || ' — ' || nome from obras where id = f.obra_id),
       'admissao', f.data_admissao),
    'mes', to_char(v_ini, 'YYYY-MM'),
    'fechada', _folha_fechada(f.obra_id, v_ini),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('data', e.data, 'dia_semana', e.dia_semana, 'feriado', e.feriado,
               'marcacoes', (select coalesce(jsonb_agg(m - 'id'), '[]') from jsonb_array_elements(e.marcacoes) m),
               'trabalhado_min', e.trabalhado_min, 'he_util_min', e.he_util_min, 'he_100_min', e.he_100_min,
               'atraso_min', e.atraso_min, 'falta', e.falta, 'abonado', e.abonado is not null, 'incompleto', e.incompleto) order by e.data)
             from _espelho_ponto(f.id, v_ini, v_fim) e), '[]'),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('data', c.data, 'mensagem', c.mensagem, 'status', c.status,
               'resposta', c.resposta, 'criado_em', c.criado_em) order by c.criado_em desc)
             from ponto_contestacoes c where c.funcionario_id = f.id and c.criado_em > now() - interval '120 days'), '[]'))
  into v;
  return v;
end $$;


-- ---------------------------------------------------------------------
-- Pagamento de uma obra só (fechamento por obra). Sem obra = todas.
-- ---------------------------------------------------------------------
alter table pagamentos add column obra_id uuid references obras(id);
create index on pagamentos (obra_id);

create or replace function pagamento_criar_obra(p_data date, p_titulo text, p_tipo text, p_inicio date, p_fim date,
  p_obs text, p_obra uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text;
begin
  if p_obra is not null then
    select codigo into v_cod from obras where id = p_obra;
    if not found then raise exception 'Obra não encontrada'; end if;
  end if;
  v_id := pagamento_criar(p_data, case when p_obra is not null and nullif(trim(p_titulo), '') is not null
                                       and position(v_cod in p_titulo) = 0 then trim(p_titulo) || ' — ' || v_cod else p_titulo end,
                          p_tipo, p_inicio, p_fim, p_obs);
  if p_obra is not null then update pagamentos set obra_id = p_obra where id = v_id; end if;
  return v_id;
end $$;

-- Gerador: respeita a obra do pagamento e lança a taxa das empresas por obra
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
              and (pg.obra_id is null or f.obra_id = pg.obra_id)
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
  for e in select em.id, em.nome, em.taxa_tipo, em.taxa_valor, i.obra_id,
                  sum(i.valor) filter (where i.categoria in ('adiantamento','saldo','rescisao','salario','hora_extra','desconto')) as folha,
                  count(distinct i.funcionario_id) filter (where i.categoria in ('adiantamento','saldo','rescisao','salario')) as pessoas
             from pagamento_itens i join empregadores em on em.id = i.empregador_id
            where i.pagamento_id = p_pagamento and not i.removido and i.destino = 'empresa' and em.taxa_tipo <> 'nenhuma'
            group by em.id, em.nome, em.taxa_tipo, em.taxa_valor, i.obra_id loop
    if e.taxa_tipo = 'percentual_folha' and coalesce(e.folha, 0) > 0 then
      perform pagamento_item_salvar(p_pagamento, jsonb_build_object('empregador_id', e.id, 'obra_id', e.obra_id, 'categoria', 'taxa', 'destino', 'empresa',
        'valor', round(e.folha * e.taxa_valor / 100, 2), 'descricao', format('Taxa administrativa %s%% sobre a folha de %s', trim_scale(e.taxa_valor), _brl(e.folha))));
      n := n + 1;
    elsif e.taxa_tipo = 'fixo_funcionario_mes' and e.pessoas > 0 then
      perform pagamento_item_salvar(p_pagamento, jsonb_build_object('empregador_id', e.id, 'obra_id', e.obra_id, 'categoria', 'taxa', 'destino', 'empresa',
        'valor', e.pessoas * round(e.taxa_valor / 2, 2),
        'descricao', format('Taxa administrativa: %s funcionário(s) × %s (metade de %s/mês)', e.pessoas, _brl(round(e.taxa_valor / 2, 2)), _brl(e.taxa_valor))));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;


-- Permissões no padrão do sistema (funções com _ só para uso interno)
revoke execute on function _folha_fechada(uuid, date) from public, anon, authenticated;
revoke execute on function folha_fechar_obra(date, uuid) from public, anon;
grant execute on function folha_fechar_obra(date, uuid) to authenticated;
revoke execute on function pagamento_criar_obra(date, text, text, date, date, text, uuid) from public, anon;
grant execute on function pagamento_criar_obra(date, text, text, date, date, text, uuid) to authenticated;
