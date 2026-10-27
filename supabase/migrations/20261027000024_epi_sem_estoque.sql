-- =====================================================================
-- 0024 — Entrega de EPI sem estoque lançado
--  EPI que nunca teve entrada no estoque é entregue normalmente (vai para a ficha do funcionário);
--  a baixa no estoque só acontece para EPI com estoque controlado (mesma regra dos materiais).
-- =====================================================================
create or replace function epi_registrar_entrega(p_func uuid, p_local uuid, p_itens jsonb, p_motivo text, p_confirmacao text,
                                                 p_assinatura text default null, p_descritor real[] default null, p_obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f funcionarios; v_id uuid; v_num bigint; it jsonb; ins insumos; q numeric; v_dist double precision; v_lista text := '';
begin
  if not tem_papel('admin','seguranca','almoxarifado','encarregado','engenheiro') then raise exception 'Sem permissão para entregar EPI'; end if;
  select * into f from funcionarios where id = p_func and ativo;
  if not found then raise exception 'Funcionário não encontrado ou desligado'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Selecione os EPIs entregues'; end if;
  if p_confirmacao = 'facial' then
    if f.face_descritor is null then raise exception 'Funcionário sem biometria — use a assinatura'; end if;
    v_dist := _dist_face(f.face_descritor, p_descritor);
    if p_descritor is null or v_dist >= 0.5 then raise exception 'O rosto não confere com % — confirme por assinatura', f.nome; end if;
  elsif p_confirmacao = 'assinatura' then
    if coalesce(p_assinatura,'') = '' then raise exception 'Colete a assinatura do funcionário'; end if;
  else raise exception 'Confirmação inválida'; end if;

  insert into epi_entregas (funcionario_id, obra_id, motivo, confirmacao, assinatura_caminho, distancia_facial, observacoes, entregue_por, hash)
  values (p_func, p_local, p_motivo, p_confirmacao, p_assinatura, round(v_dist::numeric, 4), p_obs, auth.uid(), 'pendente')
  returning id, numero into v_id, v_num;

  for it in select * from jsonb_array_elements(p_itens) loop
    select * into ins from insumos where id = (it->>'insumo_id')::uuid;
    if not found or ins.categoria <> 'EPI' then raise exception 'Item não é um EPI cadastrado'; end if;
    if ins.ca is null then raise exception '% sem CA cadastrado — não pode ser entregue (NR-06)', ins.descricao; end if;
    if ins.ca_validade is not null and ins.ca_validade < hoje() then raise exception 'CA % de % está vencido (%)', ins.ca, ins.descricao, to_char(ins.ca_validade,'DD/MM/YYYY'); end if;
    q := coalesce((it->>'quantidade')::numeric, 1);
    insert into epi_entrega_itens values (v_id, ins.id, q, ins.ca, ins.ca_validade, case when ins.vida_util_dias is not null then hoje() + ins.vida_util_dias end);
    if _estoque_controlado(ins.id) then perform _movimentar(p_local, ins.id, 'saida', q, 'entrega_epi', v_id, 'Ficha EPI nº ' || v_num || ' — ' || f.nome); end if;
    v_lista := v_lista || ins.codigo || ':' || q || ';';
  end loop;
  update epi_entregas set hash = _sha(concat_ws('|', v_id, p_func, now(), v_lista, p_confirmacao, coalesce(p_assinatura,''), coalesce(v_dist::text,''))) where id = v_id;
  return v_id;
end $$;
