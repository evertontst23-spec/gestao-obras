-- Segurar: move o funcionário e, se a empresa dele ficar sem ninguém no principal, leva as taxas (linhas de empresa) junto.
CREATE OR REPLACE FUNCTION pagamento_segurar(p_pagamento uuid, p_funcionario uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare pg pagamentos; sib uuid; movidas int; emps uuid[];
begin
  pg := _pg_rascunho(p_pagamento);
  if pg.separado_de is not null then raise exception 'Este já é o pagamento dos segurados'; end if;
  if p_funcionario is null then raise exception 'Informe o funcionário a segurar'; end if;

  select id into sib from pagamentos where separado_de = p_pagamento and status = 'rascunho' limit 1;
  if sib is null then
    insert into pagamentos (data_pagamento, titulo, tipo, periodo_inicio, periodo_fim, status, obra_id, separado_de, criado_por, observacoes)
    values (pg.data_pagamento, pg.titulo || ' — segurados (pagar depois)', pg.tipo, pg.periodo_inicio, pg.periodo_fim,
            'rascunho', pg.obra_id, p_pagamento, auth.uid(),
            'Funcionários segurados do pagamento "' || pg.titulo || '" para pagar depois.')
    returning id into sib;
  end if;

  -- empregadores do funcionário (para levar as taxas junto, se ele for o último)
  select array_agg(distinct empregador_id) into emps
    from pagamento_itens
   where pagamento_id = p_pagamento and funcionario_id = p_funcionario and not removido and empregador_id is not null;

  update pagamento_itens set pagamento_id = sib
   where pagamento_id = p_pagamento and funcionario_id = p_funcionario and not removido;
  get diagnostics movidas = row_count;
  if movidas = 0 then raise exception 'Esse funcionário não tem linhas neste pagamento'; end if;

  -- taxas (linhas de empresa, sem funcionário) das empresas que ficaram sem ninguém no principal
  if emps is not null then
    update pagamento_itens i set pagamento_id = sib
     where i.pagamento_id = p_pagamento and i.funcionario_id is null and i.destino = 'empresa' and not i.removido
       and i.empregador_id = any(emps)
       and not exists (select 1 from pagamento_itens j
                        where j.pagamento_id = p_pagamento and j.empregador_id = i.empregador_id
                          and j.funcionario_id is not null and not j.removido);
  end if;
  return sib;
end $$;

-- Devolver: traz o funcionário de volta e, se a empresa dele ficar sem ninguém nos segurados, traz as taxas junto.
CREATE OR REPLACE FUNCTION pagamento_devolver(p_pagamento uuid, p_funcionario uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare pg pagamentos; alvo uuid; emps uuid[];
begin
  pg := _pg_rascunho(p_pagamento);
  if pg.separado_de is null then raise exception 'Este não é um pagamento de segurados'; end if;
  alvo := pg.separado_de;
  if not exists (select 1 from pagamentos where id = alvo and status = 'rascunho') then
    raise exception 'O pagamento principal já foi fechado — reabra-o antes de devolver o funcionário';
  end if;

  select array_agg(distinct empregador_id) into emps
    from pagamento_itens
   where pagamento_id = p_pagamento and funcionario_id = p_funcionario and not removido and empregador_id is not null;

  update pagamento_itens set pagamento_id = alvo
   where pagamento_id = p_pagamento and funcionario_id = p_funcionario and not removido;

  -- traz as taxas das empresas que ficaram sem ninguém nos segurados
  if emps is not null then
    update pagamento_itens i set pagamento_id = alvo
     where i.pagamento_id = p_pagamento and i.funcionario_id is null and i.destino = 'empresa' and not i.removido
       and i.empregador_id = any(emps)
       and not exists (select 1 from pagamento_itens j
                        where j.pagamento_id = p_pagamento and j.empregador_id = i.empregador_id
                          and j.funcionario_id is not null and not j.removido);
  end if;

  -- se o irmão ficou sem ninguém, cancela
  if not exists (select 1 from pagamento_itens where pagamento_id = p_pagamento and not removido) then
    update pagamentos set status = 'cancelado', motivo_cancelamento = 'Todos os segurados foram devolvidos ao pagamento principal' where id = p_pagamento;
  end if;
  return alvo;
end $$;
