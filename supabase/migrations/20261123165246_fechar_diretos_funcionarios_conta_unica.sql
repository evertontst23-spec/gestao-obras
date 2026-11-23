-- Fechamento: empresas continuam uma conta por empresa/obra (um Pix por empresa em cada obra);
-- pagamentos diretos aos funcionários e passagens/alimentação viram UMA conta cada (sem quebrar por obra),
-- porque o valor é recebido para pagar todos juntos.
CREATE OR REPLACE FUNCTION public.pagamento_fechar(p_pagamento uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare pg pagamentos; r record; v numeric;
begin
  pg := _pg_rascunho(p_pagamento);
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria fecham o pagamento'; end if;
  if not exists (select 1 from pagamento_itens where pagamento_id = p_pagamento and not removido and valor <> 0) then
    raise exception 'O pagamento não tem valores';
  end if;

  -- empresas (IDERES, FÊNIX, Mundial, A2): uma conta por empresa e por obra
  for r in select i.obra_id, i.empregador_id as emp, max(em.nome) as enome, sum(i.valor) as total
             from pagamento_itens i join empregadores em on em.id = i.empregador_id
            where i.pagamento_id = p_pagamento and not i.removido and i.destino = 'empresa'
            group by i.obra_id, i.empregador_id having sum(i.valor) > 0 loop
    insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento, origem, pagamento_id, criado_por)
    values (r.obra_id, 'despesa', 'mao_de_obra', coalesce(r.enome, 'Empresa') || ' (folha e taxa)', r.enome,
            r.total, pg.data_pagamento, pg.data_pagamento, 'folha', p_pagamento, auth.uid());
  end loop;

  -- pagamentos diretos aos funcionários (salário): uma conta só
  select coalesce(sum(i.valor), 0) into v from pagamento_itens i
   where i.pagamento_id = p_pagamento and not i.removido and i.destino <> 'empresa'
     and i.categoria not in ('passagem','alimentacao');
  if v > 0 then
    insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento, origem, pagamento_id, criado_por)
    values (null, 'despesa', 'mao_de_obra', 'Pagamentos diretos aos funcionários', 'Funcionários', v, pg.data_pagamento, pg.data_pagamento, 'folha', p_pagamento, auth.uid());
  end if;

  -- passagens e alimentação: uma conta só
  select coalesce(sum(i.valor), 0) into v from pagamento_itens i
   where i.pagamento_id = p_pagamento and not i.removido and i.destino <> 'empresa'
     and i.categoria in ('passagem','alimentacao');
  if v > 0 then
    insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento, origem, pagamento_id, criado_por)
    values (null, 'despesa', 'beneficios', 'Passagens e alimentação', 'Funcionários', v, pg.data_pagamento, pg.data_pagamento, 'folha', p_pagamento, auth.uid());
  end if;

  update pagamentos set status = 'fechado', fechado_por = auth.uid(), fechado_em = now() where id = p_pagamento;
end $function$;

-- Unifica as contas de "Pagamentos diretos aos funcionários" já existentes (ainda em aberto) dos
-- pagamentos 13º 1ª parcela e Adiantamento 20/11 (segurados): mantém uma com o total e cancela as demais.
WITH d AS (
  SELECT id, pagamento_id,
         row_number() OVER (PARTITION BY pagamento_id ORDER BY valor DESC, id) AS rn,
         sum(valor) OVER (PARTITION BY pagamento_id) AS total
  FROM lancamentos
  WHERE pagamento_id IN ('0768c435-ba5f-465e-b6b4-233c906090f9','2626d0a7-194d-41be-b868-83c71b887d23')
    AND origem = 'folha' AND descricao = 'Pagamentos diretos aos funcionários' AND status = 'aberto'
)
UPDATE lancamentos l SET valor = d.total, obra_id = NULL FROM d WHERE l.id = d.id AND d.rn = 1;

WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY pagamento_id ORDER BY valor DESC, id) AS rn
  FROM lancamentos
  WHERE pagamento_id IN ('0768c435-ba5f-465e-b6b4-233c906090f9','2626d0a7-194d-41be-b868-83c71b887d23')
    AND origem = 'folha' AND descricao = 'Pagamentos diretos aos funcionários' AND status = 'aberto'
)
UPDATE lancamentos l SET status = 'cancelado', motivo_cancelamento = 'Unificado na conta única de pagamentos diretos aos funcionários'
FROM d WHERE l.id = d.id AND d.rn > 1;
