-- =====================================================================
-- GESTÃO DE OBRAS — 03. FLUXOS (funções chamadas pelo aplicativo via RPC)
-- Cada função valida perfil, vínculo com a obra e transição de status,
-- grava histórico e dispara notificações.
-- =====================================================================

create or replace function _fluxo_on() returns void language sql as $$ select set_config('app.fluxo','on',true) $$;
create or replace function _fluxo_off() returns void language sql as $$ select set_config('app.fluxo','off',true) $$;

create or replace function _tarefa_lock(p_tarefa uuid) returns tarefas
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa for update;
  if not found then raise exception 'Tarefa não encontrada'; end if;
  if not membro_obra(t.obra_id) then raise exception 'Sem acesso a esta obra'; end if;
  return t;
end $$;

create or replace function _exige_responsavel(t tarefas) returns void language plpgsql as $$
begin
  if t.encarregado_id is distinct from auth.uid() then
    raise exception 'Apenas o encarregado responsável pode executar esta ação';
  end if;
end $$;

create or replace function _exige_gestor(p_obra uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not gere_obra(p_obra) then
    raise exception 'Apenas o engenheiro da obra ou a diretoria pode executar esta ação';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TAREFAS — ações do encarregado
-- ---------------------------------------------------------------------
create or replace function tarefa_confirmar_recebimento(p_tarefa uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_responsavel(t);
  if t.status <> 'aguardando_confirmacao' then raise exception 'A tarefa não está aguardando confirmação'; end if;
  perform _fluxo_on();
  update tarefas set status = 'programado', recebido_em = now() where id = p_tarefa;
  perform _fluxo_off();
  perform _evento(p_tarefa, 'recebimento_confirmado', t.status, 'programado', 'Encarregado confirmou o recebimento');
  perform _notificar_engenheiros(t.obra_id, 'tarefa_confirmada', 'Tarefa recebida: ' || t.titulo,
    _cod_tarefa(t.numero) || ' foi confirmada pelo encarregado.', '/tarefas/' || t.id);
end $$;

create or replace function tarefa_iniciar(p_tarefa uuid, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_responsavel(t);
  if t.status not in ('aguardando_confirmacao','programado','aguardando_material','paralisado') then
    raise exception 'Não é possível iniciar uma tarefa com status %', t.status;
  end if;
  perform _fluxo_on();
  update tarefas set status = 'em_andamento',
                     recebido_em = coalesce(recebido_em, now()),
                     inicio_real = coalesce(inicio_real, now())
   where id = p_tarefa;
  update impedimentos set resolvido_em = now(), resolvido_por = auth.uid()
   where tarefa_id = p_tarefa and resolvido_em is null and paralisou;
  perform _fluxo_off();
  perform _evento(p_tarefa, case when t.status in ('aguardando_material','paralisado') then 'retomada' else 'iniciada' end,
                  t.status, 'em_andamento', coalesce(p_observacao, 'Serviço iniciado'));
  perform _notificar_engenheiros(t.obra_id, 'tarefa_iniciada', 'Serviço iniciado: ' || t.titulo,
    _cod_tarefa(t.numero) || ' está em andamento.', '/tarefas/' || t.id);
end $$;

create or replace function tarefa_atualizar_andamento(p_tarefa uuid, p_percentual int,
                                                      p_quantidade numeric default null, p_descricao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; v_pct int := p_percentual;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_responsavel(t);
  if t.status <> 'em_andamento' then raise exception 'Inicie o serviço antes de atualizar o andamento'; end if;
  if p_quantidade is not null and p_quantidade < 0 then raise exception 'Quantidade inválida'; end if;
  if v_pct is null and p_quantidade is not null and coalesce(t.quantidade_prevista,0) > 0 then
    v_pct := least(99, round(p_quantidade / t.quantidade_prevista * 100)::int);
  end if;
  if v_pct is null or v_pct < 0 or v_pct > 99 then
    raise exception 'Informe um percentual entre 0 e 99 (para 100%% use "Concluir serviço")';
  end if;
  perform _fluxo_on();
  update tarefas set percentual = v_pct, quantidade_executada = coalesce(p_quantidade, quantidade_executada)
   where id = p_tarefa;
  perform _fluxo_off();
  perform _evento(p_tarefa, 'andamento', t.status, t.status,
    coalesce(nullif(trim(p_descricao),''), format('Andamento atualizado para %s%%', v_pct)),
    jsonb_build_object('percentual_anterior', t.percentual, 'percentual', v_pct, 'quantidade', p_quantidade));
end $$;

create or replace function tarefa_registrar_impedimento(p_tarefa uuid, p_causa causa_atraso,
                                                        p_descricao text, p_paralisar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; v_novo status_tarefa;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_responsavel(t);
  if t.status not in ('aguardando_confirmacao','programado','em_andamento','aguardando_material','paralisado') then
    raise exception 'Não é possível registrar impedimento com status %', t.status;
  end if;
  if coalesce(length(trim(p_descricao)),0) < 5 then raise exception 'Descreva o impedimento'; end if;

  v_novo := case when p_causa = 'falta_material' and t.status in ('em_andamento','programado','aguardando_confirmacao') then 'aguardando_material'
                 when p_paralisar then 'paralisado'
                 else t.status end;

  insert into impedimentos (tarefa_id, causa, descricao, paralisou, registrado_por)
  values (p_tarefa, p_causa, p_descricao, v_novo <> t.status, auth.uid());

  if v_novo <> t.status then
    perform _fluxo_on();
    update tarefas set status = v_novo, recebido_em = coalesce(recebido_em, now()) where id = p_tarefa;
    perform _fluxo_off();
  end if;
  perform _evento(p_tarefa, 'impedimento', t.status, v_novo, p_descricao, jsonb_build_object('causa', p_causa));
  perform _notificar_engenheiros(t.obra_id,
    case when v_novo = 'aguardando_material' then 'paralisado_material' else 'impedimento' end,
    case when v_novo = 'aguardando_material' then 'Serviço parado por falta de material: '
         when v_novo = 'paralisado' then 'Serviço paralisado: ' else 'Dificuldade registrada: ' end || t.titulo,
    _cod_tarefa(t.numero) || ' — ' || p_descricao, '/tarefas/' || t.id);
end $$;

create or replace function tarefa_concluir(p_tarefa uuid, p_descricao text default null, p_quantidade numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_responsavel(t);
  if t.status <> 'em_andamento' then raise exception 'Somente serviços em andamento podem ser concluídos'; end if;
  perform _fluxo_on();
  update tarefas set status = 'aguardando_validacao', percentual = 100, concluido_em = now(),
                     quantidade_executada = coalesce(p_quantidade, quantidade_prevista, quantidade_executada)
   where id = p_tarefa;
  perform _fluxo_off();
  -- Etapa 7 (concluído pelo encarregado) fica registrada no histórico; a tarefa
  -- segue automaticamente para a etapa 8 (aguardando validação do engenheiro).
  perform _evento(p_tarefa, 'concluida_encarregado', t.status, 'aguardando_validacao',
                  coalesce(nullif(trim(p_descricao),''), 'Encarregado informou a conclusão do serviço'));
  perform _notificar_engenheiros(t.obra_id, 'aguardando_validacao', 'Validar serviço: ' || t.titulo,
    _cod_tarefa(t.numero) || ' foi concluída pelo encarregado e aguarda sua validação.', '/tarefas/' || t.id);
end $$;

create or replace function tarefa_solicitar_reprogramacao(p_tarefa uuid, p_inicio date, p_fim date,
                                                          p_causa causa_atraso, p_justificativa text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tarefas; v_id uuid;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_responsavel(t);
  if t.status = 'aprovado' then raise exception 'Tarefa já finalizada'; end if;
  if exists (select 1 from reprogramacoes where tarefa_id = p_tarefa and status = 'pendente') then
    raise exception 'Já existe uma solicitação de revisão de prazo pendente para esta tarefa';
  end if;
  insert into reprogramacoes (tarefa_id, solicitado_por, inicio_anterior, fim_anterior, inicio_novo, fim_novo, causa, justificativa)
  values (p_tarefa, auth.uid(), t.inicio_previsto, t.fim_previsto, coalesce(p_inicio, t.inicio_previsto), p_fim, p_causa, p_justificativa)
  returning id into v_id;
  perform _evento(p_tarefa, 'revisao_prazo_solicitada', t.status, t.status,
    format('Pediu novo prazo até %s: %s', to_char(p_fim,'DD/MM/YYYY'), p_justificativa), jsonb_build_object('reprogramacao_id', v_id));
  perform _notificar_engenheiros(t.obra_id, 'revisao_prazo', 'Pedido de novo prazo: ' || t.titulo,
    format('%s — novo término sugerido %s. Motivo: %s', _cod_tarefa(t.numero), to_char(p_fim,'DD/MM/YYYY'), p_justificativa),
    '/tarefas/' || t.id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- TAREFAS — ações do engenheiro
-- ---------------------------------------------------------------------
create or replace function tarefa_validar(p_tarefa uuid, p_aprovar boolean, p_parecer text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_gestor(t.obra_id);
  if t.status not in ('aguardando_validacao','concluido_encarregado') then
    raise exception 'A tarefa não está aguardando validação';
  end if;
  perform _fluxo_on();
  if p_aprovar then
    update tarefas set status = 'aprovado', aprovado_em = now(), aprovado_por = auth.uid() where id = p_tarefa;
  else
    if coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo da rejeição'; end if;
    update tarefas set status = 'em_andamento', percentual = 95, concluido_em = null where id = p_tarefa;
  end if;
  perform _fluxo_off();
  perform _evento(p_tarefa, case when p_aprovar then 'aprovada' else 'rejeitada' end, t.status,
                  case when p_aprovar then 'aprovado'::status_tarefa else 'em_andamento'::status_tarefa end,
                  coalesce(nullif(trim(p_parecer),''), case when p_aprovar then 'Serviço aprovado pelo engenheiro' end));
  perform _notificar(t.encarregado_id, case when p_aprovar then 'tarefa_aprovada' else 'tarefa_rejeitada' end,
    case when p_aprovar then 'Serviço aprovado: ' else 'Serviço precisa de correção: ' end || t.titulo,
    coalesce(p_parecer, _cod_tarefa(t.numero) || ' foi aprovada e finalizada.'), '/tarefas/' || t.id);
end $$;

create or replace function tarefa_reprogramar(p_tarefa uuid, p_inicio date, p_fim date, p_causa causa_atraso,
                                              p_justificativa text, p_reprogramacao uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; r reprogramacoes;
begin
  t := _tarefa_lock(p_tarefa);
  perform _exige_gestor(t.obra_id);
  if t.status = 'aprovado' then raise exception 'Tarefa já finalizada'; end if;
  if p_fim is null or p_inicio is null or p_fim < p_inicio then raise exception 'Datas inválidas'; end if;
  if coalesce(length(trim(p_justificativa)),0) < 10 then raise exception 'A justificativa deve ter pelo menos 10 caracteres'; end if;

  if p_reprogramacao is not null then
    select * into r from reprogramacoes where id = p_reprogramacao and tarefa_id = p_tarefa for update;
    if not found or r.status <> 'pendente' then raise exception 'Solicitação de revisão inválida ou já decidida'; end if;
    update reprogramacoes set status = 'aprovada', decidido_por = auth.uid(), decidido_em = now(), parecer = p_justificativa,
           inicio_novo = p_inicio, fim_novo = p_fim
     where id = p_reprogramacao;
  else
    insert into reprogramacoes (tarefa_id, solicitado_por, inicio_anterior, fim_anterior, inicio_novo, fim_novo,
                                causa, justificativa, status, decidido_por, decidido_em)
    values (p_tarefa, auth.uid(), t.inicio_previsto, t.fim_previsto, p_inicio, p_fim, p_causa, p_justificativa,
            'aprovada', auth.uid(), now());
  end if;

  perform _fluxo_on();
  update tarefas set inicio_previsto = p_inicio, fim_previsto = p_fim where id = p_tarefa;
  perform _fluxo_off();
  perform _evento(p_tarefa, 'prazo_reprogramado', t.status, t.status,
    format('Prazo alterado de %s–%s para %s–%s. Motivo: %s',
      to_char(t.inicio_previsto,'DD/MM'), to_char(t.fim_previsto,'DD/MM/YYYY'),
      to_char(p_inicio,'DD/MM'), to_char(p_fim,'DD/MM/YYYY'), p_justificativa),
    jsonb_build_object('causa', p_causa, 'fim_anterior', t.fim_previsto, 'fim_novo', p_fim));
  perform _notificar(t.encarregado_id, 'prazo_reprogramado', 'Novo prazo: ' || t.titulo,
    format('%s agora vai até %s.', _cod_tarefa(t.numero), to_char(p_fim,'DD/MM/YYYY')), '/tarefas/' || t.id);
end $$;

create or replace function reprogramacao_rejeitar(p_reprogramacao uuid, p_parecer text)
returns void language plpgsql security definer set search_path = public as $$
declare r reprogramacoes; t tarefas;
begin
  select * into r from reprogramacoes where id = p_reprogramacao for update;
  if not found or r.status <> 'pendente' then raise exception 'Solicitação inválida ou já decidida'; end if;
  t := _tarefa_lock(r.tarefa_id);
  perform _exige_gestor(t.obra_id);
  if coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo'; end if;
  update reprogramacoes set status = 'rejeitada', decidido_por = auth.uid(), decidido_em = now(), parecer = p_parecer
   where id = p_reprogramacao;
  perform _evento(t.id, 'revisao_prazo_rejeitada', t.status, t.status, p_parecer);
  perform _notificar(t.encarregado_id, 'revisao_rejeitada', 'Prazo mantido: ' || t.titulo, p_parecer, '/tarefas/' || t.id);
end $$;

create or replace function tarefa_comentar(p_tarefa uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  t := _tarefa_lock(p_tarefa);
  if coalesce(length(trim(p_texto)),0) = 0 then raise exception 'Comentário vazio'; end if;
  perform _evento(p_tarefa, 'comentario', null, null, p_texto);
  if auth.uid() = t.encarregado_id then
    perform _notificar_engenheiros(t.obra_id, 'comentario', 'Comentário em ' || _cod_tarefa(t.numero), p_texto, '/tarefas/' || t.id);
  else
    perform _notificar(t.encarregado_id, 'comentario', 'Comentário em ' || _cod_tarefa(t.numero), p_texto, '/tarefas/' || t.id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- MATERIAIS
-- ---------------------------------------------------------------------
create or replace function _sol_atualizar_status(p_sol uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s solicitacoes; v_abertos int; v_total int; v_cancel int; v_novo status_solicitacao;
begin
  select * into s from solicitacoes where id = p_sol;
  if s.status in ('aguardando_aprovacao','rejeitada') then return; end if;
  select count(*), count(*) filter (where status not in ('entregue','cancelado')), count(*) filter (where status = 'cancelado')
    into v_total, v_abertos, v_cancel from solicitacao_itens where solicitacao_id = p_sol;
  v_novo := case when v_total = v_cancel then 'cancelada'
                 when v_abertos = 0 then 'concluida'
                 when exists (select 1 from solicitacao_itens where solicitacao_id = p_sol and status <> 'aprovado') then 'em_atendimento'
                 else 'aprovada' end;
  if v_novo <> s.status then
    update solicitacoes set status = v_novo where id = p_sol;
  end if;
end $$;

create or replace function criar_solicitacao(p_obra uuid, p_tarefa uuid, p_data_necessidade date, p_prioridade prioridade,
                                             p_justificativa text, p_observacoes text, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_obra obras; v_papel papel_usuario := meu_papel(); v_id uuid; v_num bigint; v_aprovar boolean;
        it jsonb; v_item uuid; v_status status_material; v_tarefa tarefas;
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
    insert into solicitacao_itens (solicitacao_id, material, especificacao, unidade, quantidade, data_necessidade, status)
    values (v_id, trim(it->>'material'), nullif(trim(it->>'especificacao'),''), trim(it->>'unidade'),
            (it->>'quantidade')::numeric, coalesce((it->>'data_necessidade')::date, p_data_necessidade), v_status)
    returning id into v_item;
    perform _item_evento(v_item, null, 'solicitado', (it->>'quantidade')::numeric, 'Material solicitado');
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

create or replace function solicitacao_decidir(p_solicitacao uuid, p_aprovar boolean, p_parecer text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s solicitacoes; i record;
begin
  select * into s from solicitacoes where id = p_solicitacao for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  perform _exige_gestor(s.obra_id);
  if s.status <> 'aguardando_aprovacao' then raise exception 'Solicitação não está aguardando aprovação'; end if;
  if not p_aprovar and coalesce(length(trim(p_parecer)),0) < 5 then raise exception 'Informe o motivo da rejeição'; end if;

  update solicitacoes set status = case when p_aprovar then 'aprovada'::status_solicitacao else 'rejeitada'::status_solicitacao end,
         aprovado_por = auth.uid(), aprovado_em = now(), parecer = p_parecer
   where id = p_solicitacao;
  for i in select id, status from solicitacao_itens where solicitacao_id = p_solicitacao and status = 'aguardando_aprovacao' loop
    update solicitacao_itens set status = case when p_aprovar then 'aprovado'::status_material else 'cancelado'::status_material end
     where id = i.id;
    perform _item_evento(i.id, i.status, case when p_aprovar then 'aprovado'::status_material else 'cancelado'::status_material end,
                         null, coalesce(p_parecer, case when p_aprovar then 'Aprovado pelo engenheiro' end));
  end loop;

  perform _notificar(s.solicitante_id, case when p_aprovar then 'material_aprovado' else 'material_rejeitado' end,
    case when p_aprovar then 'Pedido aprovado ' else 'Pedido rejeitado ' end || _cod_sm(s.numero),
    coalesce(p_parecer, 'Seu pedido segue para o almoxarifado.'), '/materiais/' || s.id);
  if p_aprovar then
    perform _notificar_papel('almoxarifado', 'material_aprovado', 'Verificar estoque ' || _cod_sm(s.numero),
      'Pedido aprovado. Necessário em ' || to_char(s.data_necessidade,'DD/MM/YYYY'), '/materiais/' || s.id);
  end if;
end $$;

-- Almoxarifado informa quanto há em estoque. O que faltar vira um item para compras.
create or replace function item_verificar_estoque(p_item uuid, p_disponivel numeric, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes; v_novo uuid;
begin
  if meu_papel() not in ('almoxarifado','admin') then raise exception 'Apenas o almoxarifado registra a verificação de estoque'; end if;
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if i.status <> 'aprovado' then raise exception 'O item precisa estar aprovado para verificação de estoque'; end if;
  if p_disponivel is null or p_disponivel < 0 or p_disponivel > i.quantidade then
    raise exception 'Quantidade disponível deve estar entre 0 e %', i.quantidade;
  end if;
  select * into s from solicitacoes where id = i.solicitacao_id;

  if p_disponivel = i.quantidade then
    update solicitacao_itens set status = 'disponivel_estoque' where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel, coalesce(p_observacao, 'Disponível em estoque — separado'));
  elsif p_disponivel = 0 then
    update solicitacao_itens set status = 'em_cotacao' where id = p_item;
    perform _item_evento(p_item, i.status, 'em_cotacao', 0, coalesce(p_observacao, 'Sem estoque — encaminhado para compras'));
  else
    -- desmembra: parte separada do estoque + parte para compra
    update solicitacao_itens set status = 'disponivel_estoque', quantidade = p_disponivel where id = p_item;
    perform _item_evento(p_item, i.status, 'disponivel_estoque', p_disponivel,
      format('Estoque parcial: %s de %s %s separados', p_disponivel, i.quantidade, i.unidade));
    insert into solicitacao_itens (solicitacao_id, item_origem_id, material, especificacao, unidade, quantidade, data_necessidade, status)
    values (i.solicitacao_id, p_item, i.material, i.especificacao, i.unidade, i.quantidade - p_disponivel, i.data_necessidade, 'em_cotacao')
    returning id into v_novo;
    perform _item_evento(v_novo, 'aprovado', 'em_cotacao', i.quantidade - p_disponivel, 'Saldo sem estoque encaminhado para compras');
  end if;

  if p_disponivel < i.quantidade then
    perform _notificar_papel('compras', 'compra_necessaria', 'Comprar: ' || i.material,
      format('%s • %s %s • necessário em %s', _cod_sm(s.numero), i.quantidade - p_disponivel, i.unidade,
             to_char(i.data_necessidade,'DD/MM/YYYY')), '/materiais/' || s.id);
  end if;
  perform _sol_atualizar_status(i.solicitacao_id);
end $$;

-- Compras: cotação → compra autorizada → comprado → em transporte
create or replace function item_atualizar_compra(p_item uuid, p_status status_material, p_fornecedor text,
                                                 p_previsao date, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes; v_ordem text[] := array['em_cotacao','compra_autorizada','comprado','em_transporte'];
        v_risco boolean; v_eng uuid;
begin
  if meu_papel() not in ('compras','admin') then raise exception 'Apenas o setor de compras atualiza a compra'; end if;
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if i.status::text <> all (v_ordem) then raise exception 'Item não está em processo de compra (status %)', i.status; end if;
  if p_status::text <> all (v_ordem) then raise exception 'Status de compra inválido'; end if;
  if array_position(v_ordem, p_status::text) < array_position(v_ordem, i.status::text) then
    raise exception 'Não é permitido retroceder o status da compra';
  end if;
  if p_status in ('comprado','em_transporte') and coalesce(p_previsao, i.previsao_entrega) is null then
    raise exception 'Informe a previsão de entrega';
  end if;
  if p_status in ('compra_autorizada','comprado','em_transporte') and coalesce(nullif(trim(p_fornecedor),''), i.fornecedor) is null then
    raise exception 'Informe o fornecedor';
  end if;
  select * into s from solicitacoes where id = i.solicitacao_id;

  update solicitacao_itens
     set status = p_status,
         fornecedor = coalesce(nullif(trim(p_fornecedor),''), fornecedor),
         previsao_entrega = coalesce(p_previsao, previsao_entrega),
         comprado_em = case when p_status in ('comprado','em_transporte') then coalesce(comprado_em, now()) else comprado_em end
   where id = p_item;
  perform _item_evento(p_item, i.status, p_status, i.quantidade,
    coalesce(p_observacao, 'Compra atualizada'),
    jsonb_build_object('fornecedor', coalesce(nullif(trim(p_fornecedor),''), i.fornecedor),
                       'previsao_entrega', coalesce(p_previsao, i.previsao_entrega)));

  v_risco := coalesce(p_previsao, i.previsao_entrega) > i.data_necessidade;
  if v_risco then
    perform _notificar_engenheiros(s.obra_id, 'risco_atraso_material', 'Risco de atraso: ' || i.material,
      format('%s • entrega prevista %s, mas necessário em %s', _cod_sm(s.numero),
             to_char(coalesce(p_previsao, i.previsao_entrega),'DD/MM/YYYY'), to_char(i.data_necessidade,'DD/MM/YYYY')),
      '/materiais/' || s.id, 'risco:' || p_item || ':' || coalesce(p_previsao, i.previsao_entrega));
    perform _notificar(s.solicitante_id, 'risco_atraso_material', 'Material pode atrasar: ' || i.material,
      'Entrega prevista para ' || to_char(coalesce(p_previsao, i.previsao_entrega),'DD/MM/YYYY'),
      '/materiais/' || s.id, 'risco:' || p_item || ':' || coalesce(p_previsao, i.previsao_entrega));
    if s.tarefa_id is not null then
      perform _evento(s.tarefa_id, 'risco_material', null, null,
        format('%s: entrega prevista %s após a data de necessidade', i.material, to_char(coalesce(p_previsao, i.previsao_entrega),'DD/MM/YYYY')));
    end if;
  elsif p_status in ('comprado','em_transporte') then
    perform _notificar(s.solicitante_id, 'material_comprado', i.material || ': ' || replace(p_status::text,'_',' '),
      'Previsão de entrega: ' || to_char(coalesce(p_previsao, i.previsao_entrega),'DD/MM/YYYY'), '/materiais/' || s.id);
  end if;
  perform _sol_atualizar_status(i.solicitacao_id);
end $$;

-- Almoxarifado registra saída/entrega na obra (pode ser parcial)
create or replace function item_registrar_envio(p_item uuid, p_quantidade numeric, p_observacao text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes; v_id uuid;
begin
  if meu_papel() not in ('almoxarifado','admin') then raise exception 'Apenas o almoxarifado registra a entrega'; end if;
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if i.status not in ('disponivel_estoque','comprado','em_transporte','parcialmente_entregue') then
    raise exception 'Item não está pronto para entrega (status %)', i.status;
  end if;
  if p_quantidade is null or p_quantidade <= 0 or i.quantidade_enviada + p_quantidade > i.quantidade then
    raise exception 'Quantidade inválida: restam % % a enviar', trim_scale(i.quantidade - i.quantidade_enviada), i.unidade;
  end if;
  select * into s from solicitacoes where id = i.solicitacao_id;

  insert into entregas (item_id, quantidade_enviada, enviado_por, observacao)
  values (p_item, p_quantidade, auth.uid(), p_observacao) returning id into v_id;
  update solicitacao_itens set quantidade_enviada = quantidade_enviada + p_quantidade,
         status = case when quantidade_recebida > 0 then 'parcialmente_entregue'::status_material else 'em_transporte'::status_material end
   where id = p_item;
  perform _item_evento(p_item, i.status, case when i.quantidade_recebida > 0 then 'parcialmente_entregue'::status_material else 'em_transporte'::status_material end,
    p_quantidade, coalesce(p_observacao, 'Material enviado para a obra'), jsonb_build_object('entrega_id', v_id));
  perform _notificar(s.solicitante_id, 'material_enviado', 'Confirme o recebimento: ' || i.material,
    format('%s %s enviados para a obra (%s)', p_quantidade, i.unidade, _cod_sm(s.numero)), '/materiais/' || s.id);
  perform _sol_atualizar_status(i.solicitacao_id);
  return v_id;
end $$;

-- Encarregado confirma recebimento e quantidade efetivamente recebida
create or replace function entrega_confirmar(p_entrega uuid, p_quantidade_recebida numeric, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e entregas; i solicitacao_itens; s solicitacoes; v_novo status_material; v_tarefa tarefas; v_receb numeric;
begin
  select * into e from entregas where id = p_entrega for update;
  if not found then raise exception 'Entrega não encontrada'; end if;
  if e.recebido_em is not null then raise exception 'Esta entrega já foi confirmada'; end if;
  select * into i from solicitacao_itens where id = e.item_id for update;
  select * into s from solicitacoes where id = i.solicitacao_id;
  if not membro_obra(s.obra_id) or meu_papel() not in ('encarregado','engenheiro','admin') then
    raise exception 'Sem permissão para confirmar recebimento nesta obra';
  end if;
  if p_quantidade_recebida is null or p_quantidade_recebida < 0 or p_quantidade_recebida > e.quantidade_enviada then
    raise exception 'Quantidade recebida deve estar entre 0 e %', e.quantidade_enviada;
  end if;

  update entregas set quantidade_recebida = p_quantidade_recebida, recebido_por = auth.uid(), recebido_em = now(),
         observacao_recebimento = p_observacao
   where id = p_entrega;

  v_receb := i.quantidade_recebida + p_quantidade_recebida;
  v_novo := case when v_receb >= i.quantidade then 'entregue'
                 when v_receb > 0 then 'parcialmente_entregue'
                 else i.status end;
  -- divergência: o que não chegou volta a ficar pendente de envio
  update solicitacao_itens
     set quantidade_recebida = v_receb,
         quantidade_enviada  = quantidade_enviada - (e.quantidade_enviada - p_quantidade_recebida),
         status = v_novo,
         entregue_em = case when v_novo = 'entregue' then now() else entregue_em end
   where id = i.id;
  perform _item_evento(i.id, i.status, v_novo, p_quantidade_recebida,
    coalesce(p_observacao, 'Recebimento confirmado na obra'), jsonb_build_object('entrega_id', e.id, 'enviado', e.quantidade_enviada));

  if p_quantidade_recebida < e.quantidade_enviada then
    perform _notificar_papel('almoxarifado', 'divergencia_entrega', 'Divergência na entrega: ' || i.material,
      format('%s: enviado %s, recebido %s %s', _cod_sm(s.numero), e.quantidade_enviada, p_quantidade_recebida, i.unidade),
      '/materiais/' || s.id);
  end if;

  perform _sol_atualizar_status(s.id);

  -- tarefa parada por material: avisa quando todos os pedidos dela chegaram
  if s.tarefa_id is not null then
    select * into v_tarefa from tarefas where id = s.tarefa_id;
    perform _evento(s.tarefa_id, 'material_recebido', null, null,
      format('%s: recebido %s %s de %s', _cod_sm(s.numero), p_quantidade_recebida, i.unidade, i.material));
    if v_tarefa.status = 'aguardando_material' and not exists (
         select 1 from solicitacao_itens si join solicitacoes ss on ss.id = si.solicitacao_id
          where ss.tarefa_id = s.tarefa_id and si.status not in ('entregue','cancelado')) then
      perform _notificar(v_tarefa.encarregado_id, 'material_completo', 'Materiais entregues: ' || v_tarefa.titulo,
        'Todos os materiais pedidos chegaram. Você pode retomar o serviço.', '/tarefas/' || v_tarefa.id);
      perform _notificar_engenheiros(v_tarefa.obra_id, 'material_completo', 'Materiais entregues: ' || v_tarefa.titulo,
        _cod_tarefa(v_tarefa.numero) || ' pode ser retomada.', '/tarefas/' || v_tarefa.id);
    end if;
  end if;
end $$;

create or replace function item_cancelar(p_item uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare i solicitacao_itens; s solicitacoes;
begin
  select * into i from solicitacao_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado'; end if;
  select * into s from solicitacoes where id = i.solicitacao_id;
  if not (gere_obra(s.obra_id) or meu_papel() = 'compras' or s.solicitante_id = auth.uid()) then
    raise exception 'Sem permissão para cancelar este item';
  end if;
  if i.status in ('entregue','cancelado') or i.quantidade_recebida > 0 or i.quantidade_enviada > 0 then
    raise exception 'Item já enviado/entregue não pode ser cancelado';
  end if;
  if coalesce(length(trim(p_motivo)),0) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  update solicitacao_itens set status = 'cancelado' where id = p_item;
  perform _item_evento(p_item, i.status, 'cancelado', null, p_motivo);
  perform _notificar(s.solicitante_id, 'material_cancelado', 'Item cancelado: ' || i.material, p_motivo, '/materiais/' || s.id);
  perform _sol_atualizar_status(s.id);
end $$;

-- ---------------------------------------------------------------------
-- DIÁRIO DE OBRA
-- ---------------------------------------------------------------------
create or replace function diario_registrar(p_obra uuid, p_data date, p_dados jsonb, p_tarefas jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; d diario_obra; it jsonb;
begin
  if not membro_obra(p_obra) or meu_papel() not in ('encarregado','engenheiro','admin') then
    raise exception 'Sem permissão para registrar diário nesta obra';
  end if;
  if p_data > hoje() then raise exception 'Não é possível registrar diário de data futura'; end if;
  select * into d from diario_obra where obra_id = p_obra and data = p_data for update;
  if found and d.validado_em is not null then raise exception 'Diário já validado pelo engenheiro'; end if;

  insert into diario_obra (obra_id, data, clima, equipe_presente, equipe_descricao, servicos_executados, ocorrencias,
                           paralisacoes, necessidades_material, observacoes, registrado_por)
  values (p_obra, p_data, p_dados->>'clima', nullif(p_dados->>'equipe_presente','')::int, p_dados->>'equipe_descricao',
          p_dados->>'servicos_executados', p_dados->>'ocorrencias', p_dados->>'paralisacoes',
          p_dados->>'necessidades_material', p_dados->>'observacoes', auth.uid())
  on conflict (obra_id, data) do update set
    clima = excluded.clima, equipe_presente = excluded.equipe_presente, equipe_descricao = excluded.equipe_descricao,
    servicos_executados = excluded.servicos_executados, ocorrencias = excluded.ocorrencias,
    paralisacoes = excluded.paralisacoes, necessidades_material = excluded.necessidades_material,
    observacoes = excluded.observacoes
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_tarefas,'[]')) loop
    if not exists (select 1 from tarefas where id = (it->>'tarefa_id')::uuid and obra_id = p_obra) then
      raise exception 'Tarefa do diário não pertence à obra';
    end if;
    insert into diario_tarefas (diario_id, tarefa_id, quantidade_produzida, observacao)
    values (v_id, (it->>'tarefa_id')::uuid, nullif(it->>'quantidade_produzida','')::numeric, it->>'observacao')
    on conflict (diario_id, tarefa_id) do update set quantidade_produzida = excluded.quantidade_produzida, observacao = excluded.observacao;
  end loop;
  return v_id;
end $$;

create or replace function diario_validar(p_diario uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d diario_obra;
begin
  select * into d from diario_obra where id = p_diario for update;
  if not found then raise exception 'Diário não encontrado'; end if;
  perform _exige_gestor(d.obra_id);
  if d.validado_em is not null then raise exception 'Diário já validado'; end if;
  update diario_obra set validado_por = auth.uid(), validado_em = now() where id = p_diario;
end $$;

