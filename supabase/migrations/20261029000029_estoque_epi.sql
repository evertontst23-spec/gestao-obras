-- =====================================================================
-- 0029 — Estoque de EPI na Segurança do Trabalho
--  Mesmo estoque de Suprimentos (um saldo só por obra), visto e movimentado pela SST:
--  entrada de nota, transferência entre obras, ajuste de inventário e estoque mínimo — só para EPI.
-- =====================================================================
create policy est_sel_epi on estoque_movimentos for select to authenticated
  using (tem_papel('seguranca') and exists (select 1 from insumos i where i.id = insumo_id and i.categoria = 'EPI'));

create or replace function epi_estoque_lancar(p_obra uuid, p_insumo uuid, p_tipo text, p_quantidade numeric, p_observacao text,
                                              p_destino uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare ins insumos;
begin
  if not tem_papel('admin','almoxarifado','seguranca') then raise exception 'Apenas SST, almoxarifado ou diretoria movimentam o estoque de EPI'; end if;
  select * into ins from insumos where id = p_insumo;
  if not found or ins.categoria <> 'EPI' then raise exception 'Item não é um EPI cadastrado'; end if;
  if p_quantidade is null or p_quantidade = 0 then raise exception 'Informe a quantidade'; end if;
  if coalesce(length(trim(p_observacao)), 0) < 3 then raise exception 'Informe a nota fiscal ou o motivo do lançamento'; end if;
  if p_tipo = 'transferencia' then
    if p_destino is not distinct from p_obra then raise exception 'Origem e destino iguais'; end if;
    perform _movimentar(p_obra, p_insumo, 'saida', abs(p_quantidade), 'transferencia', p_destino, p_observacao);
    perform _movimentar(p_destino, p_insumo, 'entrada', abs(p_quantidade), 'transferencia', p_obra, p_observacao);
  elsif p_tipo in ('entrada','saida') then
    perform _movimentar(p_obra, p_insumo, p_tipo, abs(p_quantidade), case when p_tipo = 'saida' then 'consumo' else 'entrada_avulsa' end, null, p_observacao);
  elsif p_tipo = 'ajuste' then
    if saldo_estoque(p_insumo, p_obra) + p_quantidade < 0 then raise exception 'Ajuste deixaria o saldo negativo'; end if;
    perform _movimentar(p_obra, p_insumo, 'ajuste', p_quantidade, 'ajuste_inventario', null, p_observacao);
  else
    raise exception 'Tipo de lançamento inválido';
  end if;
end $$;

create or replace function epi_definir_minimo(p_insumo uuid, p_minimo numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','almoxarifado','seguranca') then raise exception 'Sem permissão para definir o estoque mínimo de EPI'; end if;
  if p_minimo is null or p_minimo < 0 then raise exception 'Estoque mínimo inválido'; end if;
  update insumos set estoque_minimo = p_minimo where id = p_insumo and categoria = 'EPI';
  if not found then raise exception 'EPI não encontrado'; end if;
end $$;

revoke execute on function epi_estoque_lancar(uuid, uuid, text, numeric, text, uuid) from public, anon;
revoke execute on function epi_definir_minimo(uuid, numeric) from public, anon;
grant execute on function epi_estoque_lancar(uuid, uuid, text, numeric, text, uuid) to authenticated;
grant execute on function epi_definir_minimo(uuid, numeric) to authenticated;
