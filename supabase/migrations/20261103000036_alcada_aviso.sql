-- =====================================================================
-- 0036 — Alçada: até o limite, quem aprova é o coordenador de compras
--  O pedido de aprovação só vai para a diretoria quando a compra passa do limite
--  (ou quando não há outro coordenador de compras para aprovar).
-- =====================================================================
create or replace function cotacao_enviar_aprovacao(p_cotacao uuid, p_proposta uuid, p_justificativa text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c cotacoes; p cotacao_propostas; v_min numeric; v_n int; v_lim numeric; v_msg text; u uuid; v_avisados int := 0;
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
           case when p.valor_total <= v_lim then 'até ' || _brl(v_lim) || ': aprovação do coordenador de compras'
                else 'acima de ' || _brl(v_lim) || ': só a diretoria aprova' end);
  if p.valor_total <= v_lim then
    for u in select id from perfis where ativo and coordenador_compras and papel <> 'admin' and id is distinct from auth.uid() loop
      perform _notificar(u, 'cotacao_aprovar', 'Aprovar compra ' || _cod_cot(c.numero), v_msg, '/suprimentos/cotacoes/' || p_cotacao);
      v_avisados := v_avisados + 1;
    end loop;
    -- quem enviou já é o coordenador: ele mesmo aprova; ninguém mais precisa ser chamado
    if v_avisados = 0 and not exists (select 1 from perfis where id = auth.uid() and coordenador_compras) then
      perform _notificar_papel('admin', 'cotacao_aprovar', 'Aprovar compra ' || _cod_cot(c.numero), v_msg, '/suprimentos/cotacoes/' || p_cotacao);
    end if;
  else
    perform _notificar_papel('admin', 'cotacao_aprovar', 'Aprovar compra ' || _cod_cot(c.numero), v_msg, '/suprimentos/cotacoes/' || p_cotacao);
  end if;
end $$;
