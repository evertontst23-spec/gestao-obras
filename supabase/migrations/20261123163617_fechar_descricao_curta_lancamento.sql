-- Fechamento gera contas a pagar com descrição curta (o título do pagamento fica no cabeçalho do grupo, no Financeiro).
CREATE OR REPLACE FUNCTION public.pagamento_fechar(p_pagamento uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare pg pagamentos; r record;
begin
  pg := _pg_rascunho(p_pagamento);
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria fecham o pagamento'; end if;
  if not exists (select 1 from pagamento_itens where pagamento_id = p_pagamento and not removido and valor <> 0) then
    raise exception 'O pagamento não tem valores';
  end if;
  for r in select i.obra_id, i.destino, case when i.destino = 'empresa' then i.empregador_id end as emp,
                  max(em.nome) filter (where i.destino = 'empresa') as enome,
                  bool_or(i.categoria not in ('passagem','alimentacao')) as tem_salario,
                  sum(i.valor) as total
             from pagamento_itens i left join empregadores em on em.id = i.empregador_id
            where i.pagamento_id = p_pagamento and not i.removido
            group by i.obra_id, i.destino, case when i.destino = 'empresa' then i.empregador_id end
           having sum(i.valor) > 0 loop
    insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento, origem, pagamento_id, criado_por)
    values (r.obra_id, 'despesa', case when r.destino = 'empresa' or r.tem_salario then 'mao_de_obra' else 'beneficios' end,
            case when r.destino = 'empresa' then coalesce(r.enome, 'Empresa') || ' (folha e taxa)'
                 when r.tem_salario then 'Pagamentos diretos aos funcionários'
                 else 'Passagens e alimentação' end,
            case when r.destino = 'empresa' then r.enome else 'Funcionários' end,
            r.total, pg.data_pagamento, pg.data_pagamento, 'folha', p_pagamento, auth.uid());
  end loop;
  update pagamentos set status = 'fechado', fechado_por = auth.uid(), fechado_em = now() where id = p_pagamento;
end $function$;

-- Encurta as descrições das contas a pagar já geradas pela folha (tira o título do pagamento que ficava grudado na frente).
WITH novo AS (
  SELECT l.id, substring(l.descricao FROM length(p.titulo || ' — ') + 1) AS resto
  FROM lancamentos l JOIN pagamentos p ON p.id = l.pagamento_id
  WHERE l.origem = 'folha' AND l.descricao LIKE p.titulo || ' — %'
)
UPDATE lancamentos l
   SET descricao = upper(left(novo.resto, 1)) || substring(novo.resto FROM 2)
  FROM novo WHERE l.id = novo.id;
