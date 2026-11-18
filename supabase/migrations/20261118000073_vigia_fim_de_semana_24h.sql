-- Vigia no fim de semana: sábado e domingo ele cobre os dois turnos (dia 06–18 e noite 18–06), 24h seguidas.
-- • Espelho: marcações no mesmo minuto (saída e entrada às 06:00/18:00) — a saída fecha primeiro.
-- • Vigia (12h): o plantão normal de 12h vale também em domingo e feriado; só o que passa dele é hora extra
--   (70% no sábado, 100% no domingo/feriado). Servente segue igual (domingo trabalhado = 100%).
-- • Ponto em lote: opção "Dia + noite (24h)" grava 06:00, 18:00, 18:00 e 06:00 do dia seguinte.

create or replace function _espelho_ponto(p_func uuid, p_inicio date, p_fim date)
returns table (data date, dia_semana int, feriado text, marcacoes jsonb, trabalhado_min int, previsto_min int,
               he_util_min int, he_100_min int, atraso_min int, falta boolean, abonado text, incompleto boolean)
language plpgsql stable security definer set search_path = public as $$
declare f record; par dp_parametros; d date; regs record; v_ent timestamptz; v_trab int; v_prev int; v_marc jsonb; v_inc boolean;
        v_fer text; v_ab text; v_dif int; v_horas_ab numeric; v_validas int; v_noite boolean; v_fim record; v_carga numeric;
