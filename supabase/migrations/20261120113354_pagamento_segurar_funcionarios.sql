-- Pagamento-irmão de "segurados": funcionários tirados do pagamento para pagar depois.
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS separado_de uuid REFERENCES pagamentos(id);

-- Expõe separado_de na view usada pelas telas
CREATE OR REPLACE VIEW v_pagamentos AS
 SELECT p.id,
    p.data_pagamento,
    p.titulo,
    p.tipo,
    p.periodo_inicio,
    p.periodo_fim,
    p.status,
    p.observacoes,
    p.criado_por,
    p.criado_em,
    p.fechado_por,
    p.fechado_em,
    p.pago_em,
    p.motivo_cancelamento,
    pc.nome AS criado_nome,
    COALESCE(sum(i.valor) FILTER (WHERE NOT i.removido), 0::numeric) AS total,
    COALESCE(sum(i.valor) FILTER (WHERE NOT i.removido AND i.destino = 'empresa'::text), 0::numeric) AS total_empresas,
    COALESCE(sum(i.valor) FILTER (WHERE NOT i.removido AND i.destino = 'funcionario'::text AND (i.categoria = ANY (ARRAY['passagem'::text, 'alimentacao'::text]))), 0::numeric) AS total_beneficios,
    COALESCE(sum(i.valor) FILTER (WHERE NOT i.removido AND i.destino = 'funcionario'::text AND (i.categoria <> ALL (ARRAY['passagem'::text, 'alimentacao'::text]))), 0::numeric) AS total_pessoas,
    count(DISTINCT i.funcionario_id) FILTER (WHERE NOT i.removido) AS funcionarios,
    p.separado_de
   FROM pagamentos p
     LEFT JOIN pagamento_itens i ON i.pagamento_id = p.id
     LEFT JOIN perfis pc ON pc.id = p.criado_por
  GROUP BY p.id, pc.nome;

-- Segura um funcionário: move as linhas dele para o pagamento-irmão (cria se não existir).
CREATE OR REPLACE FUNCTION pagamento_segurar(p_pagamento uuid, p_funcionario uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare pg pagamentos; sib uuid; movidas int;
begin
  pg := _pg_rascunho(p_pagamento);            -- valida papel + rascunho e trava a linha
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

  update pagamento_itens set pagamento_id = sib
   where pagamento_id = p_pagamento and funcionario_id = p_funcionario and not removido;
  get diagnostics movidas = row_count;
  if movidas = 0 then raise exception 'Esse funcionário não tem linhas neste pagamento'; end if;
  return sib;
end $$;

-- Devolve um funcionário dos segurados de volta ao pagamento principal.
CREATE OR REPLACE FUNCTION pagamento_devolver(p_pagamento uuid, p_funcionario uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare pg pagamentos; alvo uuid;
begin
  pg := _pg_rascunho(p_pagamento);
  if pg.separado_de is null then raise exception 'Este não é um pagamento de segurados'; end if;
  alvo := pg.separado_de;
  if not exists (select 1 from pagamentos where id = alvo and status = 'rascunho') then
    raise exception 'O pagamento principal já foi fechado — reabra-o antes de devolver o funcionário';
  end if;

  update pagamento_itens set pagamento_id = alvo
   where pagamento_id = p_pagamento and funcionario_id = p_funcionario and not removido;

  -- se o irmão ficou sem ninguém, cancela
  if not exists (select 1 from pagamento_itens where pagamento_id = p_pagamento and not removido) then
    update pagamentos set status = 'cancelado', motivo_cancelamento = 'Todos os segurados foram devolvidos ao pagamento principal' where id = p_pagamento;
  end if;
  return alvo;
end $$;

GRANT EXECUTE ON FUNCTION pagamento_segurar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pagamento_devolver(uuid, uuid) TO authenticated;
