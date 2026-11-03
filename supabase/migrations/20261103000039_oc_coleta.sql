-- =====================================================================
-- 0039 — Compras: material coletado e entrada no estoque
--  * Registrar a coleta (retirada pelo funcionário) ou a saída para entrega: quem pegou, quando, foto do canhoto/NF.
--    Os itens do pedido passam para "em transporte" e o almoxarifado/compras é avisado para dar entrada.
--  * Entrada no estoque (recebimento): agora também o comprador pode lançar.
--  * Desfazer a coleta, se foi marcada por engano.
-- =====================================================================
alter table ordens_compra add column coletado_em timestamptz, add column coletado_por text, add column coleta_obs text,
  add column coleta_foto text, add column coleta_registrada_por uuid references perfis(id);

create or replace function oc_registrar_coleta(p_oc uuid, p_quem text, p_quando timestamptz default null, p_obs text default null, p_foto text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o ordens_compra; v_quem text;
begin
  select * into o from ordens_compra where id = p_oc for update;
  if not found then raise exception 'OC não encontrada'; end if;
  if not (tem_papel('compras','almoxarifado','financeiro','admin') or (o.obra_id is not null and membro_obra(o.obra_id) and tem_papel('engenheiro','encarregado'))) then
    raise exception 'Sem permissão para registrar a coleta desta OC';
  end if;
  if o.status not in ('emitida','pronta_coleta') then raise exception 'Esta OC não está aguardando coleta/entrega'; end if;
  if o.coletado_em is not null then raise exception 'A coleta desta OC já foi registrada'; end if;
  v_quem := coalesce(nullif(trim(p_quem), ''), o.retirante);
  if o.modalidade = 'retirada' and coalesce(v_quem, '') = '' then raise exception 'Informe quem coletou o material'; end if;
  if p_quando is not null and p_quando > now() + interval '5 minutes' then raise exception 'A data da coleta não pode ser no futuro'; end if;
  update ordens_compra set coletado_em = coalesce(p_quando, now()), coletado_por = v_quem, coleta_obs = nullif(trim(p_obs), ''),
         coleta_foto = nullif(p_foto, ''), coleta_registrada_por = auth.uid() where id = p_oc;
  update solicitacao_itens set status = 'em_transporte' where oc_id = p_oc and status in ('compra_autorizada','comprado');
  perform _oc_evento(p_oc, 'coletado', format('%s%s%s',
    case when o.modalidade = 'retirada' then 'Material coletado por ' || v_quem else 'Material saiu para entrega' || coalesce(' (' || v_quem || ')', '') end,
    ' em ' || to_char(coalesce(p_quando, now()) at time zone 'America/Recife', 'DD/MM/YYYY HH24:MI'), coalesce(' — ' || nullif(trim(p_obs), ''), '')));
  perform _notificar_papeis(array['almoxarifado','compras'], 'oc_coletada', 'Dar entrada: ' || _cod_oc(o.numero) || ' coletada',
    format('%s • %s — lance a entrada no estoque quando o material chegar', coalesce((select nome from obras where id = o.obra_id), 'Depósito central'),
           (select nome from fornecedores where id = o.fornecedor_id)),
    '/suprimentos/ordens/' || p_oc);
end $$;

create or replace function oc_desfazer_coleta(p_oc uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordens_compra; v_mot text := _motivo(p_motivo);
begin
  if not tem_papel('compras','almoxarifado','admin') then raise exception 'Apenas compras, almoxarifado ou diretoria desfazem a coleta'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.coletado_em is null then raise exception 'Esta OC não tem coleta registrada'; end if;
  if o.status not in ('emitida','pronta_coleta') then raise exception 'Já houve entrada no estoque: estorne o recebimento antes'; end if;
  update ordens_compra set coletado_em = null, coletado_por = null, coleta_obs = null, coleta_foto = null, coleta_registrada_por = null where id = p_oc;
  update solicitacao_itens set status = case when o.pagamento is not null then 'comprado'::status_material else 'compra_autorizada'::status_material end
   where oc_id = p_oc and status = 'em_transporte';
  perform _oc_evento(p_oc, 'coleta_desfeita', 'Coleta desfeita: ' || v_mot);
end $$;

-- Entrada no estoque: almoxarifado, compras ou diretoria
create or replace function oc_receber(p_oc uuid, p_itens jsonb, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o ordens_compra; it jsonb; oi oc_itens; q numeric; si solicitacao_itens; v_sol solicitacoes; v_txt text := '';
begin
  if not tem_papel('almoxarifado','compras','admin') then raise exception 'Apenas almoxarifado, compras ou diretoria dão entrada no material'; end if;
  select * into o from ordens_compra where id = p_oc for update;
  if not found or o.status not in ('emitida','pronta_coleta','recebida_parcial') then raise exception 'OC não está aguardando recebimento'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    q := coalesce(nullif(it->>'quantidade','')::numeric, 0);
    continue when q = 0;
    select * into oi from oc_itens where id = (it->>'oc_item_id')::uuid and oc_id = p_oc for update;
    if not found then raise exception 'Item não pertence à OC'; end if;
    if q < 0 or oi.quantidade_recebida + q > oi.quantidade then
      raise exception 'Quantidade recebida de "%" excede o pedido (restam %)', oi.descricao, trim_scale(oi.quantidade - oi.quantidade_recebida);
    end if;
    update oc_itens set quantidade_recebida = quantidade_recebida + q where id = oi.id;
    v_txt := v_txt || format('%s %s %s; ', trim_scale(q), oi.unidade, oi.descricao);
    if oi.insumo_id is not null then
      perform _movimentar(o.obra_id, oi.insumo_id, 'entrada', q, 'recebimento_oc', p_oc, _cod_oc(o.numero) || coalesce(' NF ' || o.nf_numero, ''));
    end if;
    -- item pedido pela obra: quando chega tudo, fica disponível para envio/entrega ao encarregado
    if oi.solicitacao_item_id is not null and oi.quantidade_recebida + q >= oi.quantidade then
      select * into si from solicitacao_itens where id = oi.solicitacao_item_id;
      update solicitacao_itens set status = 'disponivel_estoque', origem_estoque = (oi.insumo_id is not null),
             estoque_obra_id = o.obra_id where id = si.id;
      perform _item_evento(si.id, si.status, 'disponivel_estoque', q, 'Recebido na obra — ' || _cod_oc(o.numero));
      select * into v_sol from solicitacoes where id = si.solicitacao_id;
      perform _notificar(v_sol.solicitante_id, 'material_recebido_obra', 'Chegou: ' || si.material,
        format('%s %s recebidos pelo almoxarifado (%s)', trim_scale(oi.quantidade), oi.unidade, _cod_oc(o.numero)), '/materiais/' || v_sol.id);
      perform _sol_atualizar_status(v_sol.id);
    end if;
  end loop;
  if v_txt = '' then raise exception 'Informe a quantidade recebida de pelo menos um item'; end if;
  update ordens_compra set status = case when not exists (select 1 from oc_itens where oc_id = p_oc and quantidade_recebida < quantidade)
                                         then 'recebida' else 'recebida_parcial' end where id = p_oc;
  perform _oc_evento(p_oc, 'recebimento', 'Recebido: ' || v_txt || coalesce(' Obs.: ' || p_observacao, ''));
  -- "o que chegar na obra o almoxarifado lança e todos visualizam"
  perform _notificar_papeis(array['compras','financeiro'], 'oc_recebida', 'Material recebido — ' || _cod_oc(o.numero), v_txt, '/suprimentos/ordens/' || p_oc);
  if o.obra_id is not null then
    perform _notificar_engenheiros(o.obra_id, 'oc_recebida', 'Material recebido — ' || _cod_oc(o.numero), v_txt, '/suprimentos/ordens/' || p_oc);
  end if;
end $$;

revoke execute on function oc_registrar_coleta(uuid, text, timestamptz, text, text) from public, anon;
revoke execute on function oc_desfazer_coleta(uuid, text) from public, anon;
grant execute on function oc_registrar_coleta(uuid, text, timestamptz, text, text) to authenticated;
grant execute on function oc_desfazer_coleta(uuid, text) to authenticated;