begin
  select fu.*, coalesce(fn.carga_diaria_horas, 8) as carga, coalesce(em.ponto_externo, false) as externo into f
    from funcionarios fu left join funcoes fn on fn.id = fu.funcao_id left join empregadores em on em.id = fu.empregador_id where fu.id = p_func;
  if not found then return; end if;
  select * into par from dp_parametros where id = 1;
  d := p_inicio;
  while d <= p_fim loop
    if d >= f.data_admissao and (f.data_demissao is null or d <= f.data_demissao) and d <= hoje() then
      v_carga := coalesce(_carga_na_data(p_func, d), f.carga);
      v_trab := 0; v_ent := null; v_inc := false; v_marc := '[]'::jsonb; v_validas := 0;
      -- escala 12h: o plantão da noite anterior ainda estava aberto? (última marcação válida de ontem foi entrada)
      v_noite := coalesce(_carga_na_data(p_func, d - 1), f.carga) >= 12 and exists (
        select 1 from (select r0.tipo from registros_ponto r0 left join ponto_desconsideracoes p0 on p0.registro_id = r0.id
                        where r0.funcionario_id = p_func and r0.data = d - 1 and p0.registro_id is null
                        order by r0.momento desc, (r0.tipo = 'entrada') desc limit 1) u where u.tipo = 'entrada');
      for regs in select r.*, pd.motivo as desc_motivo from registros_ponto r left join ponto_desconsideracoes pd on pd.registro_id = r.id
                   where r.funcionario_id = p_func and r.data = d order by r.momento, (r.tipo = 'entrada') loop
        if v_noite and regs.desc_motivo is null and regs.tipo = 'saida' and v_validas = 0 and v_ent is null
           and (regs.momento at time zone 'America/Recife')::time < time '12:00' then
          v_marc := v_marc || jsonb_strip_nulls(jsonb_build_object('id', regs.id, 't', regs.tipo,
                      'h', to_char(regs.momento at time zone 'America/Recife', 'HH24:MI'), 'm', regs.metodo,
                      'j', regs.justificativa, 'x', 'fim do plantão de ' || to_char(d - 1, 'DD/MM')));
          v_noite := false;
          continue;
        end if;
        v_marc := v_marc || jsonb_strip_nulls(jsonb_build_object('id', regs.id, 't', regs.tipo,
                    'h', to_char(regs.momento at time zone 'America/Recife', 'HH24:MI'), 'm', regs.metodo,
                    'j', regs.justificativa, 'x', regs.desc_motivo));
        continue when regs.desc_motivo is not null;
        v_validas := v_validas + 1;
        if regs.tipo = 'entrada' then
          if v_ent is not null then v_inc := true; end if;
          v_ent := regs.momento;
        elsif v_ent is not null then
          v_trab := v_trab + floor(extract(epoch from regs.momento - v_ent) / 60)::int; v_ent := null;
        else v_inc := true; end if;
      end loop;
      -- escala 12h: plantão que vira a noite fecha com a saída da manhã seguinte
      if v_ent is not null and v_carga >= 12 then
        select r.id, r.momento, r.tipo, r.metodo, r.justificativa into v_fim
          from registros_ponto r left join ponto_desconsideracoes pd on pd.registro_id = r.id
         where r.funcionario_id = p_func and r.data = d + 1 and pd.registro_id is null order by r.momento, (r.tipo = 'entrada') limit 1;
        if found and v_fim.tipo = 'saida' and (v_fim.momento at time zone 'America/Recife')::time < time '12:00' then
          v_trab := v_trab + floor(extract(epoch from v_fim.momento - v_ent) / 60)::int; v_ent := null;
          v_marc := v_marc || jsonb_strip_nulls(jsonb_build_object('id', v_fim.id, 't', 'saida',
                      'h', to_char(v_fim.momento at time zone 'America/Recife', 'HH24:MI') || ' (+1)', 'm', v_fim.metodo, 'j', v_fim.justificativa));
        end if;
      end if;
      if v_ent is not null and d < hoje() - (case when v_carga >= 12 then 1 else 0 end) then v_inc := true; end if;
      select descricao into v_fer from feriados fe where fe.data = d and fe.ambito <> 'facultativo';
      -- vigia (12h): o plantão normal vale todo dia em que ele trabalha, inclusive domingo e feriado
      v_prev := case when v_carga >= 12 then case when v_validas > 0 then round(v_carga * 60) else 0 end
                     when v_fer is not null or extract(isodow from d) = 7 then 0
                     when extract(isodow from d) = 6 then round(par.jornada_sabado_horas * 60)
                     when par.compensa_sabado and extract(isodow from d) between 1 and 4 then round((v_carga + 1) * 60)
                     else round(v_carga * 60) end;
      select string_agg(a.tipo || coalesce(' ' || a.horas || 'h', ''), ', '), sum(case when a.tipo = 'declaracao_horas' then a.horas end)
        into v_ab, v_horas_ab
        from atestados a where a.funcionario_id = p_func and d between a.data_inicio and a.data_inicio + greatest(a.dias - 1, 0);
      data := d; dia_semana := extract(isodow from d); feriado := v_fer; marcacoes := v_marc; trabalhado_min := v_trab;
      previsto_min := v_prev; incompleto := v_inc; abonado := v_ab;
      he_util_min := 0; he_100_min := 0; atraso_min := 0; falta := false;
      if v_inc or d = hoje() or (v_carga >= 12 and v_ent is not null) or f.externo or par.ponto_inicio is null or d < par.ponto_inicio then
        null;   -- marcação incompleta, dia de hoje ou plantão ainda em andamento: não calcula HE/atraso/falta
      elsif v_fer is not null or extract(isodow from d) = 7 then
        -- domingo/feriado: hora extra 100%; para o vigia, só o que passa do plantão normal (ex.: 2º turno no fim de semana)
        he_100_min := case when v_carga < 12 then v_trab
                           when v_trab - v_prev > par.tolerancia_minutos then v_trab - v_prev else 0 end;
      else
        v_dif := v_trab - v_prev;
        if v_dif > par.tolerancia_minutos then he_util_min := v_dif; end if;
        -- falta só quando o ponto daquele dia já foi lançado na obra
        -- (a saída da manhã do vigia fecha o plantão da noite anterior: não conta como dia lançado)
        if v_validas = 0 and par.falta_so_dia_lancado
           and not exists (select 1 from registros_ponto r2 left join funcionarios f2 on f2.id = r2.funcionario_id
                             left join funcoes fn2 on fn2.id = f2.funcao_id
                            where r2.data = d and coalesce(r2.obra_id, f2.obra_id) is not distinct from f.obra_id
                              and not (coalesce(fn2.carga_diaria_horas, 8) >= 12 and r2.tipo = 'saida'
                                       and (r2.momento at time zone 'America/Recife')::time < time '12:00')) then
          he_util_min := 0;
        elsif v_prev > 0 and v_trab = 0 and v_validas = 0 and v_ab is null then
          falta := true;
        elsif v_dif < -par.tolerancia_minutos and v_prev > 0 then
          atraso_min := greatest(0, -v_dif - coalesce(round(v_horas_ab * 60), 0)::int);
          if v_ab is not null and coalesce(v_horas_ab, 0) = 0 then atraso_min := 0; end if;
        end if;
      end if;
      return next;
    end if;
    d := d + 1;
  end loop;
