-- =====================================================================
-- 0055 — Valor do material transferido entre obras (centros de custo)
--  * Custo unitário do insumo = média ponderada das compras (OC) da obra de origem;
--    sem compra nessa obra → média das compras de todas as obras; sem OC → última cotação;
--    sem nada → valor informado na hora da transferência.
--  * O valor fica gravado no próprio movimento (saída da origem e entrada no destino).
--  * Diretoria e financeiro são avisados: "30 sc Cimento — Praça da Foice → Praça da Bandeira • R$ 1.050,00".
-- =====================================================================
alter table estoque_movimentos add column valor_unitario numeric(14,4), add column valor_total numeric(14,2),
  add column custo_fonte text check (custo_fonte in ('oc_obra','oc_geral','cotacao','informado'));

-- custo médio de um insumo, a partir da obra de origem
create or replace function custo_insumo(p_insumo uuid, p_obra uuid, out valor numeric, out fonte text)
language plpgsql stable security definer set search_path = public as $$
begin
  select sum(oi.preco_unitario * greatest(oi.quantidade_recebida, oi.quantidade)) / nullif(sum(greatest(oi.quantidade_recebida, oi.quantidade)), 0)
    into valor
    from oc_itens oi join ordens_compra o on o.id = oi.oc_id
   where oi.insumo_id = p_insumo and o.status <> 'cancelada' and o.obra_id is not distinct from p_obra;
  if valor is not null then fonte := 'oc_obra'; return; end if;
  select sum(oi.preco_unitario * greatest(oi.quantidade_recebida, oi.quantidade)) / nullif(sum(greatest(oi.quantidade_recebida, oi.quantidade)), 0)
    into valor
    from oc_itens oi join ordens_compra o on o.id = oi.oc_id
   where oi.insumo_id = p_insumo and o.status <> 'cancelada';
  if valor is not null then fonte := 'oc_geral'; return; end if;
  select cp.preco_unitario into valor
    from cotacao_precos cp join cotacao_itens ci on ci.id = cp.cotacao_item_id join cotacao_propostas pr on pr.id = cp.proposta_id
   where ci.insumo_id = p_insumo and cp.preco_unitario > 0
   order by pr.criado_em desc limit 1;
  if valor is not null then fonte := 'cotacao'; end if;
end $$;

-- grava o valor no movimento de transferência (o movimento é imutável: só no insert)
create or replace function _tg_mov_valor() returns trigger language plpgsql set search_path = public as $$
declare v_inf numeric := nullif(current_setting('app.mov_valor', true), '')::numeric; c record; v_origem uuid;
begin
  if new.origem <> 'transferencia' then return new; end if;
  v_origem := case when new.tipo = 'saida' then new.obra_id else new.referencia end;
  if v_inf is not null then
    new.valor_unitario := v_inf; new.custo_fonte := 'informado';
  else
    select * into c from custo_insumo(new.insumo_id, v_origem);
    new.valor_unitario := round(c.valor, 4); new.custo_fonte := c.fonte;
  end if;
  new.valor_total := round(abs(new.quantidade) * new.valor_unitario, 2);
  return new;
end $$;
create trigger tg_mov_valor before insert on estoque_movimentos for each row execute function _tg_mov_valor();

