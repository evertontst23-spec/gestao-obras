-- =====================================================================
-- 0033 — Editar pedido de material pelo próprio sistema
--  * Editar o pedido: data de necessidade, prioridade, serviço (tarefa), justificativa e observação.
--  * Editar cada item (renomear, especificação, unidade, quantidade, data, período da locação)
--    enquanto ele ainda não entrou numa cotação nem foi separado/enviado.
--  * Incluir item novo num pedido que ainda está em andamento.
--  Tudo fica no histórico do item (de → para).
-- =====================================================================

create or replace function _pode_editar_sm(s solicitacoes) returns boolean
language sql stable security definer set search_path = public as $$
  select gere_obra(s.obra_id) or tem_papel('compras','admin') or s.solicitante_id = auth.uid()
$$;

-- Acha (ou cadastra) o insumo do nome digitado — mesma regra do pedido novo ("COD — descrição" ou só a descrição)
create or replace function _insumo_do_material(p_material text, p_unidade text) returns insumos
language plpgsql security definer set search_path = public as $$
declare v insumos; v_cod text; v_desc text;
begin
  if position(' — ' in p_material) > 0 then
    v_cod  := upper(trim(split_part(p_material, ' — ', 1)));
    v_desc := regexp_replace(trim(substr(p_material, position(' — ' in p_material) + 3)), '\s+', ' ', 'g');
  else
    v_desc := regexp_replace(trim(p_material), '\s+', ' ', 'g');
  end if;
  select * into v from insumos where ativo and ((v_cod is not null and upper(codigo) = v_cod) or (v_cod is null and lower(descricao) = lower(v_desc)))
   order by revisar, criado_em limit 1;
  if not found then
    insert into insumos (codigo, descricao, unidade, categoria, revisar, criado_por)
    values (coalesce(nullif(v_cod, ''), _codigo_insumo_auto()), v_desc, coalesce(nullif(trim(p_unidade), ''), 'un'), 'Material', true, auth.uid())
    returning * into v;
  end if;
  return v;
end $$;

create or replace function solicitacao_editar(p_sol uuid, p_data_necessidade date, p_prioridade prioridade, p_tarefa uuid,
                                              p_justificativa text, p_observacoes text) returns void
language plpgsql security definer set search_path = public as $$
declare s solicitacoes; t tarefas; v_mud text := '';
begin
  select * into s from solicitacoes where id = p_sol for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not _pode_editar_sm(s) then raise exception 'Sem permissão para editar este pedido'; end if;
  if s.status in ('concluida','cancelada','rejeitada') then raise exception 'Pedido encerrado não pode ser editado'; end if;
  if p_tarefa is not null and p_tarefa is distinct from s.tarefa_id then
    select * into t from tarefas where id = p_tarefa;
    if not found or t.obra_id <> s.obra_id then raise exception 'A tarefa não pertence a esta obra'; end if;
  end if;
  if p_tarefa is null and coalesce(length(trim(p_observacoes)), 0) < 5 then
    raise exception 'Pedido sem vínculo com tarefa: explique na observação para que é o material';
  end if;
  if p_data_necessidade is null then raise exception 'Informe a data de necessidade'; end if;
  if p_data_necessidade is distinct from s.data_necessidade and p_data_necessidade < hoje() then
    raise exception 'A nova data de necessidade não pode ser no passado';
  end if;

  if p_data_necessidade is distinct from s.data_necessidade then v_mud := v_mud || format('data %s → %s; ', to_char(s.data_necessidade,'DD/MM/YYYY'), to_char(p_data_necessidade,'DD/MM/YYYY')); end if;
  if coalesce(p_prioridade,'normal') is distinct from s.prioridade then v_mud := v_mud || format('prioridade %s → %s; ', s.prioridade, coalesce(p_prioridade,'normal')); end if;
  if p_tarefa is distinct from s.tarefa_id then v_mud := v_mud || 'serviço vinculado alterado; '; end if;
  if nullif(trim(p_observacoes),'') is distinct from s.observacoes then v_mud := v_mud || 'observação alterada; '; end if;
  if nullif(trim(p_justificativa),'') is distinct from s.justificativa then v_mud := v_mud || 'justificativa alterada; '; end if;
  if v_mud = '' then raise exception 'Nada foi alterado'; end if;

  update solicitacoes set data_necessidade = p_data_necessidade, prioridade = coalesce(p_prioridade,'normal'), tarefa_id = p_tarefa,
         justificativa = nullif(trim(p_justificativa),''), observacoes = nullif(trim(p_observacoes),'') where id = p_sol;
  -- itens ainda não entregues que seguiam a data do pedido acompanham a nova data
  update solicitacao_itens set data_necessidade = p_data_necessidade
   where solicitacao_id = p_sol and data_necessidade = s.data_necessidade and status not in ('entregue','cancelado');
  perform _item_evento(i.id, i.status, i.status, null, 'Pedido editado: ' || rtrim(v_mud, '; '))
     from solicitacao_itens i where i.solicitacao_id = p_sol and i.status not in ('entregue','cancelado');
