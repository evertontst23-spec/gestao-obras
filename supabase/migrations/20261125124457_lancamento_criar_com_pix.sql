-- lancamento_criar passa a gravar a chave Pix informada no formulário
create or replace function lancamento_criar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tipo text := p->>'tipo'; v_id uuid;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro lançam contas'; end if;
  if nullif(p->>'vencimento','') is null then raise exception 'Informe o vencimento'; end if;
  if coalesce(nullif(p->>'valor','')::numeric, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  insert into lancamentos (obra_id, tipo, categoria, descricao, fornecedor_id, favorecido, valor, competencia, vencimento,
    documento_numero, caminho, pix, origem, criado_por, restrito)
  values (nullif(p->>'obra_id','')::uuid, v_tipo, p->>'categoria', trim(p->>'descricao'), nullif(p->>'fornecedor_id','')::uuid,
    nullif(trim(p->>'favorecido'),''), (p->>'valor')::numeric, coalesce(nullif(p->>'competencia','')::date, hoje()),
    (p->>'vencimento')::date, nullif(p->>'documento_numero',''), nullif(p->>'caminho',''), nullif(trim(p->>'pix'),''), 'manual', auth.uid(),
    coalesce((p->>'restrito')::boolean, false) and ve_restrito())
  returning id into v_id;
  if (p->>'liquidado')::boolean then
    perform lancamento_liquidar(v_id, coalesce(nullif(p->>'liquidado_em','')::date, hoje()), null, nullif(p->>'forma_pagamento',''), null);
  end if;
  return v_id;
end $$;
