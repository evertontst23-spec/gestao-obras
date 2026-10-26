-- =====================================================================
-- 0018 — Pedido de material com código padronizado
--  * Ao pedir um material, o código traz o nome e a unidade do cadastro de insumos.
--  * Material que ainda não existe no cadastro é cadastrado sozinho: com o código digitado
--    ou, sem código, com um código automático (M0001, M0002…). Fica marcado para o compras revisar.
-- =====================================================================
alter table insumos add column revisar boolean not null default false;
create sequence if not exists insumo_auto_seq;

create or replace function _codigo_insumo_auto() returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  loop
    v := 'M' || lpad(nextval('insumo_auto_seq')::text, 4, '0');
    exit when not exists (select 1 from insumos where upper(codigo) = v);
  end loop;
  return v;
end $$;

create or replace function _tg_itens_insumo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v insumos; v_cod text; v_desc text;
begin
  if new.insumo_id is null then
    if position(' — ' in new.material) > 0 then
      v_cod  := upper(trim(split_part(new.material, ' — ', 1)));
      v_desc := regexp_replace(trim(substr(new.material, position(' — ' in new.material) + 3)), '\s+', ' ', 'g');
    else
      v_desc := regexp_replace(trim(new.material), '\s+', ' ', 'g');
    end if;
    select * into v from insumos where ativo and (
        (v_cod is not null and upper(codigo) = v_cod)
     or (v_cod is null and lower(descricao) = lower(v_desc)))
     order by revisar, criado_em limit 1;   -- prefere o cadastro feito pelo compras ao automático
    if not found and coalesce(v_desc, '') <> '' then
      -- material novo: entra no cadastro de insumos para padronizar os próximos pedidos
      insert into insumos (codigo, descricao, unidade, categoria, revisar, criado_por)
      values (coalesce(nullif(v_cod, ''), _codigo_insumo_auto()), v_desc, coalesce(nullif(trim(new.unidade), ''), 'un'),
              'Material', true, auth.uid())
      returning * into v;
    end if;
    if v.id is not null then
      new.insumo_id := v.id;
      new.material := v.descricao;
      new.unidade := coalesce(nullif(trim(new.unidade), ''), v.unidade);
    end if;
  end if;
  return new;
end $$;

-- Insumos cadastrados pelos pedidos ainda não têm estoque lançado: o almoxarifado continua
-- informando o que tem na mão, como antes. O saldo do sistema só vale para quem já tem movimentação.
create or replace function _estoque_controlado(p_insumo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from estoque_movimentos where insumo_id = p_insumo)
$$;

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

  -- estoque só é conferido para insumos com controle de estoque (que já tiveram alguma entrada)
  if i.insumo_id is not null and p_disponivel > 0 and _estoque_controlado(i.insumo_id) then
    -- prioriza o estoque da própria obra; depois o depósito central
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
    perform _item_evento(p_item, i.status, 'em_cotacao', 0, coalesce(p_observacao, 'Sem estoque — encaminhado para compras'));
  else
    update solicitacao_itens set status = 'disponivel_estoque', quantidade = p_disponivel, origem_estoque = true, estoque_obra_id = v_local where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel,
      format('Estoque parcial: %s de %s %s separados', trim_scale(p_disponivel), trim_scale(i.quantidade), i.unidade));
    insert into solicitacao_itens (solicitacao_id, item_origem_id, insumo_id, material, especificacao, unidade, quantidade, data_necessidade, status)
    values (i.solicitacao_id, p_item, i.insumo_id, i.material, i.especificacao, i.unidade, i.quantidade - p_disponivel, i.data_necessidade, 'em_cotacao')
    returning id into v_novo;
    perform _item_evento(v_novo, 'aprovado', 'em_cotacao', i.quantidade - p_disponivel, 'Saldo sem estoque encaminhado para compras');
  end if;

  if p_disponivel < i.quantidade then
    perform _notificar_papel('compras', 'compra_necessaria', 'Cotar: ' || i.material,
      format('%s • %s %s • necessário em %s', _cod_sm(s.numero), trim_scale(i.quantidade - p_disponivel), i.unidade,
             to_char(i.data_necessidade,'DD/MM/YYYY')), '/suprimentos/cotacoes/nova');
  end if;
  perform _sol_atualizar_status(i.solicitacao_id);
end $$;

create or replace function _tg_entregas_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens;
begin
  select * into i from solicitacao_itens where id = new.item_id;
  if i.oc_id is not null and i.status in ('compra_autorizada','comprado','em_transporte') then
    raise exception 'Este item foi comprado pela % e ainda não chegou. Lance o recebimento da OC antes de enviar para a obra.',
      (select _cod_oc(numero) from ordens_compra where id = i.oc_id);
  end if;
  if i.insumo_id is not null and i.origem_estoque and _estoque_controlado(i.insumo_id) then
    perform _movimentar(i.estoque_obra_id, i.insumo_id, 'saida', new.quantidade_enviada, 'envio_solicitacao', new.id,
      'Envio para a obra — ' || (select _cod_sm(numero) from solicitacoes where id = i.solicitacao_id));
  end if;
  return new;
end $$;

revoke execute on function _estoque_controlado(uuid) from public, anon, authenticated;
revoke execute on function _codigo_insumo_auto() from public, anon, authenticated;
revoke execute on function _tg_itens_insumo() from public, anon, authenticated;
