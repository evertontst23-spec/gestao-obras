-- =====================================================================
-- 0052 — OC paga no cartão de crédito
--  Situação do pagamento: pago | faturado (boleto) | cartão de crédito.
--  No cartão, o material é liberado na hora, mas a despesa fica em aberto no financeiro
--  até a fatura do cartão (vencimento = data da fatura informada).
-- =====================================================================
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'ordens_compra'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%pagamento%faturado%';
  if c is not null then execute format('alter table ordens_compra drop constraint %I', c); end if;
end $$;
alter table ordens_compra add constraint ordens_compra_pagamento_check check (pagamento in ('pago','faturado','cartao'));

drop function if exists oc_liberar_coleta(uuid, text, text, date);
create or replace function oc_liberar_coleta(p_oc uuid, p_pagamento text, p_retirante text default null, p_previsao date default null,
  p_fatura date default null)
returns void language plpgsql security definer set search_path = public as $$
declare o ordens_compra;
begin
  if not tem_papel('compras','financeiro','admin') then raise exception 'Apenas compras/financeiro registram o pagamento'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status <> 'emitida' then raise exception 'A OC não está aguardando pagamento/faturamento'; end if;
  if p_pagamento not in ('pago','faturado','cartao') then raise exception 'Informe se foi pago, faturado ou no cartão de crédito'; end if;
  if p_pagamento = 'cartao' and p_fatura is not null and p_fatura < hoje() then raise exception 'A data da fatura do cartão não pode ser no passado'; end if;
  if o.modalidade = 'retirada' and coalesce(trim(coalesce(p_retirante, o.retirante)),'') = '' then
    raise exception 'Informe quem vai retirar o material (a OC acompanha o retirante)';
  end if;
  update ordens_compra set status = 'pronta_coleta', pagamento = p_pagamento, pago_em = now(),
         retirante = coalesce(nullif(trim(p_retirante),''), retirante), previsao_entrega = coalesce(p_previsao, previsao_entrega)
   where id = p_oc;
  update solicitacao_itens set status = 'comprado', comprado_em = now(), previsao_entrega = coalesce(p_previsao, previsao_entrega)
   where oc_id = p_oc and status = 'compra_autorizada';
  -- cartão: despesa continua em aberto no financeiro, vencendo na fatura
  if p_pagamento = 'cartao' then
    update lancamentos set forma_pagamento = 'Cartão de crédito', vencimento = coalesce(p_fatura, vencimento), atualizado_em = now()
     where oc_id = p_oc and origem = 'oc' and status = 'aberto';
  end if;
  perform _oc_evento(p_oc, 'pronta_coleta', format('%s — %s', case p_pagamento when 'pago' then 'Pago' when 'faturado' then 'Faturado' else 'Pago no cartão de crédito' || coalesce(' (fatura ' || to_char(p_fatura, 'DD/MM/YYYY') || ')', '') end,
    case when o.modalidade = 'retirada' then 'pronto para coleta por ' || coalesce(nullif(trim(p_retirante),''), o.retirante) else 'aguardando entrega do fornecedor' end));
  perform _notificar_papeis(array['almoxarifado','compras','financeiro'], 'oc_pronta_coleta',
    _cod_oc(o.numero) || case when o.modalidade = 'retirada' then ' pronta para coleta' else case when p_pagamento = 'cartao' then ' paga no cartão — aguardando entrega' else ' paga — aguardando entrega' end end,
    format('%s • %s', (select nome from fornecedores where id = o.fornecedor_id),
      case when o.modalidade = 'retirada' then 'Retirante: ' || coalesce(nullif(trim(p_retirante),''), o.retirante) else 'Previsão ' || to_char(coalesce(p_previsao, o.previsao_entrega),'DD/MM/YYYY') end),
    '/suprimentos/ordens/' || p_oc);
  if o.obra_id is not null then
    perform _notificar_engenheiros(o.obra_id, 'oc_pronta_coleta', _cod_oc(o.numero) || ' paga/faturada', 'Material a caminho da obra.', '/suprimentos/ordens/' || p_oc);
  end if;
end $$;

revoke execute on function oc_liberar_coleta(uuid, text, text, date, date) from public, anon;
grant execute on function oc_liberar_coleta(uuid, text, text, date, date) to authenticated;

-- desfazer: o lançamento em aberto perde a marca de cartão
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
   where oc_id = p_oc and origem = 'oc' and (status = 'liquidado' or forma_pagamento = 'Cartão de crédito');
  update ordens_compra set status = 'emitida', pagamento = null, pago_em = null where id = p_oc;
  update solicitacao_itens set status = 'compra_autorizada', comprado_em = null where oc_id = p_oc and status = 'comprado';
  perform _oc_evento(p_oc, 'pagamento_desfeito', 'Pagamento/faturamento desfeito: ' || v_mot);
end $$;

-- alerta: "OC paga no cartão"
create or replace function _tg_alerta_oc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tit text; v_sm uuid[];
begin
  if new.status is not distinct from old.status and new.pagamento is not distinct from old.pagamento then return null; end if;
  v_tit := case
    when new.pagamento is distinct from old.pagamento and new.pagamento is not null then
      case new.pagamento when 'pago' then 'OC paga: ' when 'cartao' then 'OC paga no cartão: ' else 'OC faturada: ' end
    when new.status = 'pronta_coleta'    then 'OC liberada para entrega/coleta: '
    when new.status = 'recebida_parcial' then 'OC recebida em parte: '
    when new.status = 'recebida'         then 'OC recebida: '
    when new.status = 'cancelada'        then 'OC cancelada: '
    else null end;
  if v_tit is null then return null; end if;
  select array_agg(distinct s.solicitante_id) into v_sm
    from oc_itens oi join solicitacao_itens si on si.id = oi.solicitacao_item_id join solicitacoes s on s.id = si.solicitacao_id
   where oi.oc_id = new.id;
  perform _alerta_fluxo('fluxo_oc', v_tit || _cod_oc(new.numero),
    format('%s • %s • %s', coalesce((select nome from obras where id = new.obra_id), 'Depósito central'),
           (select nome from fornecedores where id = new.fornecedor_id), _brl(new.valor_total)),
    '/suprimentos/ordens/' || new.id, 'fluxo:oc:' || new.id || ':' || new.status || ':' || coalesce(new.pagamento, ''),
    case when new.status in ('recebida','recebida_parcial','pronta_coleta') then coalesce(v_sm, '{}') else '{}' end);
  return null;
end $$;