-- transferência agora devolve o valor e avisa; aceita o valor unitário quando não há preço de compra
drop function if exists estoque_lancar(uuid, uuid, text, numeric, text, uuid, boolean);
create or replace function estoque_lancar(p_obra uuid, p_insumo uuid, p_tipo text, p_quantidade numeric, p_observacao text,
                                          p_destino uuid default null, p_transferir boolean default false, p_valor_unitario numeric default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare c record; v_total numeric; i insumos; v_de text; v_para text;
begin
  if not tem_papel('almoxarifado','admin') then raise exception 'Apenas o almoxarifado movimenta o estoque'; end if;
  if p_quantidade is null or p_quantidade = 0 then raise exception 'Informe a quantidade'; end if;
  if coalesce(length(trim(p_observacao)),0) < 3 then raise exception 'Informe o motivo / documento do lançamento'; end if;
  if p_transferir then
    if p_destino is not distinct from p_obra then raise exception 'Origem e destino iguais'; end if;
    if p_valor_unitario is not null and p_valor_unitario < 0 then raise exception 'Valor unitário inválido'; end if;
    if p_valor_unitario is null then
      select * into c from custo_insumo(p_insumo, p_obra);
      if c.valor is null then raise exception 'Este material ainda não tem preço de compra: informe o valor unitário da transferência'; end if;
    end if;
    perform set_config('app.mov_valor', coalesce(p_valor_unitario::text, ''), true);
    perform _movimentar(p_obra, p_insumo, 'saida', abs(p_quantidade), 'transferencia', p_destino, p_observacao);
    perform _movimentar(p_destino, p_insumo, 'entrada', abs(p_quantidade), 'transferencia', p_obra, p_observacao);
    perform set_config('app.mov_valor', '', true);
    select valor_total into v_total from estoque_movimentos where id = currval('estoque_movimentos_id_seq');
    select * into i from insumos where id = p_insumo;
    v_de := coalesce((select nome from obras where id = p_obra), 'Depósito central');
    v_para := coalesce((select nome from obras where id = p_destino), 'Depósito central');
    perform _notificar_papeis(array['admin','financeiro'], 'transferencia_material',
      format('Material transferido: %s %s %s', trim_scale(abs(p_quantidade)), i.unidade, i.descricao),
      format('%s → %s • %s', v_de, v_para, coalesce(_brl(v_total), 'sem valor')), '/suprimentos/estoque?transf=1');
    return v_total;
  elsif p_tipo in ('entrada','saida') then
    perform _movimentar(p_obra, p_insumo, p_tipo, abs(p_quantidade), case when p_tipo = 'saida' then 'consumo' else 'entrada_avulsa' end, null, p_observacao);
  elsif p_tipo = 'ajuste' then
    if saldo_estoque(p_insumo, p_obra) + p_quantidade < 0 then raise exception 'Ajuste deixaria o saldo negativo'; end if;
    perform _movimentar(p_obra, p_insumo, 'ajuste', p_quantidade, 'ajuste_inventario', null, p_observacao);
  else
    raise exception 'Tipo de lançamento inválido';
  end if;
  return null;
end $$;
revoke execute on function estoque_lancar(uuid, uuid, text, numeric, text, uuid, boolean, numeric) from public, anon;
grant execute on function estoque_lancar(uuid, uuid, text, numeric, text, uuid, boolean, numeric) to authenticated;
revoke execute on function custo_insumo(uuid, uuid) from public, anon;
grant execute on function custo_insumo(uuid, uuid) to authenticated;

-- transferências (uma linha por transferência: a saída da origem); as antigas, sem valor gravado, usam o custo atual
create view v_transferencias with (security_invoker = true) as
select m.id, m.criado_em, m.insumo_id, i.codigo, i.descricao, i.unidade, abs(m.quantidade) as quantidade,
       m.obra_id as origem_id, coalesce(oo.nome, 'Depósito central') as origem_nome, oo.codigo as origem_codigo,
       m.referencia as destino_id, coalesce(od.nome, 'Depósito central') as destino_nome, od.codigo as destino_codigo,
       coalesce(m.valor_unitario, (custo_insumo(m.insumo_id, m.obra_id)).valor) as valor_unitario,
       coalesce(m.valor_total, round(abs(m.quantidade) * (custo_insumo(m.insumo_id, m.obra_id)).valor, 2)) as valor_total,
       coalesce(m.custo_fonte, (custo_insumo(m.insumo_id, m.obra_id)).fonte) as custo_fonte,
       (m.valor_total is null) as valor_estimado, m.observacao, p.nome as usuario_nome
  from estoque_movimentos m
  join insumos i on i.id = m.insumo_id
  left join obras oo on oo.id = m.obra_id
  left join obras od on od.id = m.referencia
  left join perfis p on p.id = m.usuario_id
 where m.origem = 'transferencia' and m.tipo = 'saida';
grant select on v_transferencias to authenticated;
