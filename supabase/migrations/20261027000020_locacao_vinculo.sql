-- =====================================================================
-- 0020 — Pedido de material: compra ou locação, vínculo obrigatório e encarregado de campo
--  * Cada item do pedido é de COMPRA ou de LOCAÇÃO. Locação tem período (início e fim) e
--    entra no controle de locações: ativa, vencendo, vencida, devolvida, com prorrogação.
--  * O pedido precisa estar ligado a uma tarefa da planilha da obra. Sem vínculo (uso geral),
--    a observação passa a ser obrigatória, explicando para que é o material.
--  * Tarefa ganha o encarregado de campo (funcionário cadastrado), além do responsável no sistema.
-- =====================================================================

-- ---------- Tarefas: encarregado de campo ----------
alter table tarefas add column encarregado_func_id uuid references funcionarios(id);

-- ---------- Itens: compra ou locação ----------
alter table solicitacao_itens
  add column modalidade text not null default 'compra',
  add column locacao_inicio date,
  add column locacao_fim date,
  add column devolvido_em date,
  add column devolucao_obs text,
  add constraint itens_modalidade_ck check (modalidade in ('compra','locacao')),
  add constraint itens_locacao_ck check (modalidade = 'compra'
    or (locacao_inicio is not null and locacao_fim is not null and locacao_fim >= locacao_inicio));

