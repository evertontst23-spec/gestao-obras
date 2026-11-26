-- Lançamento consolidado (aba Flash): grava dias e faltas das duas linhas (alimentação e passagem) do funcionário de uma vez.
create or replace function beneficio_dias_funcionario(p_comp uuid, p_func uuid, p_dias numeric, p_desconto numeric)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _benef_editavel(p_comp);
  if p_dias is null or p_dias < 0 or p_dias > 31 then raise exception 'Informe os dias (0 a 31)'; end if;
  if p_desconto is null or p_desconto < 0 or p_desconto > 31 then raise exception 'Faltas inválidas (0 a 31)'; end if;
  update beneficio_linhas set dias = p_dias, dias_desconto = p_desconto, atualizado_por = auth.uid(), atualizado_em = now()
   where competencia_id = p_comp and funcionario_id = p_func;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function beneficio_dias_funcionario(uuid, uuid, numeric, numeric) from public, anon;
grant execute on function beneficio_dias_funcionario(uuid, uuid, numeric, numeric) to authenticated;
