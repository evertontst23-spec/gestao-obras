-- Ponto em lote: enquanto o reconhecimento facial não roda, o RH lança o dia da equipe de uma vez.
-- • OK: grava as 4 marcações (entrada, saída p/ almoço, volta do almoço, largada) como lançamento manual justificado.
-- • Falta: não grava marcação — com o dia lançado na obra, o espelho já conta a falta (e desconta).
-- • Falta justificada: abona o dia (fica em atestados, tipo falta_justificada) — não desconta.
-- • Atestado: registra atestado médico a partir do dia (abona os dias informados).
alter table atestados drop constraint if exists atestados_tipo_check;
alter table atestados add constraint atestados_tipo_check
  check (tipo in ('medico','odontologico','acompanhamento','declaracao_horas','acidente_trabalho','falta_justificada'));

create or replace function ponto_lancar_lote(p_data date, p_itens jsonb, p_horarios jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; f record; v_sit text; k int; v_obs text; v_dias int;
        v_h text[] := array[p_horarios->>'entrada', p_horarios->>'saida_almoco', p_horarios->>'volta_almoco', p_horarios->>'largada'];
        v_t text[] := array['entrada','saida','entrada','saida'];
        n_ok int := 0; n_falta int := 0; n_just int := 0; n_atest int := 0; v_pulados jsonb := '[]';
        v_just constant text := 'Lançamento em lote pelo RH (ponto manual, sem reconhecimento facial)';
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas o RH lança o ponto em lote'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Escolha um dia que já aconteceu'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_itens, '[]')) e where e->>'situacao' = 'ok') then
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

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    v_sit := coalesce(it->>'situacao', 'nada');
    continue when v_sit = 'nada';
    if v_sit not in ('ok','falta','falta_justificada','atestado') then raise exception 'Situação inválida: %', v_sit; end if;
    select fu.id, fu.nome, fu.obra_id, fu.data_admissao, fu.data_demissao into f
      from funcionarios fu where fu.id = (it->>'funcionario_id')::uuid;
    if not found then raise exception 'Funcionário não encontrado'; end if;
    if p_data < f.data_admissao or (f.data_demissao is not null and p_data > f.data_demissao) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'fora do período de contrato'); continue;
    end if;
    if _folha_fechada(f.obra_id, date_trunc('month', p_data)::date) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'folha do mês já fechada'); continue;
    end if;
    v_obs := nullif(trim(coalesce(it->>'obs', '')), '');

    if v_sit in ('ok','falta') and exists (
         select 1 from registros_ponto r left join ponto_desconsideracoes pd on pd.registro_id = r.id
          where r.funcionario_id = f.id and r.data = p_data and pd.registro_id is null) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo',
        case when v_sit = 'ok' then 'já tinha marcação neste dia'
             else 'tem marcação neste dia — para virar falta, desconsidere as marcações no espelho' end);
      continue;
    end if;
    if v_sit in ('ok','falta_justificada','atestado') and exists (
         select 1 from atestados a where a.funcionario_id = f.id and a.tipo <> 'declaracao_horas'
            and p_data between a.data_inicio and a.data_inicio + greatest(a.dias - 1, 0)) then
      v_pulados := v_pulados || jsonb_build_object('nome', f.nome, 'motivo', 'já tem atestado ou falta justificada neste dia');
      continue;
    end if;

    if v_sit = 'ok' then
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
  return jsonb_build_object('ok', n_ok, 'falta', n_falta, 'falta_justificada', n_just, 'atestado', n_atest, 'pulados', v_pulados);
end $$;

grant execute on function ponto_lancar_lote(date, jsonb, jsonb) to authenticated;
