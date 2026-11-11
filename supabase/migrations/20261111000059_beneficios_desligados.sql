-- "Dias para todos" não mexe em quem já foi desligado: o valor zerado do desligado continua zerado.
create or replace function beneficio_aplicar_dias(p_comp uuid, p_obra uuid, p_tipo text, p_dias numeric) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _benef_editavel(p_comp);
  if p_dias is null or p_dias < 0 or p_dias > 31 then raise exception 'Informe os dias (0 a 31)'; end if;
  if p_tipo is not null and p_tipo not in ('alimentacao','passagem') then raise exception 'Benefício inválido'; end if;
  update beneficio_linhas l set dias = p_dias, atualizado_por = auth.uid(), atualizado_em = now()
   where l.competencia_id = p_comp and (p_obra is null or l.obra_id = p_obra) and (p_tipo is null or l.tipo = p_tipo)
     and exists (select 1 from funcionarios f where f.id = l.funcionario_id and f.ativo and f.data_demissao is null);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