create or replace function criar_solicitacao(p_obra uuid, p_tarefa uuid, p_data_necessidade date, p_prioridade prioridade,
                                             p_justificativa text, p_observacoes text, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_obra obras; v_papel papel_usuario := meu_papel(); v_id uuid; v_num bigint; v_aprovar boolean;
        it jsonb; v_item uuid; v_status status_material; v_tarefa tarefas; v_mod text; v_ini date; v_fim date;
begin
  select * into v_obra from obras where id = p_obra;
  if not found then raise exception 'Obra não encontrada'; end if;
  if not membro_obra(p_obra) or v_papel not in ('encarregado','engenheiro','admin','almoxarifado') then
    raise exception 'Sem permissão para solicitar materiais nesta obra';
  end if;
  if v_obra.situacao in ('concluida','cancelada') then raise exception 'Obra encerrada'; end if;
  if p_tarefa is not null then
    select * into v_tarefa from tarefas where id = p_tarefa;
    if not found or v_tarefa.obra_id <> p_obra then raise exception 'A tarefa não pertence a esta obra'; end if;
    if v_tarefa.status = 'aprovado' then raise exception 'Tarefa já finalizada'; end if;
  elsif coalesce(length(trim(p_observacoes)), 0) < 5 then
    raise exception 'Pedido sem vínculo com tarefa: explique na observação para que é o material';
  end if;
  if p_data_necessidade is null or p_data_necessidade < hoje() then
    raise exception 'Informe a data em que o material será necessário (hoje ou depois)';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua pelo menos um material';
  end if;

  v_aprovar := v_obra.exige_aprovacao_material and v_papel not in ('engenheiro','admin');
  v_status  := case when v_aprovar then 'aguardando_aprovacao' else 'aprovado' end;

  insert into solicitacoes (obra_id, tarefa_id, solicitante_id, data_necessidade, prioridade, justificativa, observacoes,
                            status, aprovado_por, aprovado_em)
  values (p_obra, p_tarefa, auth.uid(), p_data_necessidade, coalesce(p_prioridade,'normal'), p_justificativa, p_observacoes,
          case when v_aprovar then 'aguardando_aprovacao'::status_solicitacao else 'aprovada'::status_solicitacao end,
          case when v_aprovar then null else auth.uid() end, case when v_aprovar then null else now() end)
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_itens) loop
    if coalesce(trim(it->>'material'),'') = '' or coalesce(trim(it->>'unidade'),'') = ''
       or coalesce((it->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Cada material precisa de descrição, unidade e quantidade maior que zero';
    end if;
    v_mod := coalesce(nullif(it->>'modalidade', ''), 'compra');
    if v_mod not in ('compra','locacao') then raise exception 'Modalidade inválida: use compra ou locação'; end if;
    v_ini := nullif(it->>'locacao_inicio', '')::date;
    v_fim := nullif(it->>'locacao_fim', '')::date;
    if v_mod = 'locacao' then
      if v_ini is null or v_fim is null then
        raise exception 'Informe o período da locação (início e fim) de %', trim(it->>'material');
      end if;
      if v_fim < v_ini then raise exception 'O fim da locação de % é antes do início', trim(it->>'material'); end if;
    else
      v_ini := null; v_fim := null;
    end if;
    insert into solicitacao_itens (solicitacao_id, material, especificacao, unidade, quantidade, data_necessidade, status,
                                   modalidade, locacao_inicio, locacao_fim)
    values (v_id, trim(it->>'material'), nullif(trim(it->>'especificacao'),''), trim(it->>'unidade'),
            (it->>'quantidade')::numeric, coalesce((it->>'data_necessidade')::date, p_data_necessidade), v_status,
            v_mod, v_ini, v_fim)
    returning id into v_item;
    perform _item_evento(v_item, null, 'solicitado', (it->>'quantidade')::numeric,
      case when v_mod = 'locacao' then format('Locação solicitada (%s a %s)', to_char(v_ini,'DD/MM/YYYY'), to_char(v_fim,'DD/MM/YYYY'))
           else 'Material solicitado' end);
    if not v_aprovar then
      perform _item_evento(v_item, 'solicitado', 'aprovado', null, 'Aprovado automaticamente (solicitante com alçada)');
    end if;
  end loop;

  if p_tarefa is not null then
    perform _evento(p_tarefa, 'material_solicitado', null, null,
      format('%s: %s item(ns) para %s', _cod_sm(v_num), jsonb_array_length(p_itens), to_char(p_data_necessidade,'DD/MM/YYYY')),
      jsonb_build_object('solicitacao_id', v_id));
  end if;

  if v_aprovar then
    perform _notificar_engenheiros(p_obra, 'material_aprovacao', 'Aprovar pedido de material ' || _cod_sm(v_num),
      format('%s • %s • necessário em %s', v_obra.nome, (select nome from perfis where id = auth.uid()),
             to_char(p_data_necessidade,'DD/MM/YYYY')), '/materiais/' || v_id);
  else
    perform _notificar_papel('almoxarifado', 'material_aprovado', 'Novo pedido aprovado ' || _cod_sm(v_num),
      format('%s • verificar estoque • necessário em %s', v_obra.nome, to_char(p_data_necessidade,'DD/MM/YYYY')),
      '/materiais/' || v_id);
  end if;
  return v_id;
end $$;

-- Desmembramento estoque/compra mantém a modalidade e o período da locação
create or replace function item_verificar_estoque(p_item uuid, p_disponivel numeric, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes; v_novo uuid; v_local uuid; v_saldo numeric;
begin
  if meu_papel() not in ('almoxarifado','admin') then raise exception 'Apenas o almoxarifado registra a verificação de estoque'; end if;
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if i.status <> 'aprovado' then raise exception 'O item precisa estar aprovado para verificação de estoque'; end if;
  if p_disponivel is null or p_disponivel < 0 or p_disponivel > i.quantidade then
    raise exception 'Quantidade disponível deve estar entre 0 e %', trim_scale(i.quantidade);
  end if;
  select * into s from solicitacoes where id = i.solicitacao_id;

  if i.insumo_id is not null and p_disponivel > 0 and _estoque_controlado(i.insumo_id) then
    if saldo_estoque(i.insumo_id, s.obra_id) >= p_disponivel then v_local := s.obra_id;
    elsif saldo_estoque(i.insumo_id, null) >= p_disponivel then v_local := null;
    else
      v_saldo := greatest(saldo_estoque(i.insumo_id, s.obra_id), saldo_estoque(i.insumo_id, null));
      raise exception 'O sistema registra só % % disponíveis num mesmo local (obra ou depósito central). Ajuste a quantidade ou lance a entrada no estoque.',
        trim_scale(v_saldo), i.unidade;
    end if;
  end if;

  if p_disponivel = i.quantidade then
    update solicitacao_itens set status = 'disponivel_estoque', origem_estoque = true, estoque_obra_id = v_local where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel, coalesce(p_observacao, 'Disponível em estoque — separado'));
  elsif p_disponivel = 0 then
    update solicitacao_itens set status = 'em_cotacao' where id = p_item;
    perform _item_evento(p_item, i.status, 'em_cotacao', 0, coalesce(p_observacao,
      case when i.modalidade = 'locacao' then 'Sem equipamento próprio — encaminhado para cotação de locação'
           else 'Sem estoque — encaminhado para cotação' end));
  else
    update solicitacao_itens set status = 'disponivel_estoque', quantidade = p_disponivel, origem_estoque = true, estoque_obra_id = v_local where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel,
      format('Estoque parcial: %s de %s %s separados', trim_scale(p_disponivel), trim_scale(i.quantidade), i.unidade));
    insert into solicitacao_itens (solicitacao_id, item_origem_id, insumo_id, material, especificacao, unidade, quantidade, data_necessidade, status,
                                   modalidade, locacao_inicio, locacao_fim)
    values (i.solicitacao_id, p_item, i.insumo_id, i.material, i.especificacao, i.unidade, i.quantidade - p_disponivel, i.data_necessidade, 'em_cotacao',
            i.modalidade, i.locacao_inicio, i.locacao_fim)
    returning id into v_novo;
    perform _item_evento(v_novo, 'aprovado', 'em_cotacao', i.quantidade - p_disponivel, 'Saldo sem estoque encaminhado para cotação');
  end if;

  if p_disponivel < i.quantidade then
    perform _notificar_papel('compras', 'compra_necessaria',
      case when i.modalidade = 'locacao' then 'Cotar locação: ' else 'Cotar: ' end || i.material,
      format('%s • %s %s • necessário em %s%s', _cod_sm(s.numero), trim_scale(i.quantidade - p_disponivel), i.unidade,
             to_char(i.data_necessidade,'DD/MM/YYYY'),
             case when i.modalidade = 'locacao' then format(' • locação %s a %s', to_char(i.locacao_inicio,'DD/MM/YYYY'), to_char(i.locacao_fim,'DD/MM/YYYY')) else '' end),
      '/suprimentos/cotacoes/nova');
  end if;
  perform _sol_atualizar_status(i.solicitacao_id);
end $$;

-- ---------- Controle de locações ----------
create or replace function _pode_locacao(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tem_papel('compras','almoxarifado','admin')
      or gere_obra((select s.obra_id from solicitacao_itens i join solicitacoes s on s.id = i.solicitacao_id where i.id = p_item))
$$;

create or replace function locacao_devolver(p_item uuid, p_data date, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens;
begin
  select * into i from solicitacao_itens where id = p_item for update;
  if not found or i.modalidade <> 'locacao' then raise exception 'Item de locação não encontrado'; end if;
  if not _pode_locacao(p_item) then raise exception 'Sem permissão para registrar a devolução'; end if;
  if i.devolvido_em is not null then raise exception 'Devolução já registrada em %', to_char(i.devolvido_em,'DD/MM/YYYY'); end if;
  if p_data is null or p_data > hoje() then raise exception 'Informe a data da devolução (hoje ou antes)'; end if;
  if p_data < i.locacao_inicio then raise exception 'A devolução não pode ser antes do início da locação'; end if;
  update solicitacao_itens set devolvido_em = p_data, devolucao_obs = nullif(trim(p_obs), '') where id = p_item;
  perform _item_evento(p_item, i.status, i.status, null,
    format('Locação devolvida em %s%s', to_char(p_data,'DD/MM/YYYY'), coalesce(' — ' || nullif(trim(p_obs), ''), '')));
end $$;

create or replace function locacao_prorrogar(p_item uuid, p_fim date, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens;
begin
  select * into i from solicitacao_itens where id = p_item for update;
  if not found or i.modalidade <> 'locacao' then raise exception 'Item de locação não encontrado'; end if;
  if not _pode_locacao(p_item) then raise exception 'Sem permissão para prorrogar a locação'; end if;
  if i.devolvido_em is not null then raise exception 'Locação já devolvida'; end if;
  if p_fim is null or p_fim <= i.locacao_fim then raise exception 'A nova data de fim precisa ser depois de %', to_char(i.locacao_fim,'DD/MM/YYYY'); end if;
  update solicitacao_itens set locacao_fim = p_fim where id = p_item;
  perform _item_evento(p_item, i.status, i.status, null,
    format('Locação prorrogada: fim %s → %s%s', to_char(i.locacao_fim,'DD/MM/YYYY'), to_char(p_fim,'DD/MM/YYYY'),
           coalesce(' — ' || nullif(trim(p_obs), ''), '')));
end $$;

revoke execute on function _pode_locacao(uuid) from public, anon;
revoke execute on function locacao_devolver(uuid, date, text) from public, anon;
revoke execute on function locacao_prorrogar(uuid, date, text) from public, anon;
grant execute on function locacao_devolver(uuid, date, text) to authenticated;
grant execute on function locacao_prorrogar(uuid, date, text) to authenticated;

-- ---------- v_itens com a modalidade e a situação da locação ----------
drop view if exists v_itens;
create view v_itens with (security_invoker = true) as
select i.*,
       s.numero as solicitacao_numero, 'SM-' || lpad(s.numero::text, 5, '0') as solicitacao_codigo,
       s.obra_id, s.tarefa_id, s.solicitante_id, s.prioridade, s.status as solicitacao_status,
       o.codigo as obra_codigo, o.nome as obra_nome,
       t.numero as tarefa_numero, t.titulo as tarefa_titulo,
       ps.nome as solicitante_nome,
       (i.status not in ('entregue','cancelado') and i.previsao_entrega is not null
          and i.previsao_entrega > i.data_necessidade) as risco_atraso,
       (i.status in ('em_cotacao','compra_autorizada','comprado','em_transporte')
          and i.previsao_entrega is not null and i.previsao_entrega < hoje()) as entrega_atrasada,
       (i.status not in ('entregue','cancelado') and i.data_necessidade < hoje()) as necessidade_vencida,
       (i.data_necessidade - hoje()) as dias_para_necessidade,
       case when i.modalidade <> 'locacao' then null
            when i.status = 'cancelado' then 'cancelada'
            when i.devolvido_em is not null then 'devolvida'
            when i.status not in ('entregue','parcialmente_entregue') then 'a_contratar'
            when i.locacao_fim < hoje() then 'vencida'
            when i.locacao_fim - hoje() <= 3 then 'vencendo'
            else 'ativa' end as locacao_situacao,
       case when i.modalidade = 'locacao' then i.locacao_fim - hoje() end as locacao_dias_restantes,
       case when i.modalidade = 'locacao' then i.locacao_fim - i.locacao_inicio + 1 end as locacao_dias
  from solicitacao_itens i
  join solicitacoes s on s.id = i.solicitacao_id
  join obras o on o.id = s.obra_id
  left join tarefas t on t.id = s.tarefa_id
  left join perfis ps on ps.id = s.solicitante_id;
grant select on v_itens to authenticated;
