-- =====================================================================
-- 0031 — Compras: corrigir e desfazer cada etapa sem perder histórico
--  Nada é apagado de verdade: o que é "excluído" sai das listas, fica no histórico
--  com quem fez e o motivo, e os itens voltam para a etapa anterior.
--   Cotação ........ excluir proposta • voltar da aprovação para correção • reabrir cancelada • excluir cotação
--   OC ............. desfazer OC (cancela e reabre a cotação para corrigir) • desfazer pagamento/faturamento
--   Documentos ..... excluir NF/boleto/comprovante lançado errado
--   Recebimento .... estornar a entrada da nota (o material sai do estoque e a OC volta a "a receber")
-- =====================================================================

-- Ao sair de uma cotação, o item da solicitação fica guardado aqui (libera para outra cotação)
alter table cotacao_itens add column solicitacao_item_orig uuid references solicitacao_itens(id);

create table cotacoes_excluidas (
  cotacao_id   uuid primary key references cotacoes(id),
  motivo       text not null,
  excluida_por uuid references perfis(id),
  excluida_em  timestamptz not null default now()
);
alter table cotacoes_excluidas enable row level security;
revoke all on cotacoes_excluidas from anon;
grant select on cotacoes_excluidas to authenticated;
create policy cotexc_sel on cotacoes_excluidas for select to authenticated
  using (exists (select 1 from cotacoes c where c.id = cotacao_id));

alter table oc_documentos add column anulado_em timestamptz, add column anulado_por uuid references perfis(id), add column anulado_motivo text;

-- COT-00001 foi cancelada antes desta versão: guarda de onde vieram os itens (hoje estão na COT-00019)
update cotacao_itens ci set solicitacao_item_orig = n.solicitacao_item_id
  from cotacao_itens n join cotacoes cn on cn.id = n.cotacao_id
 where ci.solicitacao_item_id is null and ci.solicitacao_item_orig is null
   and n.solicitacao_item_id is not null and n.descricao = ci.descricao and n.quantidade = ci.quantidade
   and ci.cotacao_id in (select id from cotacoes where status = 'cancelada')
   and cn.status <> 'cancelada'
   and (select obra_id from cotacoes where id = ci.cotacao_id) is not distinct from cn.obra_id;

create or replace function _cot_soltar_itens(p_cot uuid) returns void
language sql security definer set search_path = public as $$
  update cotacao_itens set solicitacao_item_orig = solicitacao_item_id, solicitacao_item_id = null
   where cotacao_id = p_cot and solicitacao_item_id is not null;
$$;

create or replace function _motivo(p text, p_min int default 5) returns text
language plpgsql immutable set search_path = public as $$
begin
  if coalesce(length(trim(p)), 0) < p_min then raise exception 'Informe o motivo (mínimo % letras)', p_min; end if;
  return trim(p);
end $$;

