-- =====================================================================
-- 0035 — Voltar itens sem cancelar a cotação
--  * Tirar um ou vários itens de uma cotação em andamento: voltam para a fila de cotação
--    (a cotação continua com os outros itens; os preços já digitados desses itens saem das propostas).
--  * Item que foi para cotação por engano na verificação de estoque volta para "verificar estoque".
-- =====================================================================
alter table cotacao_itens add column removido_em timestamptz, add column removido_por uuid references perfis(id);

create or replace function cotacao_remover_itens(p_cotacao uuid, p_itens uuid[], p_motivo text default null) returns int
language plpgsql security definer set search_path = public as $$
declare c cotacoes; r record; v_n int := 0;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador ou a diretoria tiram itens da cotação'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if c.status <> 'em_cotacao' then
    raise exception 'Só dá para tirar itens de cotação em andamento (se está aguardando aprovação, use "Voltar para correção" antes)';
  end if;
  if p_itens is null or cardinality(p_itens) = 0 then raise exception 'Marque os itens que vão voltar para a fila'; end if;
  if not exists (select 1 from cotacao_itens where cotacao_id = p_cotacao and removido_em is null and id <> all(p_itens)) then
    raise exception 'Não sobraria nenhum item na cotação: use "Excluir cotação"';
  end if;
  for r in select * from cotacao_itens where cotacao_id = p_cotacao and id = any(p_itens) and removido_em is null for update loop
    delete from cotacao_precos where cotacao_item_id = r.id;
    update cotacao_itens set removido_em = now(), removido_por = auth.uid(),
           solicitacao_item_orig = coalesce(solicitacao_item_id, solicitacao_item_orig), solicitacao_item_id = null
     where id = r.id;
    if r.solicitacao_item_id is not null then
      update solicitacao_itens set cotacao_id = null where id = r.solicitacao_item_id and cotacao_id = p_cotacao;
      perform _item_evento(r.solicitacao_item_id, 'em_cotacao', 'em_cotacao', null,
        format('Retirado da cotação %s — voltou para a fila de cotação%s', _cod_cot(c.numero), coalesce(': ' || nullif(trim(p_motivo), ''), '')));
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhum dos itens marcados está nesta cotação'; end if;
  -- recalcula o total das propostas sem os itens retirados
  update cotacao_propostas pp set valor_total = coalesce((select round(sum(pr.preco_unitario * i.quantidade), 2)
      from cotacao_precos pr join cotacao_itens i on i.id = pr.cotacao_item_id where pr.proposta_id = pp.id), 0) + pp.frete
   where pp.cotacao_id = p_cotacao;
  return v_n;
end $$;

