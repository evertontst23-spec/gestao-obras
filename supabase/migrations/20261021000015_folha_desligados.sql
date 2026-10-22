-- =====================================================================
-- 0015 — Folha sem os desligados já acertados
--  Quem foi desligado e já teve o acerto (rescisão) lançado em um pagamento fechado ou pago
--  não aparece mais na folha nem em horas extras e faltas.
-- =====================================================================
create or replace function folha_previa(p_mes date, p_obra uuid default null)
returns table (funcionario_id uuid, matricula text, nome text, funcao text, obra_id uuid, obra_codigo text,
               empregador text, vinculo text, fechamento_externo boolean,
               salario_base numeric, insalubridade numeric, periculosidade numeric, valor_hora numeric,
               he_util_h numeric, he_util_valor numeric, he_100_h numeric, he_100_valor numeric, dsr_he numeric,
               faltas int, desconto_faltas numeric, atraso_h numeric, desconto_atrasos numeric,
               dias_trabalhados int, vale_alimentacao numeric, vale_transporte numeric, desconto_vt numeric,
               bruto numeric, inss numeric, liquido_estimado numeric, incompletos int)
language plpgsql stable security definer set search_path = public as $$
declare par dp_parametros; r record; rp record; v_ini date := date_trunc('month', p_mes)::date; v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
        v_vt_dia numeric;
begin
  if not tem_papel('admin','rh','financeiro') and not (tem_papel('engenheiro') and p_obra is not null and gere_obra(p_obra)) then
    raise exception 'Sem permissão para ver a folha';
  end if;
  select * into par from dp_parametros where id = 1;
  for r in select f.*, fn.nome as fnome,
                  round(coalesce(f.salario, fn.salario_base, 0) * (1 + f.adicional_pct / 100), 2) as sal,
                  fn.adicional_insalubridade_pct as ins_pct, fn.adicional_periculosidade as peric,
                  coalesce(f.alimentacao_dia, fn.vale_alimentacao_dia) as va, fn.vale_transporte_dia as vt_funcao,
                  o.codigo as ocod, e.nome as enome, e.fechamento_externo as fext
             from funcionarios f left join funcoes fn on fn.id = f.funcao_id left join obras o on o.id = f.obra_id
             left join empregadores e on e.id = f.empregador_id
            where f.data_admissao <= v_fim and (f.data_demissao is null or f.data_demissao >= v_ini)
      -- desligado já acertado (rescisão em pagamento fechado ou pago) não volta para a folha
      and not (f.data_demissao is not null and exists (select 1 from pagamento_itens pi join pagamentos pg on pg.id = pi.pagamento_id
                where pi.funcionario_id = f.id and pi.categoria = 'rescisao' and not pi.removido and pg.status in ('fechado','pago')))
              and (p_obra is null or f.obra_id = p_obra)
            order by e.nome nulls first, f.nome loop
    select * into rp from resumo_ponto(r.id, p_mes);
    funcionario_id := r.id; matricula := r.matricula; nome := r.nome; funcao := r.fnome; obra_id := r.obra_id; obra_codigo := r.ocod;
    empregador := r.enome; vinculo := r.vinculo; fechamento_externo := coalesce(r.fext, false);
    salario_base := r.sal;
    insalubridade := round(par.salario_minimo * coalesce(r.ins_pct,0) / 100, 2);
    periculosidade := case when r.peric then round(r.sal * 0.30, 2) else 0 end;
    valor_hora := round((r.sal + insalubridade + periculosidade) / par.divisor_horas_mes, 4);
    he_util_h := round(rp.he_util_min / 60.0, 2); he_100_h := round(rp.he_100_min / 60.0, 2);
    he_util_valor := round(he_util_h * valor_hora * (1 + par.percentual_he_util / 100), 2);
    he_100_valor := round(he_100_h * valor_hora * (1 + par.percentual_he_domingo / 100), 2);
    dsr_he := case when rp.dias_uteis > 0 then round((he_util_valor + he_100_valor) / rp.dias_uteis * rp.domingos_feriados, 2) else 0 end;
    faltas := rp.faltas; desconto_faltas := round(r.sal / 30 * rp.faltas, 2);
    atraso_h := round(rp.atraso_min / 60.0, 2); desconto_atrasos := round(atraso_h * valor_hora, 2);
    dias_trabalhados := rp.dias_trabalhados;
    vale_alimentacao := round(coalesce(r.va,0) * rp.dias_trabalhados, 2);
    v_vt_dia := coalesce(r.passagens_dia * coalesce(r.valor_passagem, par.valor_passagem), r.passagem_semanal / 5, r.vt_funcao, 0);
    vale_transporte := round(v_vt_dia * rp.dias_trabalhados, 2);
    desconto_vt := case when coalesce(r.vinculo, 'clt') = 'clt' then least(vale_transporte, round(r.sal * par.desconto_vt_pct / 100, 2)) else 0 end;
    bruto := r.sal + insalubridade + periculosidade + he_util_valor + he_100_valor + dsr_he - desconto_faltas - desconto_atrasos;
    inss := _inss(bruto);
    liquido_estimado := bruto - inss - desconto_vt;
    incompletos := rp.incompletos;
    return next;
  end loop;
end $$;
