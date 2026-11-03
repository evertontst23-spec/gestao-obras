-- =====================================================================
-- 0034 — Cotação: forma de pagamento, envio ao fornecedor por WhatsApp e anexo da proposta
--  * Cada proposta guarda a forma de pagamento (PIX, boleto, cartão de crédito, dinheiro); vai para a OC.
--  * O comprador manda o pedido de cotação pelo WhatsApp do fornecedor; o envio fica registrado.
--  * A resposta do fornecedor (PDF ou foto) fica anexada à proposta; os preços são lançados à mão.
-- =====================================================================
alter table cotacao_propostas add column forma_pagamento text
  check (forma_pagamento in ('pix','boleto','cartao_credito','dinheiro'));
alter table ordens_compra add column forma_pagamento text
  check (forma_pagamento in ('pix','boleto','cartao_credito','dinheiro'));

create table cotacao_envios (
  id            bigserial primary key,
  cotacao_id    uuid not null references cotacoes(id),
  fornecedor_id uuid references fornecedores(id),
  canal         text not null default 'whatsapp' check (canal in ('whatsapp','email','outro')),
  telefone      text,
  enviado_por   uuid references perfis(id),
  enviado_em    timestamptz not null default now()
);
create index on cotacao_envios (cotacao_id);
alter table cotacao_envios enable row level security;
revoke all on cotacao_envios from anon;
grant select on cotacao_envios to authenticated;
create policy cotenv_sel on cotacao_envios for select to authenticated using (exists (select 1 from cotacoes c where c.id = cotacao_id));

create or replace function cotacao_registrar_envio(p_cotacao uuid, p_fornecedor uuid, p_telefone text default null, p_canal text default 'whatsapp')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador envia pedidos de cotação'; end if;
  if not exists (select 1 from cotacoes where id = p_cotacao and status = 'em_cotacao') then raise exception 'A cotação não está aberta'; end if;
  insert into cotacao_envios (cotacao_id, fornecedor_id, canal, telefone, enviado_por)
  values (p_cotacao, p_fornecedor, coalesce(p_canal, 'whatsapp'), nullif(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'), ''), auth.uid());
  -- guarda o telefone no cadastro do fornecedor se ainda não tinha
  if p_fornecedor is not null and coalesce(trim(p_telefone), '') <> '' then
    update fornecedores set telefone = trim(p_telefone) where id = p_fornecedor and coalesce(trim(telefone), '') = '';
  end if;
end $$;

-- Forma de pagamento e anexo (PDF/foto da resposta do fornecedor) da proposta
create or replace function cotacao_proposta_complementar(p_proposta uuid, p_forma text default null, p_anexo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p cotacao_propostas; c cotacoes;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador altera propostas'; end if;
  select * into p from cotacao_propostas where id = p_proposta;
  if not found then raise exception 'Proposta não encontrada'; end if;
  select * into c from cotacoes where id = p.cotacao_id;
  if c.status <> 'em_cotacao' then raise exception 'A cotação não está aberta para alterações'; end if;
  if p_forma is not null and p_forma not in ('pix','boleto','cartao_credito','dinheiro') then raise exception 'Forma de pagamento inválida'; end if;
  update cotacao_propostas set forma_pagamento = coalesce(p_forma, forma_pagamento), anexo_caminho = coalesce(nullif(p_anexo, ''), anexo_caminho)
   where id = p_proposta;
end $$;

-- A OC herda a forma de pagamento da proposta aprovada
create or replace function _tg_oc_forma_pagamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.forma_pagamento is null then
    select p.forma_pagamento into new.forma_pagamento
      from cotacoes c join cotacao_propostas p on p.id = c.proposta_escolhida_id where c.id = new.cotacao_id;
  end if;
  return new;
end $$;
create trigger tg_oc_forma_pagamento before insert on ordens_compra for each row execute function _tg_oc_forma_pagamento();

-- Desfazer OC também copia forma de pagamento e anexo das propostas
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
  for r in select * from cotacao_itens where cotacao_id = c.id loop
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

revoke execute on function _tg_oc_forma_pagamento() from public, anon, authenticated;
revoke execute on function cotacao_registrar_envio(uuid, uuid, text, text) from public, anon;
revoke execute on function cotacao_proposta_complementar(uuid, text, text) from public, anon;
grant execute on function cotacao_registrar_envio(uuid, uuid, text, text) to authenticated;
grant execute on function cotacao_proposta_complementar(uuid, text, text) to authenticated;