end $$;

create or replace function item_editar(p_item uuid, p_material text, p_especificacao text, p_unidade text, p_quantidade numeric,
                                       p_data_necessidade date default null, p_locacao_inicio date default null, p_locacao_fim date default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes; ins insumos; v_mud text := ''; v_mat text := regexp_replace(trim(coalesce(p_material,'')), '\s+', ' ', 'g');
        v_ini date; v_fim date; v_ins uuid; v_uso int;
begin
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  select * into s from solicitacoes where id = i.solicitacao_id;
  if not _pode_editar_sm(s) then raise exception 'Sem permissão para editar este item'; end if;
  if i.status not in ('solicitado','aguardando_aprovacao','aprovado','em_cotacao') or i.cotacao_id is not null or i.oc_id is not null
     or i.quantidade_enviada > 0 or i.quantidade_recebida > 0 then
    raise exception 'Este item já está em cotação, comprado ou separado: peça ao comprador para corrigir na cotação (ou cancele o item e inclua outro)';
  end if;
  if v_mat = '' then raise exception 'Informe o nome do material'; end if;
  if coalesce(trim(p_unidade), '') = '' then raise exception 'Informe a unidade'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'A quantidade precisa ser maior que zero'; end if;
  if p_data_necessidade is not null and p_data_necessidade is distinct from i.data_necessidade and p_data_necessidade < hoje() then
    raise exception 'A data de necessidade não pode ser no passado';
  end if;
  v_ini := i.locacao_inicio; v_fim := i.locacao_fim;
  if i.modalidade = 'locacao' then
    v_ini := coalesce(p_locacao_inicio, i.locacao_inicio); v_fim := coalesce(p_locacao_fim, i.locacao_fim);
    if v_fim < v_ini then raise exception 'O fim da locação é antes do início'; end if;
  end if;

  -- nome novo: troca o vínculo com o cadastro de insumos
  v_ins := i.insumo_id;
  if lower(v_mat) <> lower(i.material) then
    select count(*) into v_uso from solicitacao_itens where insumo_id = i.insumo_id;
    select * into ins from insumos where id = i.insumo_id;
    if ins.id is not null and ins.revisar and v_uso = 1 and position(' — ' in v_mat) = 0
       and not exists (select 1 from insumos x where x.ativo and x.id <> ins.id and lower(x.descricao) = lower(v_mat)) then
      -- material cadastrado sozinho por este pedido (nome digitado errado): corrige o próprio cadastro, mantém o código
      update insumos set descricao = v_mat, unidade = trim(p_unidade) where id = ins.id;
    else
      ins := _insumo_do_material(v_mat, p_unidade);
      v_ins := ins.id; v_mat := ins.descricao;
    end if;
    v_mud := v_mud || format('material "%s" → "%s"; ', i.material, v_mat);
  end if;
  if nullif(trim(p_especificacao),'') is distinct from i.especificacao then v_mud := v_mud || 'especificação alterada; '; end if;
  if trim(p_unidade) is distinct from i.unidade then v_mud := v_mud || format('unidade %s → %s; ', i.unidade, trim(p_unidade)); end if;
  if p_quantidade is distinct from i.quantidade then v_mud := v_mud || format('quantidade %s → %s; ', trim_scale(i.quantidade), trim_scale(p_quantidade)); end if;
  if coalesce(p_data_necessidade, i.data_necessidade) is distinct from i.data_necessidade then
    v_mud := v_mud || format('necessário em %s → %s; ', to_char(i.data_necessidade,'DD/MM/YYYY'), to_char(p_data_necessidade,'DD/MM/YYYY')); end if;
  if v_ini is distinct from i.locacao_inicio or v_fim is distinct from i.locacao_fim then
    v_mud := v_mud || format('locação %s a %s; ', to_char(v_ini,'DD/MM/YYYY'), to_char(v_fim,'DD/MM/YYYY')); end if;
  if v_mud = '' then raise exception 'Nada foi alterado'; end if;

  update solicitacao_itens set material = v_mat, insumo_id = v_ins, especificacao = nullif(trim(p_especificacao),''), unidade = trim(p_unidade),
         quantidade = p_quantidade, data_necessidade = coalesce(p_data_necessidade, data_necessidade), locacao_inicio = v_ini, locacao_fim = v_fim
   where id = p_item;
  perform _item_evento(p_item, i.status, i.status, p_quantidade, 'Item editado: ' || rtrim(v_mud, '; '));
end $$;

-- Incluir item num pedido em andamento
create or replace function item_adicionar(p_sol uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s solicitacoes; v_id uuid; v_mod text := coalesce(nullif(p_item->>'modalidade',''), 'compra'); v_ini date; v_fim date;
        v_status status_material; v_qtd numeric := nullif(p_item->>'quantidade','')::numeric;
begin
  select * into s from solicitacoes where id = p_sol for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not _pode_editar_sm(s) then raise exception 'Sem permissão para incluir itens neste pedido'; end if;
  if s.status in ('concluida','cancelada','rejeitada') then raise exception 'Pedido encerrado: faça um pedido novo'; end if;
  if coalesce(trim(p_item->>'material'),'') = '' or coalesce(trim(p_item->>'unidade'),'') = '' or coalesce(v_qtd, 0) <= 0 then
    raise exception 'Informe material, unidade e quantidade maior que zero';
  end if;
  if v_mod not in ('compra','locacao') then raise exception 'Modalidade inválida'; end if;
  if v_mod = 'locacao' then
    v_ini := nullif(p_item->>'locacao_inicio','')::date; v_fim := nullif(p_item->>'locacao_fim','')::date;
    if v_ini is null or v_fim is null then raise exception 'Informe o período da locação'; end if;
    if v_fim < v_ini then raise exception 'O fim da locação é antes do início'; end if;
  end if;
  v_status := case when s.status = 'aguardando_aprovacao' then 'aguardando_aprovacao' else 'aprovado' end;
  insert into solicitacao_itens (solicitacao_id, material, especificacao, unidade, quantidade, data_necessidade, status, modalidade, locacao_inicio, locacao_fim)
  values (p_sol, trim(p_item->>'material'), nullif(trim(p_item->>'especificacao'),''), trim(p_item->>'unidade'), v_qtd,
          s.data_necessidade, v_status, v_mod, v_ini, v_fim)
  returning id into v_id;
  perform _item_evento(v_id, null, v_status, v_qtd, 'Item incluído no pedido depois de enviado');
  perform _sol_atualizar_status(p_sol);
  if v_status = 'aprovado' then
    perform _notificar_papel('almoxarifado', 'material_aprovado', 'Item incluído no pedido ' || _cod_sm(s.numero),
      format('%s %s %s • verificar estoque', trim_scale(v_qtd), trim(p_item->>'unidade'), trim(p_item->>'material')), '/materiais/' || p_sol);
  end if;
  return v_id;
end $$;

revoke execute on function _pode_editar_sm(solicitacoes) from public, anon, authenticated;
revoke execute on function _insumo_do_material(text, text) from public, anon, authenticated;
revoke execute on function solicitacao_editar(uuid, date, prioridade, uuid, text, text) from public, anon;
revoke execute on function item_editar(uuid, text, text, text, numeric, date, date, date) from public, anon;
revoke execute on function item_adicionar(uuid, jsonb) from public, anon;
grant execute on function solicitacao_editar(uuid, date, prioridade, uuid, text, text) to authenticated;
grant execute on function item_editar(uuid, text, text, text, numeric, date, date, date) to authenticated;
grant execute on function item_adicionar(uuid, jsonb) to authenticated;