-- Item que foi para a fila de cotação por engano volta para a verificação de estoque
create or replace function item_voltar_verificacao(p_item uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens;
begin
  if not tem_papel('almoxarifado','compras','admin') then raise exception 'Apenas almoxarifado, compras ou diretoria'; end if;
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if i.status <> 'em_cotacao' or i.cotacao_id is not null or i.oc_id is not null then
    raise exception 'Só volta para a verificação o item que está na fila de cotação (se já está numa cotação, tire-o da cotação antes)';
  end if;
  if i.item_origem_id is not null or exists (select 1 from solicitacao_itens x where x.item_origem_id = p_item) then
    raise exception 'Este item foi dividido entre estoque e compra: cancele o saldo e inclua de novo, se precisar';
  end if;
  update solicitacao_itens set status = 'aprovado' where id = p_item;
  perform _item_evento(p_item, 'em_cotacao', 'aprovado', null,
    'Voltou para a verificação de estoque' || coalesce(': ' || nullif(trim(p_motivo), ''), ''));
  perform _sol_atualizar_status(i.solicitacao_id);
end $$;

-- Propostas e totais só contam os itens que continuam na cotação
create or replace function cotacao_proposta_salvar(p_cotacao uuid, p_fornecedor uuid, p_prazo int, p_condicao text,
                                                   p_frete numeric, p_precos jsonb, p_obs text default null, p_anexo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c cotacoes; v_id uuid; it jsonb; v_total numeric;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador registra propostas'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'em_cotacao' then raise exception 'A cotação não está aberta para propostas'; end if;
  insert into cotacao_propostas (cotacao_id, fornecedor_id, prazo_entrega_dias, condicao_pagamento, frete, observacoes, anexo_caminho, criado_por)
  values (p_cotacao, p_fornecedor, coalesce(p_prazo,0), p_condicao, coalesce(p_frete,0), p_obs, p_anexo, auth.uid())
  on conflict (cotacao_id, fornecedor_id) do update set prazo_entrega_dias = excluded.prazo_entrega_dias,
     condicao_pagamento = excluded.condicao_pagamento, frete = excluded.frete, observacoes = excluded.observacoes,
     anexo_caminho = coalesce(excluded.anexo_caminho, cotacao_propostas.anexo_caminho)
  returning id into v_id;
  delete from cotacao_precos where proposta_id = v_id;
  for it in select * from jsonb_array_elements(p_precos) loop
    if not exists (select 1 from cotacao_itens where id = (it->>'cotacao_item_id')::uuid and cotacao_id = p_cotacao) then
      raise exception 'Item não pertence à cotação';
    end if;
    continue when exists (select 1 from cotacao_itens where id = (it->>'cotacao_item_id')::uuid and removido_em is not null);
    if nullif(it->>'preco_unitario','') is not null then
      insert into cotacao_precos values (v_id, (it->>'cotacao_item_id')::uuid, (it->>'preco_unitario')::numeric);
    end if;
  end loop;
  if (select count(*) from cotacao_precos where proposta_id = v_id)
     < (select count(*) from cotacao_itens where cotacao_id = p_cotacao and removido_em is null) then
    raise exception 'Informe o preço de todos os itens da cotação';
  end if;
  select round(sum(p.preco_unitario * i.quantidade), 2) + coalesce(p_frete,0) into v_total
    from cotacao_precos p join cotacao_itens i on i.id = p.cotacao_item_id where p.proposta_id = v_id;
  update cotacao_propostas set valor_total = v_total where id = v_id;
  return v_id;
end $$;

-- Reabrir cancelada: os itens retirados antes continuam fora
create or replace function cotacao_reabrir(p_cotacao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cotacoes; v_ocupados text;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador ou a diretoria reabrem cotações'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'cancelada' then raise exception 'Só uma cotação cancelada pode ser reaberta'; end if;
  if exists (select 1 from cotacoes_excluidas where cotacao_id = p_cotacao) then raise exception 'Esta cotação foi excluída'; end if;
  select string_agg(i.descricao, ', ') into v_ocupados
    from cotacao_itens i join solicitacao_itens si on si.id = i.solicitacao_item_orig
   where i.cotacao_id = p_cotacao and i.removido_em is null and (si.status <> 'em_cotacao' or si.cotacao_id is not null);
  if v_ocupados is not null then
    raise exception 'Não dá para reabrir: estes itens já estão em outra cotação ou foram atendidos: %', v_ocupados;
  end if;
  update cotacao_itens set solicitacao_item_id = solicitacao_item_orig, solicitacao_item_orig = null
   where cotacao_id = p_cotacao and solicitacao_item_orig is not null and removido_em is null;
  update cotacoes set status = 'em_cotacao', parecer = null, proposta_escolhida_id = null, enviado_em = null where id = p_cotacao;
  update solicitacao_itens si set cotacao_id = p_cotacao
    from cotacao_itens i where i.cotacao_id = p_cotacao and i.solicitacao_item_id = si.id;
  perform _item_evento(i.solicitacao_item_id, 'em_cotacao', 'em_cotacao', null, 'Cotação ' || _cod_cot(c.numero) || ' reaberta')
     from cotacao_itens i where i.cotacao_id = p_cotacao and i.solicitacao_item_id is not null;
end $$;

create or replace view v_cotacoes with (security_invoker = true) as
select c.id, c.numero, c.obra_id, c.status, c.justificativa_estoque, c.proposta_escolhida_id, c.justificativa_escolha, c.observacoes,
       c.criado_por, c.criado_em, c.enviado_em, c.decidido_por, c.decidido_em, c.parecer, c.atualizado_em,
       'COT-' || lpad(c.numero::text, 5, '0') as codigo, o.codigo as obra_codigo, coalesce(o.nome, 'Depósito central') as obra_nome,
       pc.nome as comprador_nome, pd.nome as decidido_nome,
       (select count(*) from cotacao_itens i where i.cotacao_id = c.id and i.removido_em is null) as total_itens,
       (select count(*) from cotacao_propostas p where p.cotacao_id = c.id) as total_propostas,
       (select min(p.valor_total) from cotacao_propostas p where p.cotacao_id = c.id) as menor_valor,
       pe.valor_total as valor_escolhido, fe.nome as fornecedor_escolhido,
       (select oc.id from ordens_compra oc where oc.cotacao_id = c.id) as oc_id
  from cotacoes c
  left join obras o on o.id = c.obra_id
  left join perfis pc on pc.id = c.criado_por
  left join perfis pd on pd.id = c.decidido_por
  left join cotacao_propostas pe on pe.id = c.proposta_escolhida_id
  left join fornecedores fe on fe.id = pe.fornecedor_id;

-- Desfazer OC não traz de volta itens que já tinham sido retirados da cotação
create or replace function oc_desfazer(p_oc uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordens_compra; c cotacoes; v_mot text := _motivo(p_motivo); v_nova uuid; v_num bigint;
        r record; v_mapa_item jsonb := '{}'; v_mapa_prop jsonb := '{}'; v_id uuid;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador ou a diretoria desfazem a OC'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found then raise exception 'OC não encontrada'; end if;
  if o.status not in ('emitida','pronta_coleta') then
    raise exception 'Só dá para desfazer OC ainda não recebida (se já recebeu, estorne o recebimento antes)';
  end if;
  if exists (select 1 from oc_itens where oc_id = p_oc and quantidade_recebida > 0) then
    raise exception 'Esta OC já tem recebimento: estorne o recebimento antes';
  end if;
  if exists (select 1 from lancamentos where oc_id = p_oc and origem = 'oc' and status = 'liquidado'
             and coalesce(forma_pagamento, '') <> 'Pago antes da entrega (compras)') then
    raise exception 'O financeiro já registrou o pagamento desta OC: peça ao financeiro para desfazer a baixa antes';
  end if;
  select * into c from cotacoes where id = o.cotacao_id;
  update lancamentos set status = 'aberto', liquidado_em = null, valor_liquidado = null, forma_pagamento = null, atualizado_em = now()
   where oc_id = p_oc and origem = 'oc' and status = 'liquidado';
  update ordens_compra set status = 'cancelada' where id = p_oc;
  perform _oc_evento(p_oc, 'desfeita', 'OC desfeita para correção: ' || v_mot);
  insert into cotacoes (obra_id, justificativa_estoque, observacoes, criado_por)
  values (c.obra_id, c.justificativa_estoque,
          concat_ws(' — ', nullif(c.observacoes, ''), format('Correção da %s (%s desfeita: %s)', _cod_cot(c.numero), _cod_oc(o.numero), v_mot)), auth.uid())
  returning id, numero into v_nova, v_num;
  perform _cot_soltar_itens(c.id);
  for r in select * from cotacao_itens where cotacao_id = c.id and removido_em is null loop
    insert into cotacao_itens (cotacao_id, solicitacao_item_id, insumo_id, descricao, unidade, quantidade, estoque_no_momento)
    values (v_nova, r.solicitacao_item_orig, r.insumo_id, r.descricao, r.unidade, r.quantidade, r.estoque_no_momento) returning id into v_id;
    v_mapa_item := v_mapa_item || jsonb_build_object(r.id::text, v_id);
  end loop;
  for r in select * from cotacao_propostas where cotacao_id = c.id loop
    insert into cotacao_propostas (cotacao_id, fornecedor_id, prazo_entrega_dias, condicao_pagamento, forma_pagamento, frete, observacoes, anexo_caminho, valor_total, criado_por)
    values (v_nova, r.fornecedor_id, r.prazo_entrega_dias, r.condicao_pagamento, r.forma_pagamento, r.frete, r.observacoes, r.anexo_caminho, r.valor_total, auth.uid())
    returning id into v_id;
    v_mapa_prop := v_mapa_prop || jsonb_build_object(r.id::text, v_id);
  end loop;
  insert into cotacao_precos (proposta_id, cotacao_item_id, preco_unitario)
  select (v_mapa_prop->>pr.proposta_id::text)::uuid, (v_mapa_item->>pr.cotacao_item_id::text)::uuid, pr.preco_unitario
    from cotacao_precos pr join cotacao_propostas p on p.id = pr.proposta_id where p.cotacao_id = c.id;
  for r in select si.* from solicitacao_itens si where si.oc_id = p_oc loop
    update solicitacao_itens set status = 'em_cotacao', oc_id = null, cotacao_id = v_nova, fornecedor = null, previsao_entrega = null, comprado_em = null
     where id = r.id;
    perform _item_evento(r.id, r.status, 'em_cotacao', r.quantidade, format('%s desfeita — item voltou para a cotação %s para correção', _cod_oc(o.numero), _cod_cot(v_num)));
    perform _sol_atualizar_status(r.solicitacao_id);
  end loop;
  return v_nova;
end $$;

revoke execute on function cotacao_remover_itens(uuid, uuid[], text) from public, anon;
revoke execute on function item_voltar_verificacao(uuid, text) from public, anon;
grant execute on function cotacao_remover_itens(uuid, uuid[], text) to authenticated;
grant execute on function item_voltar_verificacao(uuid, text) to authenticated;
