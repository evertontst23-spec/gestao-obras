-- 13º salário no módulo de Pagamentos: tipo 'decimo_terceiro' gera a 1ª parcela de cada funcionário ativo
-- (salário com adicionais ÷ 12 × meses do ano com 15+ dias trabalhados até o fim do período ÷ 2).
-- A taxa percentual das fornecedoras de mão de obra (IDERES) incide também sobre o 13º; a taxa fixa por funcionário (Fênix) não.

alter table pagamentos drop constraint if exists pagamentos_tipo_check;
alter table pagamentos add constraint pagamentos_tipo_check check (tipo in ('adiantamento','saldo','rescisao','decimo_terceiro','outro'));
alter table pagamento_itens drop constraint if exists pagamento_itens_categoria_check;
alter table pagamento_itens add constraint pagamento_itens_categoria_check check (categoria in ('adiantamento','saldo','quinzena','rescisao','salario','hora_extra',
  'desconto','taxa','passagem','alimentacao','decimo_terceiro','outro'));

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
    -- 1b) 13º salário — 1ª parcela: metade do proporcional (salário ÷ 12 × meses do ano com 15+ dias até o fim do período)
    if pg.tipo = 'decimo_terceiro' and (r.data_demissao is null or r.data_demissao > coalesce(pg.periodo_fim, pg.data_pagamento)) then
      v_qtd := (select count(*)::int from generate_series(date_trunc('year', coalesce(pg.periodo_fim, pg.data_pagamento))::date,
                       date_trunc('month', coalesce(pg.periodo_fim, pg.data_pagamento))::date, interval '1 month') m(ini)
                 where (least((m.ini + interval '1 month - 1 day')::date, coalesce(pg.periodo_fim, pg.data_pagamento))
                        - greatest(m.ini::date, r.data_admissao) + 1) >= 15);
      if v_sal is null then
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'decimo_terceiro', 'valor', 0,
          'descricao', format('13º — 1ª parcela: %s/12 avos — informar o salário (sem salário cadastrado)', v_qtd)));
        n := n + 1;
      elsif v_qtd > 0 then
        v_val := round(v_sal / 12 * v_qtd / 2, 2);
        perform pagamento_item_salvar(p_pagamento, jsonb_build_object('funcionario_id', r.id, 'categoria', 'decimo_terceiro', 'valor', v_val,
          'descricao', format('13º — 1ª parcela: %s ÷ 12 × %s avos (admissão %s) ÷ 2', _brl(v_sal), v_qtd, to_char(r.data_admissao, 'DD/MM/YYYY'))));
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
                  sum(i.valor) filter (where i.categoria in ('adiantamento','saldo','rescisao','salario','hora_extra','desconto','decimo_terceiro')) as folha,
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
