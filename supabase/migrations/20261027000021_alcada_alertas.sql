-- =====================================================================
-- 0021 — Alçada de aprovação de compras e alertas de todo o fluxo
--  * Limite de valor: compras até o limite podem ser aprovadas pelo coordenador de compras;
--    acima do limite, só a diretoria. O limite é definido pela diretoria.
--  * Coordenador de compras: marcação no usuário (definida pela diretoria).
--  * Alertas: a diretoria é avisada de cada etapa do fluxo de compras (pedido, aprovação,
--    estoque, cotação, aprovação da compra, OC, pagamento, recebimento e entrega).
--    Quem fez o pedido também acompanha as etapas do seu pedido.
-- =====================================================================

create table compras_parametros (
  id                  int primary key default 1 check (id = 1),
  limite_coordenador  numeric(14,2) not null default 5000 check (limite_coordenador >= 0),
  atualizado_por      uuid references perfis(id),
  atualizado_em       timestamptz not null default now()
);
insert into compras_parametros (id) values (1);
alter table compras_parametros enable row level security;
create policy compras_parametros_select on compras_parametros for select to authenticated using (meu_papel() is not null);
grant select on compras_parametros to authenticated;

alter table perfis add column coordenador_compras boolean not null default false;

create or replace function compras_definir_limite(p_valor numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin') then raise exception 'Apenas a diretoria define o limite de aprovação'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe um valor válido para o limite'; end if;
  update compras_parametros set limite_coordenador = p_valor, atualizado_por = auth.uid(), atualizado_em = now() where id = 1;
end $$;

create or replace function perfil_definir_coordenador(p_usuario uuid, p_coordenador boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin') then raise exception 'Apenas a diretoria define o coordenador de compras'; end if;
  update perfis set coordenador_compras = coalesce(p_coordenador, false) where id = p_usuario;
  if not found then raise exception 'Usuário não encontrado'; end if;
end $$;

-- Quem pode aprovar uma compra deste valor
create or replace function pode_aprovar_compra(p_valor numeric) returns boolean
language sql stable security definer set search_path = public as $$
  select tem_papel('admin')
      or (exists (select 1 from perfis where id = auth.uid() and ativo and coordenador_compras)
          and coalesce(p_valor, 0) <= (select limite_coordenador from compras_parametros where id = 1))
$$;

-- Diretoria (e, opcionalmente, outros) recebe o alerta de uma etapa; nunca quem fez a ação
create or replace function _alerta_fluxo(p_tipo text, p_titulo text, p_msg text, p_link text, p_chave text,
                                         p_tambem uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from perfis where ativo and (papel = 'admin' or id = any(p_tambem)) and id is distinct from auth.uid() loop
    perform _notificar(u, p_tipo, p_titulo, p_msg, p_link, p_chave);
  end loop;
end $$;

-- ---------- Envio para aprovação: coordenador (até o limite) ou diretoria ----------
create or replace function cotacao_enviar_aprovacao(p_cotacao uuid, p_proposta uuid, p_justificativa text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c cotacoes; p cotacao_propostas; v_min numeric; v_n int; v_lim numeric; v_msg text; u uuid;
begin
  if not tem_papel('compras','admin') then raise exception 'Apenas o comprador envia para aprovação'; end if;
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'em_cotacao' then raise exception 'A cotação não está em andamento'; end if;
  select * into p from cotacao_propostas where id = p_proposta and cotacao_id = p_cotacao;
  if not found then raise exception 'Escolha uma das propostas desta cotação'; end if;
  select count(*), min(valor_total) into v_n, v_min from cotacao_propostas where cotacao_id = p_cotacao;
  if p.valor_total > v_min and coalesce(length(trim(p_justificativa)),0) < 10 then
    raise exception 'A proposta escolhida não é a de menor valor (menor: %). Justifique a escolha.', _brl(v_min);
  end if;
  update cotacoes set status = 'aguardando_aprovacao', proposta_escolhida_id = p_proposta,
         justificativa_escolha = nullif(trim(p_justificativa),''), enviado_em = now() where id = p_cotacao;
  select limite_coordenador into v_lim from compras_parametros where id = 1;
  v_msg := format('%s • %s proposta(s) • escolhida: %s — %s • %s', coalesce((select nome from obras where id = c.obra_id), 'Depósito central'), v_n,
           (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total),
           case when p.valor_total <= v_lim then 'dentro do limite do coordenador (' || _brl(v_lim) || ')'
                else 'acima de ' || _brl(v_lim) || ': só a diretoria aprova' end);
  perform _notificar_papel('admin', 'cotacao_aprovar', 'Aprovar compra ' || _cod_cot(c.numero), v_msg, '/suprimentos/cotacoes/' || p_cotacao);
  if p.valor_total <= v_lim then
    for u in select id from perfis where ativo and coordenador_compras and papel <> 'admin' and id is distinct from auth.uid() loop
      perform _notificar(u, 'cotacao_aprovar', 'Aprovar compra ' || _cod_cot(c.numero), v_msg, '/suprimentos/cotacoes/' || p_cotacao);
    end loop;
  end if;
end $$;

-- ---------- Decisão: respeita a alçada ----------
create or replace function cotacao_decidir(p_cotacao uuid, p_aprovar boolean, p_parecer text default null,
                                           p_modalidade text default 'entrega', p_retirante text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c cotacoes; p cotacao_propostas; v_oc uuid; v_num bigint; r record; v_prev date; v_sol solicitacoes; v_quem text;
begin
  select * into c from cotacoes where id = p_cotacao for update;
  if not found or c.status <> 'aguardando_aprovacao' then raise exception 'A cotação não está aguardando aprovação'; end if;
  select * into p from cotacao_propostas where id = c.proposta_escolhida_id;
  if not pode_aprovar_compra(p.valor_total) then
    if exists (select 1 from perfis where id = auth.uid() and coordenador_compras) then
      raise exception 'Compra de % está acima do limite do coordenador (%). Só a diretoria aprova.',
        _brl(p.valor_total), _brl((select limite_coordenador from compras_parametros where id = 1));
    end if;
    raise exception 'Apenas a diretoria ou o coordenador de compras (até o limite) aprovam compras';
  end if;
  v_quem := case when tem_papel('admin') then 'diretoria' else 'coordenador de compras' end;
  if not p_aprovar then
    if coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo da recusa'; end if;
    update cotacoes set status = 'em_cotacao', decidido_por = auth.uid(), decidido_em = now(), parecer = p_parecer,
           proposta_escolhida_id = null where id = p_cotacao;
    perform _notificar(c.criado_por, 'cotacao_recusada', 'Compra recusada ' || _cod_cot(c.numero), p_parecer, '/suprimentos/cotacoes/' || p_cotacao);
    perform _alerta_fluxo('cotacao_recusada', 'Compra recusada ' || _cod_cot(c.numero),
      format('Recusada pelo %s: %s', v_quem, p_parecer), '/suprimentos/cotacoes/' || p_cotacao, 'fluxo:cot:' || p_cotacao || ':recusada:' || now());
    return null;
  end if;

  v_prev := hoje() + p.prazo_entrega_dias;
  insert into ordens_compra (cotacao_id, obra_id, fornecedor_id, valor_total, frete, condicao_pagamento, previsao_entrega,
                             modalidade, retirante, emitida_por)
  values (p_cotacao, c.obra_id, p.fornecedor_id, p.valor_total, p.frete, p.condicao_pagamento, v_prev,
          coalesce(p_modalidade,'entrega'), p_retirante, auth.uid())
  returning id, numero into v_oc, v_num;

  for r in select i.*, pr.preco_unitario from cotacao_itens i join cotacao_precos pr on pr.cotacao_item_id = i.id and pr.proposta_id = p.id
            where i.cotacao_id = p_cotacao loop
    insert into oc_itens (oc_id, cotacao_item_id, solicitacao_item_id, insumo_id, descricao, unidade, quantidade, preco_unitario)
    values (v_oc, r.id, r.solicitacao_item_id, r.insumo_id, r.descricao, r.unidade, r.quantidade, r.preco_unitario);
    if r.solicitacao_item_id is not null then
      update solicitacao_itens set status = 'compra_autorizada', oc_id = v_oc, fornecedor = (select nome from fornecedores where id = p.fornecedor_id),
             previsao_entrega = v_prev where id = r.solicitacao_item_id;
      perform _item_evento(r.solicitacao_item_id, 'em_cotacao', 'compra_autorizada', r.quantidade, format('Compra aprovada pelo %s — %s', v_quem, _cod_oc(v_num)));
      select s.* into v_sol from solicitacoes s join solicitacao_itens si on si.solicitacao_id = s.id where si.id = r.solicitacao_item_id;
      perform _sol_atualizar_status(v_sol.id);
      if v_prev > (select data_necessidade from solicitacao_itens where id = r.solicitacao_item_id) then
        perform _notificar_engenheiros(v_sol.obra_id, 'risco_atraso_material', 'Risco de atraso: ' || r.descricao,
          format('%s • entrega prevista %s, necessário em %s', _cod_oc(v_num), to_char(v_prev,'DD/MM/YYYY'),
                 to_char((select data_necessidade from solicitacao_itens where id = r.solicitacao_item_id),'DD/MM/YYYY')),
          '/suprimentos/ordens/' || v_oc, 'risco:' || r.solicitacao_item_id || ':' || v_prev);
        perform _notificar(v_sol.solicitante_id, 'risco_atraso_material', 'Material pode atrasar: ' || r.descricao,
          'Entrega prevista para ' || to_char(v_prev,'DD/MM/YYYY'), '/materiais/' || v_sol.id, 'risco:' || r.solicitacao_item_id || ':' || v_prev);
      end if;
    end if;
  end loop;

  update cotacoes set status = 'aprovada', decidido_por = auth.uid(), decidido_em = now(), parecer = p_parecer where id = p_cotacao;
  perform _oc_evento(v_oc, 'emitida', format('OC emitida após aprovação do %s (%s). Fornecedor: %s. Valor: %s',
    v_quem, (select nome from perfis where id = auth.uid()), (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total)));
  -- OC emitida: comprador e financeiro compram/pagam; almoxarifado acompanha
  perform _notificar_papeis(array['compras','financeiro','almoxarifado'], 'oc_emitida', 'Comprar: ordem de compra ' || _cod_oc(v_num),
    format('%s • %s • %s • aprovada pelo %s', coalesce((select nome from obras where id = c.obra_id), 'Depósito central'),
           (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total), v_quem),
    '/suprimentos/ordens/' || v_oc);
  if c.obra_id is not null then
    perform _notificar_engenheiros(c.obra_id, 'oc_emitida', 'Compra aprovada: ' || _cod_oc(v_num),
      'Previsão de entrega ' || to_char(v_prev,'DD/MM/YYYY'), '/suprimentos/ordens/' || v_oc);
  end if;
  if not tem_papel('admin') then
    perform _alerta_fluxo('oc_emitida', 'Compra aprovada pelo coordenador: ' || _cod_oc(v_num),
      format('%s • %s • %s', coalesce((select nome from obras where id = c.obra_id), 'Depósito central'),
             (select nome from fornecedores where id = p.fornecedor_id), _brl(p.valor_total)),
      '/suprimentos/ordens/' || v_oc, 'fluxo:oc:' || v_oc || ':emitida');
  end if;
  return v_oc;
end $$;

-- ---------- Alertas automáticos das etapas ----------
-- Pedido criado / aprovado / rejeitado
create or replace function _tg_alerta_solicitacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_obra text := (select nome from obras where id = new.obra_id); v_quem text := (select nome from perfis where id = new.solicitante_id);
begin
  if tg_op = 'INSERT' then
    if new.status = 'aguardando_aprovacao' then
      perform _alerta_fluxo('material_aprovacao', 'Aprovar pedido de material ' || _cod_sm(new.numero),
        format('%s • %s • necessário em %s', v_obra, v_quem, to_char(new.data_necessidade,'DD/MM/YYYY')),
        '/materiais/' || new.id, 'fluxo:sm:' || new.id || ':aprovar');
    else
      perform _alerta_fluxo('material_novo', 'Novo pedido de material ' || _cod_sm(new.numero),
        format('%s • %s • necessário em %s • já segue para o almoxarifado', v_obra, v_quem, to_char(new.data_necessidade,'DD/MM/YYYY')),
        '/materiais/' || new.id, 'fluxo:sm:' || new.id || ':novo');
    end if;
  elsif new.status is distinct from old.status and old.status = 'aguardando_aprovacao' and new.status in ('aprovada','rejeitada') then
    perform _alerta_fluxo('material_' || new.status, 'Pedido ' || _cod_sm(new.numero) || case when new.status = 'aprovada' then ' aprovado' else ' rejeitado' end,
      format('%s • por %s%s', v_obra, coalesce((select nome from perfis where id = auth.uid()), '—'), coalesce(' • ' || new.parecer, '')),
      '/materiais/' || new.id, 'fluxo:sm:' || new.id || ':' || new.status);
  end if;
  return null;
end $$;
create trigger alerta_solicitacao after insert or update of status on solicitacoes
  for each row execute function _tg_alerta_solicitacao();

-- Itens: estoque, cotação, entrega
create or replace function _tg_alerta_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare s solicitacoes; v_tit text; v_msg text;
begin
  if new.status is not distinct from old.status then return null; end if;
  select * into s from solicitacoes where id = new.solicitacao_id;
  v_tit := case new.status
    when 'disponivel_estoque' then 'Separado do estoque — '
    when 'em_cotacao'         then 'Sem estoque, foi para cotação — '
    when 'em_transporte'      then 'Material a caminho — '
    when 'entregue'           then 'Material entregue na obra — '
    when 'cancelado'          then 'Item cancelado — '
    else null end;
  if v_tit is null then return null; end if;
  -- um alerta por pedido e etapa (o pedido com vários itens não gera um alerta por item)
  v_msg := format('%s%s (%s %s) • %s', new.material, case when new.modalidade = 'locacao' then ' — locação' else '' end,
                  trim_scale(new.quantidade), new.unidade, coalesce((select nome from obras where id = s.obra_id), ''));
  perform _alerta_fluxo('fluxo_material', v_tit || _cod_sm(s.numero), v_msg, '/materiais/' || s.id,
    'fluxo:sm:' || s.id || ':' || new.status, array[s.solicitante_id]);
  return null;
end $$;
create trigger alerta_item after update of status on solicitacao_itens
  for each row execute function _tg_alerta_item();

-- Cotação aberta / cancelada
create or replace function _tg_alerta_cotacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform _alerta_fluxo('cotacao_aberta', 'Cotação aberta ' || _cod_cot(new.numero),
      format('%s • comprador: %s', coalesce((select nome from obras where id = new.obra_id), 'Depósito central'),
             (select nome from perfis where id = new.criado_por)),
      '/suprimentos/cotacoes/' || new.id, 'fluxo:cot:' || new.id || ':aberta');
  elsif new.status = 'cancelada' and old.status <> 'cancelada' then
    perform _alerta_fluxo('cotacao_cancelada', 'Cotação cancelada ' || _cod_cot(new.numero),
      coalesce(new.parecer, 'Itens voltaram para a fila'), '/suprimentos/cotacoes/' || new.id, 'fluxo:cot:' || new.id || ':cancelada');
  end if;
  return null;
end $$;
create trigger alerta_cotacao after insert or update of status on cotacoes
  for each row execute function _tg_alerta_cotacao();

-- OC: paga/faturada, pronta, recebida, cancelada
create or replace function _tg_alerta_oc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tit text; v_sm uuid[];
begin
  if new.status is not distinct from old.status and new.pagamento is not distinct from old.pagamento then return null; end if;
  v_tit := case
    when new.pagamento is distinct from old.pagamento and new.pagamento is not null then
      case new.pagamento when 'pago' then 'OC paga: ' else 'OC faturada: ' end
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
create trigger alerta_oc after update of status, pagamento on ordens_compra
  for each row execute function _tg_alerta_oc();

revoke execute on function _alerta_fluxo(text, text, text, text, text, uuid[]) from public, anon, authenticated;
revoke execute on function _tg_alerta_solicitacao() from public, anon, authenticated;
revoke execute on function _tg_alerta_item() from public, anon, authenticated;
revoke execute on function _tg_alerta_cotacao() from public, anon, authenticated;
revoke execute on function _tg_alerta_oc() from public, anon, authenticated;
revoke execute on function compras_definir_limite(numeric) from public, anon;
revoke execute on function perfil_definir_coordenador(uuid, boolean) from public, anon;
revoke execute on function pode_aprovar_compra(numeric) from public, anon;
grant execute on function compras_definir_limite(numeric) to authenticated;
grant execute on function perfil_definir_coordenador(uuid, boolean) to authenticated;
grant execute on function pode_aprovar_compra(numeric) to authenticated;
