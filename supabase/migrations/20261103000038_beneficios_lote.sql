-- =====================================================================
-- 0038 — Benefícios: dias para todos de uma vez e dias a mais identificados (retroativo ou crédito)
-- =====================================================================
alter table beneficio_linhas add column adicional_tipo text not null default 'retroativo' check (adicional_tipo in ('retroativo','credito'));

create or replace function beneficio_linha_salvar(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_comp uuid := (p->>'competencia_id')::uuid; v_func uuid := (p->>'funcionario_id')::uuid; v_id bigint; f funcionarios;
begin
  perform _benef_editavel(v_comp);
  select * into f from funcionarios where id = v_func;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if coalesce(p->>'tipo', '') not in ('alimentacao','passagem') then raise exception 'Escolha alimentação ou passagem'; end if;
  if nullif(p->>'valor_unitario', '') is null then raise exception 'Informe o valor'; end if;
  insert into beneficio_linhas (competencia_id, obra_id, funcionario_id, tipo, dias, dias_retroativos, adicional_tipo, dias_desconto, qtd_dia, valor_unitario, observacao, atualizado_por)
  values (v_comp, coalesce(nullif(p->>'obra_id','')::uuid, f.obra_id), v_func, p->>'tipo',
          coalesce(nullif(p->>'dias','')::numeric, 0), coalesce(nullif(p->>'dias_retroativos','')::numeric, 0),
          coalesce(nullif(p->>'adicional_tipo',''), 'retroativo'),
          coalesce(nullif(p->>'dias_desconto','')::numeric, 0), coalesce(nullif(p->>'qtd_dia','')::numeric, 1),
          (p->>'valor_unitario')::numeric, nullif(trim(p->>'observacao'), ''), auth.uid())
  on conflict (competencia_id, funcionario_id, tipo) do update set
    obra_id = excluded.obra_id, dias = excluded.dias, dias_retroativos = excluded.dias_retroativos, adicional_tipo = excluded.adicional_tipo,
    dias_desconto = excluded.dias_desconto, qtd_dia = excluded.qtd_dia, valor_unitario = excluded.valor_unitario, observacao = excluded.observacao,
    atualizado_por = auth.uid(), atualizado_em = now()
  returning id into v_id;
  return v_id;
end $$;

-- Mesma quantidade de dias para todos (de uma obra ou de todas; alimentação, passagem ou os dois)
create or replace function beneficio_aplicar_dias(p_comp uuid, p_obra uuid, p_tipo text, p_dias numeric) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _benef_editavel(p_comp);
  if p_dias is null or p_dias < 0 or p_dias > 31 then raise exception 'Informe os dias (0 a 31)'; end if;
  if p_tipo is not null and p_tipo not in ('alimentacao','passagem') then raise exception 'Benefício inválido'; end if;
  update beneficio_linhas set dias = p_dias, atualizado_por = auth.uid(), atualizado_em = now()
   where competencia_id = p_comp and (p_obra is null or obra_id = p_obra) and (p_tipo is null or tipo = p_tipo);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function beneficio_aplicar_dias(uuid, uuid, text, numeric) from public, anon;
grant execute on function beneficio_aplicar_dias(uuid, uuid, text, numeric) to authenticated;