end $$;

create or replace function ponto_lancar_lote(p_data date, p_itens jsonb, p_horarios jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; f record; v_sit text; k int; v_obs text; v_dias int; v_noturno boolean;
        v_h text[] := array[p_horarios->>'entrada', p_horarios->>'saida_almoco', p_horarios->>'volta_almoco', p_horarios->>'largada'];
        v_t text[] := array['entrada','saida','entrada','saida'];
        v_ne text := coalesce(nullif(p_horarios->>'noturno_entrada', ''), '18:00');
        v_ns text := coalesce(nullif(p_horarios->>'noturno_saida', ''), '06:00');
        v_ok_dia boolean := false; v_ok_noite boolean := false; n_24 int := 0;
        n_ok int := 0; n_falta int := 0; n_just int := 0; n_atest int := 0; v_pulados jsonb := '[]';
        v_just constant text := 'Lançamento em lote pelo RH (ponto manual, sem reconhecimento facial)';
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas o RH lança o ponto em lote'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Escolha um dia que já aconteceu'; end if;
  select bool_or(not _vigia_noturno((e->>'funcionario_id')::uuid, p_data)), bool_or(_vigia_noturno((e->>'funcionario_id')::uuid, p_data))
    into v_ok_dia, v_ok_noite
    from jsonb_array_elements(coalesce(p_itens, '[]')) e where e->>'situacao' = 'ok';
  if coalesce(v_ok_dia, false) then
    for k in 1..4 loop
      if coalesce(v_h[k], '') !~ '^\d{2}:\d{2}$' then
        raise exception 'Informe os 4 horários: entrada, saída para o almoço, volta do almoço e largada';
      end if;
    end loop;
    if not (v_h[1]::time < v_h[2]::time and v_h[2]::time < v_h[3]::time and v_h[3]::time < v_h[4]::time) then
      raise exception 'Os horários precisam estar em ordem: entrada, saída para o almoço, volta do almoço e largada';
    end if;
    if ((p_data + v_h[4]::time) at time zone 'America/Recife') > now() + interval '5 minutes' then
      raise exception 'A largada das % de % ainda não aconteceu — lance este dia depois do fim do expediente', v_h[4], to_char(p_data, 'DD/MM');
    end if;
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_itens, '[]')) e where e->>'situacao' = 'ok24') then
    if v_ne !~ '^\d{2}:\d{2}$' or v_ns !~ '^\d{2}:\d{2}$' or v_ns::time >= v_ne::time then
      raise exception 'Para o plantão de 24h, informe o horário do vigia noturno (ex.: 18:00 às 06:00)';
    end if;
    if ((p_data + 1 + v_ns::time) at time zone 'America/Recife') > now() + interval '5 minutes' then
      raise exception 'O plantão de 24h de % só termina às % do dia seguinte — lance depois desse horário', to_char(p_data, 'DD/MM'), v_ns;
    end if;
  end if;
  if coalesce(v_ok_noite, false) then
    if v_ne !~ '^\d{2}:\d{2}$' or v_ns !~ '^\d{2}:\d{2}$' then raise exception 'Informe o horário do plantão do vigia noturno'; end if;
    if ((p_data + case when v_ns::time <= v_ne::time then 1 else 0 end + v_ns::time) at time zone 'America/Recife') > now() + interval '5 minutes' then
      raise exception 'O plantão noturno de % só termina às % do dia seguinte — lance depois desse horário', to_char(p_data, 'DD/MM'), v_ns;
    end if;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    v_sit := coalesce(it->>'situacao', 'nada');
    continue when v_sit = 'nada';
    if v_sit not in ('ok','ok24','falta','falta_justificada','atestado') then raise exception 'Situação inválida: %', v_sit; end if;
    select fu.id, fu.nome, fu.obra_id, fu.data_admissao, fu.data_demissao into f
      from funcionarios fu where fu.id = (it->>'funcionario_id')::uuid;
    if not found then raise exception 'Funcionário não encontrado'; end if;
    v_noturno := _vigia_noturno(f.id, p_data);
    if p_data < f.data_admissao or (f.data_demissao is not null and p_data > f.data_demissao) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'fora do período de contrato'); continue;
    end if;
    if _folha_fechada(f.obra_id, date_trunc('month', p_data)::date) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'folha do mês já fechada'); continue;
    end if;
    v_obs := nullif(trim(coalesce(it->>'obs', '')), '');

    -- já tem marcação no dia? (para o vigia noturno, a saída da manhã é do plantão anterior: só a entrada conta)
    if v_sit = 'ok24' and coalesce(_carga_na_data(f.id, p_data), 8) < 12 then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'plantão de 24h é só para vigia'); continue;
    end if;
    if v_sit in ('ok','ok24','falta') and exists (
         select 1 from registros_ponto r left join ponto_desconsideracoes pd on pd.registro_id = r.id
          where r.funcionario_id = f.id and r.data = p_data and pd.registro_id is null
            and (not (v_noturno or v_sit = 'ok24') or r.tipo = 'entrada')) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo',
        case when v_sit in ('ok','ok24') then 'já tinha marcação neste dia'
             else 'tem marcação neste dia — para virar falta, desconsidere as marcações no espelho' end);
      continue;
    end if;
    if v_sit in ('ok','ok24','falta_justificada','atestado') and exists (
         select 1 from atestados a where a.funcionario_id = f.id and a.tipo <> 'declaracao_horas'
            and p_data between a.data_inicio and a.data_inicio + greatest(a.dias - 1, 0)) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'já tem atestado ou falta justificada neste dia');
      continue;
    end if;

    if v_sit = 'ok24' then   -- turno do dia + turno da noite
      perform _ponto_inserir(f.id, f.obra_id, (p_data + v_ns::time) at time zone 'America/Recife', 'entrada', 'manual', null, null, null, null, v_just);
      perform _ponto_inserir(f.id, f.obra_id, (p_data + v_ne::time) at time zone 'America/Recife', 'saida', 'manual', null, null, null, null, v_just);
      perform _ponto_inserir(f.id, f.obra_id, (p_data + v_ne::time) at time zone 'America/Recife', 'entrada', 'manual', null, null, null, null, v_just);
      perform _ponto_inserir(f.id, f.obra_id, (p_data + 1 + v_ns::time) at time zone 'America/Recife', 'saida', 'manual', null, null, null, null, v_just);
      n_ok := n_ok + 1; n_24 := n_24 + 1;
    elsif v_sit = 'ok' and v_noturno then
      perform _ponto_inserir(f.id, f.obra_id, (p_data + v_ne::time) at time zone 'America/Recife', 'entrada', 'manual',
                             null, null, null, null, v_just);
      perform _ponto_inserir(f.id, f.obra_id, (p_data + case when v_ns::time <= v_ne::time then 1 else 0 end + v_ns::time) at time zone 'America/Recife',
                             'saida', 'manual', null, null, null, null, v_just);
      n_ok := n_ok + 1;
    elsif v_sit = 'ok' then
      for k in 1..4 loop
        perform _ponto_inserir(f.id, f.obra_id, (p_data + v_h[k]::time) at time zone 'America/Recife', v_t[k], 'manual',
                               null, null, null, null, v_just);
      end loop;
      n_ok := n_ok + 1;
    elsif v_sit = 'falta' then
      n_falta := n_falta + 1;
    else
      if v_sit = 'falta_justificada' and coalesce(length(v_obs), 0) < 3 then
        raise exception 'Escreva o motivo da falta justificada de %', f.nome;
      end if;
      v_dias := case when v_sit = 'atestado' then greatest(1, least(coalesce(nullif(it->>'dias', '')::int, 1), 365)) else 1 end;
      insert into atestados (funcionario_id, tipo, data_inicio, dias, observacoes, registrado_por)
      values (f.id, case when v_sit = 'atestado' then 'medico' else 'falta_justificada' end, p_data, v_dias,
              coalesce(v_obs, 'Lançado no ponto em lote'), auth.uid());
      if v_sit = 'atestado' then n_atest := n_atest + 1; else n_just := n_just + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', n_ok, 'plantao_24h', n_24, 'falta', n_falta, 'falta_justificada', n_just, 'atestado', n_atest, 'pulados', v_pulados);
end $$;
