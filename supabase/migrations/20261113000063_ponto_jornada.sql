-- Ponto: faltas e horas extras passam a contar a partir de 03/11/2026.
-- • Jornada da obra: seg a qui = carga + 1h (9h), sexta = carga (8h) — 44h semanais compensando o sábado.
-- • Escala 12h (vigias 12x36): só há previsão no dia em que há marcação (folga não é falta).
-- • Dia que ainda não foi lançado na obra (ninguém da obra tem marcação) não vira falta.
alter table dp_parametros add column if not exists compensa_sabado boolean not null default true;
alter table dp_parametros add column if not exists falta_so_dia_lancado boolean not null default true;
update dp_parametros set ponto_inicio = '2026-11-03' where id = 1 and ponto_inicio is null;

create or replace function _espelho_ponto(p_func uuid, p_inicio date, p_fim date)
returns table (data date, dia_semana int, feriado text, marcacoes jsonb, trabalhado_min int, previsto_min int,
               he_util_min int, he_100_min int, atraso_min int, falta boolean, abonado text, incompleto boolean)
language plpgsql stable security definer set search_path = public as $$
declare f record; par dp_parametros; d date; regs record; v_ent timestamptz; v_trab int; v_prev int; v_marc jsonb; v_inc boolean;
        v_fer text; v_ab text; v_dif int; v_horas_ab numeric; v_validas int;
begin
  select fu.*, coalesce(fn.carga_diaria_horas, 8) as carga, coalesce(em.ponto_externo, false) as externo into f
    from funcionarios fu left join funcoes fn on fn.id = fu.funcao_id left join empregadores em on em.id = fu.empregador_id where fu.id = p_func;
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
                     when f.carga >= 12 then case when v_validas > 0 then round(f.carga * 60) else 0 end  -- escala 12x36: só conta o dia trabalhado
                     when extract(isodow from d) = 6 then round(par.jornada_sabado_horas * 60)
                     when par.compensa_sabado and extract(isodow from d) between 1 and 4 then round((f.carga + 1) * 60)
                     else round(f.carga * 60) end;
      select string_agg(a.tipo || coalesce(' ' || a.horas || 'h', ''), ', '), sum(case when a.tipo = 'declaracao_horas' then a.horas end)
        into v_ab, v_horas_ab
        from atestados a where a.funcionario_id = p_func and d between a.data_inicio and a.data_inicio + greatest(a.dias - 1, 0);
      data := d; dia_semana := extract(isodow from d); feriado := v_fer; marcacoes := v_marc; trabalhado_min := v_trab;
      previsto_min := v_prev; incompleto := v_inc; abonado := v_ab;
      he_util_min := 0; he_100_min := 0; atraso_min := 0; falta := false;
      if v_inc or d = hoje() or f.externo or par.ponto_inicio is null or d < par.ponto_inicio then  -- ponto fora do sistema ou antes do início: sem falta/atraso
        null;   -- marcação incompleta (ou o dia de hoje, ainda aberto): não calcula HE/atraso/falta
      elsif v_fer is not null or extract(isodow from d) = 7 then
        he_100_min := v_trab;
      else
        v_dif := v_trab - v_prev;
        if v_dif > par.tolerancia_minutos then he_util_min := v_dif; end if;
        -- falta só quando o ponto daquele dia já foi lançado na obra (dia ainda não digitado não vira falta)
        if v_validas = 0 and par.falta_so_dia_lancado
           and not exists (select 1 from registros_ponto r2 left join funcionarios f2 on f2.id = r2.funcionario_id
                            where r2.data = d and coalesce(r2.obra_id, f2.obra_id) is not distinct from f.obra_id) then
          he_util_min := 0;   -- dia ainda não lançado na obra: nem falta nem atraso
        elsif v_prev > 0 and v_trab = 0 and v_validas = 0 and v_ab is null then
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
