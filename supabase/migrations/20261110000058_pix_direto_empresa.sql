-- Pix pela empresa ou direto ao funcionário.
-- empregadores.beneficios_via_empresa passa a valer também para salário/adiantamento:
-- desmarcado, a CAD paga direto no Pix de cada funcionário daquela empresa (ex.: A2 e Mundial, nov/2026).

alter table empregadores alter column beneficios_via_empresa set default true;

create or replace function pagamento_item_salvar(p_pagamento uuid, p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_func funcionarios; v_cat text := p->>'categoria'; v_dest text := p->>'destino';
begin
  perform _pg_rascunho(p_pagamento);
  if nullif(p->>'funcionario_id', '') is not null then
    select * into v_func from funcionarios where id = (p->>'funcionario_id')::uuid;
    if not found then raise exception 'Funcionário não encontrado'; end if;
  end if;
  if v_dest is null then
    v_dest := case when v_cat in ('passagem','alimentacao') then 'funcionario'
                   when (select tipo in ('fornecedora_mao_obra','parceira') and beneficios_via_empresa from empregadores
                         where id = coalesce(nullif(p->>'empregador_id','')::uuid, v_func.empregador_id)) then 'empresa'
                   else 'funcionario' end;
  end if;
  insert into pagamento_itens (pagamento_id, funcionario_id, empregador_id, obra_id, categoria, destino, descricao, valor, criado_por)
  values (p_pagamento, v_func.id, coalesce(nullif(p->>'empregador_id','')::uuid, v_func.empregador_id),
          coalesce(nullif(p->>'obra_id','')::uuid, v_func.obra_id), v_cat, v_dest,
          coalesce(nullif(trim(p->>'descricao'), ''), initcap(replace(v_cat, '_', ' '))),
          round((p->>'valor')::numeric, 2), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