-- ---------------------------------------------------------------------
-- COTAÇÃO
-- ---------------------------------------------------------------------
create or replace function cotacao_cancelar(p_cotacao uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare c cotacoes;
begin
  if not tem_papel('compras','admin') then raise exception 'Sem permissão'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status not in ('em_cotacao','aguardando_aprovacao') then raise exception 'Cotação não pode ser cancelada'; end if;
  update cotacoes set status = 'cancelada', parecer = _motivo(p_motivo) where id = p_cotacao;
  update solicitacao_itens set cotacao_id = null where cotacao_id = p_cotacao;   -- itens voltam para a fila de cotação
  perform _cot_soltar_itens(p_cotacao);
end $$;

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
   where i.cotacao_id = p_cotacao and (si.status <> 'em_cotacao' or si.cotacao_id is not null);
  if v_ocupados is not null then
    raise exception 'Não dá para reabrir: estes itens já estão em outra cotação ou foram atendidos: %', v_ocupados;
  end if;
  update cotacao_itens set solicitacao_item_id = solicitacao_item_orig, solicitacao_item_orig = null
   where cotacao_id = p_cotacao and solicitacao_item_orig is not null;
  update cotacoes set status = 'em_cotacao', parecer = null, proposta_escolhida_id = null, enviado_em = null where id = p_cotacao;
  update solicitacao_itens si set cotacao_id = p_cotacao
    from cotacao_itens i where i.cotacao_id = p_cotacao and i.solicitacao_item_id = si.id;
  perform _item_evento(i.solicitacao_item_id, 'em_cotacao', 'em_cotacao', null, 'Cotação ' || _cod_cot(c.numero) || ' reaberta')
     from cotacao_itens i where i.cotacao_id = p_cotacao and i.solicitacao_item_id is not null;
end $$;

create or replace function cotacao_proposta_excluir(p_proposta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p cotacao_propostas; c cotacoes;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador exclui propostas'; end if;
  select * into p from cotacao_propostas where id = p_proposta;
  if not found then raise exception 'Proposta não encontrada'; end if;
  select * into c from cotacoes where id = p.cotacao_id for update;
  if c.status <> 'em_cotacao' then raise exception 'Só dá para excluir proposta de cotação em andamento (se está na aprovação, volte para correção)'; end if;
  delete from cotacao_precos where proposta_id = p_proposta;
  delete from cotacao_propostas where id = p_proposta;
end $$;

create or replace function cotacao_voltar_correcao(p_cotacao uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c cotacoes;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador ou a diretoria devolvem a cotação para correção'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'aguardando_aprovacao' then raise exception 'A cotação não está aguardando aprovação'; end if;
  update cotacoes set status = 'em_cotacao', proposta_escolhida_id = null, enviado_em = null where id = p_cotacao;
  perform _alerta_fluxo('cotacao_correcao', 'Cotação voltou para correção ' || _cod_cot(c.numero),
    coalesce(nullif(trim(p_motivo), ''), 'O comprador vai corrigir as propostas antes de reenviar'),
    '/suprimentos/cotacoes/' || p_cotacao, 'fluxo:cot:' || p_cotacao || ':correcao:' || now());
end $$;

-- "Excluir" cotação: some da lista, itens voltam para a fila, fica registrado quem excluiu e por quê
create or replace function cotacao_excluir(p_cotacao uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare c cotacoes; v_mot text := _motivo(p_motivo);
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador ou a diretoria excluem cotações'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found then raise exception 'Cotação não encontrada'; end if;
  if exists (select 1 from cotacoes_excluidas where cotacao_id = p_cotacao) then raise exception 'Esta cotação já foi excluída'; end if;
  if c.status = 'aprovada' then raise exception 'Cotação já virou ordem de compra: use "Desfazer OC" na ordem de compra'; end if;
  perform _item_evento(si.id, si.status, si.status, null, 'Cotação ' || _cod_cot(c.numero) || ' excluída — item voltou para a fila de cotação')
     from solicitacao_itens si where si.cotacao_id = p_cotacao;
  update solicitacao_itens set cotacao_id = null where cotacao_id = p_cotacao;
  perform _cot_soltar_itens(p_cotacao);
  if c.status <> 'cancelada' then
    update cotacoes set status = 'cancelada', parecer = 'Excluída: ' || v_mot, proposta_escolhida_id = null where id = p_cotacao;
  end if;
  insert into cotacoes_excluidas (cotacao_id, motivo, excluida_por) values (p_cotacao, v_mot, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- ORDEM DE COMPRA
-- ---------------------------------------------------------------------
-- Desfazer OC: cancela a OC e abre uma cópia da cotação (itens + propostas) para o comprador corrigir e reenviar
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

  -- 1) cancela a OC (o lançamento em aberto no contas a pagar é cancelado junto)
  update lancamentos set status = 'aberto', liquidado_em = null, valor_liquidado = null, forma_pagamento = null, atualizado_em = now()
   where oc_id = p_oc and origem = 'oc' and status = 'liquidado';
  update ordens_compra set status = 'cancelada' where id = p_oc;
  perform _oc_evento(p_oc, 'desfeita', 'OC desfeita para correção: ' || v_mot);

  -- 2) cópia da cotação, com os itens e as propostas
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
    insert into cotacao_propostas (cotacao_id, fornecedor_id, prazo_entrega_dias, condicao_pagamento, frete, observacoes, anexo_caminho, valor_total, criado_por)
    values (v_nova, r.fornecedor_id, r.prazo_entrega_dias, r.condicao_pagamento, r.frete, r.observacoes, r.anexo_caminho, r.valor_total, auth.uid())
    returning id into v_id;
    v_mapa_prop := v_mapa_prop || jsonb_build_object(r.id::text, v_id);
  end loop;
  insert into cotacao_precos (proposta_id, cotacao_item_id, preco_unitario)
  select (v_mapa_prop->>pr.proposta_id::text)::uuid, (v_mapa_item->>pr.cotacao_item_id::text)::uuid, pr.preco_unitario
    from cotacao_precos pr join cotacao_propostas p on p.id = pr.proposta_id where p.cotacao_id = c.id;

  -- 3) itens das solicitações voltam para "em cotação", agora na cópia
  for r in select si.* from solicitacao_itens si where si.oc_id = p_oc loop
    update solicitacao_itens set status = 'em_cotacao', oc_id = null, cotacao_id = v_nova, fornecedor = null, previsao_entrega = null, comprado_em = null
     where id = r.id;
    perform _item_evento(r.id, r.status, 'em_cotacao', r.quantidade, format('%s desfeita — item voltou para a cotação %s para correção', _cod_oc(o.numero), _cod_cot(v_num)));
    perform _sol_atualizar_status(r.solicitacao_id);
  end loop;
  return v_nova;
end $$;

-- Desfazer "pago / faturado": OC volta a aguardar pagamento
create or replace function oc_voltar_pagamento(p_oc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordens_compra; v_mot text := _motivo(p_motivo);
begin
  if not tem_papel('compras','financeiro','admin') then raise exception 'Apenas compras/financeiro desfazem o pagamento'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status <> 'pronta_coleta' then raise exception 'A OC não está como paga/faturada aguardando entrega'; end if;
  if exists (select 1 from lancamentos where oc_id = p_oc and origem = 'oc' and status = 'liquidado'
             and coalesce(forma_pagamento, '') <> 'Pago antes da entrega (compras)') then
    raise exception 'O financeiro já registrou o pagamento desta OC: peça ao financeiro para desfazer a baixa';
  end if;
  update lancamentos set status = 'aberto', liquidado_em = null, valor_liquidado = null, forma_pagamento = null, atualizado_em = now()
   where oc_id = p_oc and origem = 'oc' and status = 'liquidado';
  update ordens_compra set status = 'emitida', pagamento = null, pago_em = null where id = p_oc;
  update solicitacao_itens set status = 'compra_autorizada', comprado_em = null where oc_id = p_oc and status = 'comprado';
  perform _oc_evento(p_oc, 'pagamento_desfeito', 'Pagamento/faturamento desfeito: ' || v_mot);
end $$;

-- Excluir documento lançado errado (NF, boleto, comprovante): sai da OC e fica no histórico
create or replace function oc_documento_anular(p_doc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d oc_documentos; o ordens_compra; v_mot text := _motivo(p_motivo); nf oc_documentos;
begin
  if not tem_papel('compras','financeiro','almoxarifado','admin') then raise exception 'Sem permissão para excluir documentos da OC'; end if;
  select * into d from oc_documentos where id = p_doc for update;
  if not found or d.anulado_em is not null then raise exception 'Documento não encontrado ou já excluído'; end if;
  select * into o from ordens_compra where id = d.oc_id for update;
  update oc_documentos set anulado_em = now(), anulado_por = auth.uid(), anulado_motivo = v_mot where id = p_doc;
  if d.tipo = 'nf' then
    select * into nf from oc_documentos where oc_id = o.id and tipo = 'nf' and anulado_em is null order by criado_em desc limit 1;
    if nf.id is null then
      update ordens_compra set nf_numero = null, nf_valor = null, nf_divergente = false where id = o.id;
      update lancamentos set valor = o.valor_total, documento_numero = null, atualizado_em = now()
       where oc_id = o.id and origem = 'oc' and status = 'aberto';
    else
      update ordens_compra set nf_numero = nf.numero, nf_valor = nf.valor,
             nf_divergente = nf.valor is not null and abs(nf.valor - o.valor_total) > greatest(1, o.valor_total * 0.01) where id = o.id;
      update lancamentos set valor = coalesce(nf.valor, o.valor_total), documento_numero = nf.numero, atualizado_em = now()
       where oc_id = o.id and origem = 'oc' and status = 'aberto';
    end if;
  end if;
  perform _oc_evento(o.id, 'documento_excluido',
    format('%s%s excluído(a): %s', case d.tipo when 'nf' then 'NF' when 'boleto' then 'Boleto' when 'comprovante' then 'Comprovante' else 'Documento' end,
           coalesce(' ' || d.numero, ''), v_mot));
end $$;

-- Estornar a entrada da nota (recebimento): o material sai do estoque e a OC volta a "a receber"
create or replace function oc_estornar_recebimento(p_oc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordens_compra; v_mot text := _motivo(p_motivo); oi oc_itens; si solicitacao_itens; v_txt text := ''; v_enviados text;
begin
  if not tem_papel('almoxarifado','compras','admin') then raise exception 'Apenas almoxarifado, compras ou diretoria estornam o recebimento'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status not in ('recebida','recebida_parcial') then raise exception 'Esta OC não tem recebimento para estornar'; end if;
  select string_agg(si2.material, ', ') into v_enviados
    from oc_itens x join solicitacao_itens si2 on si2.id = x.solicitacao_item_id
   where x.oc_id = p_oc and si2.status in ('em_transporte','parcialmente_entregue','entregue');
  if v_enviados is not null then
    raise exception 'Não dá para estornar: estes itens já foram enviados/entregues ao encarregado: %', v_enviados;
  end if;
  for oi in select * from oc_itens where oc_id = p_oc and quantidade_recebida > 0 for update loop
    if oi.insumo_id is not null then
      perform _movimentar(o.obra_id, oi.insumo_id, 'saida', oi.quantidade_recebida, 'estorno_recebimento', p_oc,
                          'Estorno do recebimento ' || _cod_oc(o.numero) || coalesce(' NF ' || o.nf_numero, '') || ': ' || v_mot);
    end if;
    update oc_itens set quantidade_recebida = 0 where id = oi.id;
    v_txt := v_txt || format('%s %s %s; ', trim_scale(oi.quantidade_recebida), oi.unidade, oi.descricao);
    if oi.solicitacao_item_id is not null then
      select * into si from solicitacao_itens where id = oi.solicitacao_item_id;
      if si.status = 'disponivel_estoque' and si.oc_id = p_oc then
        update solicitacao_itens set status = case when o.pagamento is not null then 'comprado'::status_material else 'compra_autorizada'::status_material end,
               origem_estoque = false, estoque_obra_id = null where id = si.id;
        perform _item_evento(si.id, si.status, case when o.pagamento is not null then 'comprado'::status_material else 'compra_autorizada'::status_material end,
                             oi.quantidade_recebida, 'Recebimento estornado — ' || _cod_oc(o.numero) || ': ' || v_mot);
        perform _sol_atualizar_status(si.solicitacao_id);
      end if;
    end if;
  end loop;
  update ordens_compra set status = case when pagamento is not null then 'pronta_coleta' else 'emitida' end where id = p_oc;
  perform _oc_evento(p_oc, 'recebimento_estornado', 'Recebimento estornado (saiu do estoque): ' || v_txt || 'Motivo: ' || v_mot);
end $$;

revoke execute on function _cot_soltar_itens(uuid) from public, anon, authenticated;
revoke execute on function _motivo(text, int) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['cotacao_cancelar(uuid,text)','cotacao_reabrir(uuid)','cotacao_proposta_excluir(uuid)',
     'cotacao_voltar_correcao(uuid,text)','cotacao_excluir(uuid,text)','oc_desfazer(uuid,text)','oc_voltar_pagamento(uuid,text)',
     'oc_documento_anular(uuid,text)','oc_estornar_recebimento(uuid,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
