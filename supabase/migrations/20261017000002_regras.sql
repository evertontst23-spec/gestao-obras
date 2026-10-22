-- =====================================================================
-- GESTÃO DE OBRAS — 02. REGRAS DE NEGÓCIO EM GATILHOS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários: notificação e evento de tarefa
-- ---------------------------------------------------------------------
create or replace function _notificar(p_usuario uuid, p_tipo text, p_titulo text,
                                      p_mensagem text, p_link text, p_chave text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null then return; end if;
  insert into notificacoes (usuario_id, tipo, titulo, mensagem, link, chave)
  values (p_usuario, p_tipo, p_titulo, p_mensagem, p_link, p_chave)
  on conflict (usuario_id, chave) do nothing;
end $$;

create or replace function _notificar_papel(p_papel papel_usuario, p_tipo text, p_titulo text,
                                            p_mensagem text, p_link text, p_chave text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from perfis where papel = p_papel and ativo loop
    perform _notificar(u, p_tipo, p_titulo, p_mensagem, p_link, p_chave);
  end loop;
end $$;

create or replace function _notificar_engenheiros(p_obra uuid, p_tipo text, p_titulo text,
                                                  p_mensagem text, p_link text, p_chave text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select * from _engenheiros_obra(p_obra) loop
    if u is distinct from auth.uid() then
      perform _notificar(u, p_tipo, p_titulo, p_mensagem, p_link, p_chave);
    end if;
  end loop;
end $$;

create or replace function _evento(p_tarefa uuid, p_tipo text, p_de status_tarefa, p_para status_tarefa,
                                   p_descricao text, p_dados jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into tarefa_eventos (tarefa_id, usuario_id, tipo, status_anterior, status_novo, percentual, descricao, dados)
  values (p_tarefa, auth.uid(), p_tipo, p_de, p_para,
          (select percentual from tarefas where id = p_tarefa), p_descricao, p_dados);
end $$;

create or replace function _item_evento(p_item uuid, p_de status_material, p_para status_material,
                                        p_qtd numeric, p_descricao text, p_dados jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into item_eventos (item_id, usuario_id, status_anterior, status_novo, quantidade, descricao, dados)
  values (p_item, auth.uid(), p_de, p_para, p_qtd, p_descricao, p_dados);
end $$;

create or replace function _cod_tarefa(n bigint) returns text language sql immutable as
$$ select 'T-' || lpad(n::text, 5, '0') $$;
create or replace function _cod_sm(n bigint) returns text language sql immutable as
$$ select 'SM-' || lpad(n::text, 5, '0') $$;

-- ---------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------
create or replace function _tg_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

create trigger tg_perfis_upd       before update on perfis            for each row execute function _tg_atualizado_em();
create trigger tg_obras_upd        before update on obras             for each row execute function _tg_atualizado_em();
create trigger tg_tarefas_upd      before update on tarefas           for each row execute function _tg_atualizado_em();
create trigger tg_solicitacoes_upd before update on solicitacoes      for each row execute function _tg_atualizado_em();
create trigger tg_itens_upd        before update on solicitacao_itens for each row execute function _tg_atualizado_em();

-- ---------------------------------------------------------------------
-- Auditoria genérica (quem, quando, antes/depois)
-- ---------------------------------------------------------------------
create or replace function _tg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id',
                   coalesce(to_jsonb(new), to_jsonb(old))->>'obra_id');
  insert into auditoria (tabela, registro_id, acao, usuario_id, antes, depois)
  values (tg_table_name, v_id, tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['perfis','obras','obra_membros','etapas','tarefas','reprogramacoes','impedimentos',
                           'solicitacoes','solicitacao_itens','entregas','anexos','diario_obra'] loop
    execute format('create trigger tg_%s_audit after insert or update or delete on %I
                    for each row execute function _tg_auditoria()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Regra 5: histórico operacional não pode ser excluído
-- ---------------------------------------------------------------------
create or replace function _tg_bloquear_exclusao() returns trigger language plpgsql as $$
begin
  raise exception 'Exclusão não permitida em "%": o histórico operacional é permanente. Use cancelamento.', tg_table_name
    using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['obras','etapas','tarefas','tarefa_eventos','reprogramacoes','impedimentos',
                           'solicitacoes','solicitacao_itens','item_eventos','entregas','diario_obra',
                           'diario_tarefas','auditoria','perfis'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I
                    for each row execute function _tg_bloquear_exclusao()', t, t);
  end loop;
end $$;

-- Auditoria é somente inserção
create or replace function _tg_auditoria_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Registros de auditoria são imutáveis'; end $$;
create trigger tg_auditoria_noupdate before update on auditoria for each row execute function _tg_auditoria_imutavel();
create trigger tg_eventos_noupdate   before update on tarefa_eventos for each row execute function _tg_auditoria_imutavel();
create trigger tg_ievent_noupdate    before update on item_eventos   for each row execute function _tg_auditoria_imutavel();

-- ---------------------------------------------------------------------
-- Perfil criado automaticamente para cada usuário do Auth.
-- O papel vem de raw_app_meta_data (só o servidor/admin consegue definir).
-- ---------------------------------------------------------------------
create or replace function _tg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, telefone, papel)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email, '@', 1)),
          new.email,
          new.raw_user_meta_data->>'telefone',
          coalesce((new.raw_app_meta_data->>'papel')::papel_usuario, 'encarregado'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger tg_auth_novo_usuario after insert on auth.users
  for each row execute function _tg_novo_usuario();

-- Somente admin altera papel/ativo/e-mail (ou o próprio banco, sem usuário logado)
create or replace function _tg_perfis_protecao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not e_admin() then
    if new.papel is distinct from old.papel or new.ativo is distinct from old.ativo
       or new.email is distinct from old.email then
      raise exception 'Apenas o administrador pode alterar papel, e-mail ou situação do usuário';
    end if;
  end if;
  if new.id <> old.id then raise exception 'Identificador do usuário é imutável'; end if;
  return new;
end $$;
create trigger tg_perfis_protecao before update on perfis for each row execute function _tg_perfis_protecao();

-- ---------------------------------------------------------------------
-- Obras: engenheiro que cria vira o responsável; responsáveis entram na equipe
-- ---------------------------------------------------------------------
create or replace function _tg_obras_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    if new.engenheiro_id is null and meu_papel() = 'engenheiro' then
      new.engenheiro_id := auth.uid();
    end if;
  end if;
  if new.engenheiro_id is not null and not exists (select 1 from perfis where id = new.engenheiro_id and papel in ('engenheiro','admin')) then
    raise exception 'O engenheiro responsável precisa ter perfil de engenheiro';
  end if;
  if new.encarregado_id is not null and not exists (select 1 from perfis where id = new.encarregado_id and papel = 'encarregado') then
    raise exception 'O encarregado responsável precisa ter perfil de encarregado';
  end if;
  return new;
end $$;
create trigger tg_obras_antes before insert or update on obras for each row execute function _tg_obras_antes();

create or replace function _tg_obras_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.engenheiro_id is not null then
    insert into obra_membros (obra_id, usuario_id, funcao, adicionado_por)
    values (new.id, new.engenheiro_id, 'Engenheiro responsável', auth.uid()) on conflict do nothing;
  end if;
  if new.encarregado_id is not null then
    insert into obra_membros (obra_id, usuario_id, funcao, adicionado_por)
    values (new.id, new.encarregado_id, 'Encarregado responsável', auth.uid()) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger tg_obras_depois after insert or update on obras for each row execute function _tg_obras_depois();

-- ---------------------------------------------------------------------
-- Tarefas: proteção de status/prazo (regras 2, 3 e 8)
-- Status, andamento e datas só mudam pelas funções de fluxo, que ligam
-- a variável de transação app.fluxo. Prazo só muda via reprogramação.
-- ---------------------------------------------------------------------
create or replace function _tg_tarefas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fluxo boolean := coalesce(current_setting('app.fluxo', true), '') = 'on';
begin
  if not exists (select 1 from perfis where id = new.encarregado_id and papel = 'encarregado' and ativo) then
    raise exception 'O responsável pela tarefa precisa ser um encarregado ativo';
  end if;
  if new.etapa_id is not null and not exists (select 1 from etapas where id = new.etapa_id and obra_id = new.obra_id) then
    raise exception 'A etapa informada não pertence a esta obra';
  end if;

  if tg_op = 'INSERT' then
    new.criado_por   := coalesce(auth.uid(), new.criado_por);
    new.status       := 'aguardando_confirmacao';
    new.percentual   := 0;
    new.quantidade_executada := 0;
    new.recebido_em  := null; new.inicio_real := null; new.concluido_em := null;
    new.aprovado_em  := null; new.aprovado_por := null;
    return new;
  end if;

  -- UPDATE
  if new.numero <> old.numero or new.obra_id <> old.obra_id or new.criado_por is distinct from old.criado_por
     or new.criado_em <> old.criado_em then
    raise exception 'Número, obra e autoria da tarefa não podem ser alterados';
  end if;

  if not v_fluxo then
    if new.inicio_previsto <> old.inicio_previsto or new.fim_previsto <> old.fim_previsto then
      raise exception 'Mudança de prazo exige reprogramação com justificativa';
    end if;
    if new.status <> old.status or new.percentual <> old.percentual
       or new.quantidade_executada <> old.quantidade_executada
       or new.recebido_em is distinct from old.recebido_em or new.inicio_real is distinct from old.inicio_real
       or new.concluido_em is distinct from old.concluido_em or new.aprovado_em is distinct from old.aprovado_em
       or new.aprovado_por is distinct from old.aprovado_por then
      raise exception 'Status e andamento só podem ser alterados pelas ações do fluxo da tarefa';
    end if;
    if old.status = 'aprovado' then
      raise exception 'Tarefa aprovada e finalizada não pode ser editada';
    end if;
    -- troca de responsável: volta a aguardar confirmação do novo encarregado
    if new.encarregado_id <> old.encarregado_id then
      if old.status in ('aguardando_validacao','concluido_encarregado') then
        raise exception 'Não é possível trocar o responsável de uma tarefa aguardando validação';
      end if;
      if old.status in ('aguardando_confirmacao','programado','pendente') then
        new.status := 'aguardando_confirmacao';
        new.recebido_em := null;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger tg_tarefas_antes before insert or update on tarefas for each row execute function _tg_tarefas_antes();

create or replace function _tg_tarefas_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_link text := '/tarefas/' || new.id;
begin
  -- encarregado passa a fazer parte da equipe da obra
  insert into obra_membros (obra_id, usuario_id, funcao, adicionado_por)
  values (new.obra_id, new.encarregado_id, 'Encarregado', auth.uid()) on conflict do nothing;

  if tg_op = 'INSERT' then
    perform _evento(new.id, 'criada', null, new.status,
      format('Tarefa criada. Prazo: %s a %s', to_char(new.inicio_previsto,'DD/MM/YYYY'), to_char(new.fim_previsto,'DD/MM/YYYY')));
    perform _notificar(new.encarregado_id, 'tarefa_atribuida',
      'Nova tarefa: ' || new.titulo,
      format('%s • Prazo até %s • Prioridade %s. Confirme o recebimento.', _cod_tarefa(new.numero),
             to_char(new.fim_previsto,'DD/MM/YYYY'), new.prioridade), v_link);
  elsif new.encarregado_id <> old.encarregado_id then
    perform _evento(new.id, 'responsavel_alterado', old.status, new.status,
      format('Responsável alterado de %s para %s',
        (select nome from perfis where id = old.encarregado_id), (select nome from perfis where id = new.encarregado_id)));
    perform _notificar(new.encarregado_id, 'tarefa_atribuida', 'Tarefa atribuída a você: ' || new.titulo,
      format('%s • Prazo até %s. Confirme o recebimento.', _cod_tarefa(new.numero), to_char(new.fim_previsto,'DD/MM/YYYY')), v_link);
    perform _notificar(old.encarregado_id, 'tarefa_removida', 'Tarefa reatribuída: ' || new.titulo,
      'Esta tarefa passou para outro encarregado.', v_link);
  elsif coalesce(current_setting('app.fluxo', true), '') <> 'on'
        and (new.titulo, new.descricao, new.local, new.quantidade_prevista, new.unidade, new.prioridade, new.etapa_id, new.observacoes)
            is distinct from
            (old.titulo, old.descricao, old.local, old.quantidade_prevista, old.unidade, old.prioridade, old.etapa_id, old.observacoes) then
    perform _evento(new.id, 'editada', old.status, new.status, 'Dados da tarefa atualizados pelo engenheiro');
    perform _notificar(new.encarregado_id, 'tarefa_editada', 'Tarefa atualizada: ' || new.titulo,
      'O engenheiro alterou informações desta tarefa.', v_link);
  end if;
  return new;
end $$;
create trigger tg_tarefas_depois after insert or update on tarefas for each row execute function _tg_tarefas_depois();

-- ---------------------------------------------------------------------
-- Solicitações: vínculo com a tarefa é imutável (regra 7)
-- ---------------------------------------------------------------------
create or replace function _tg_solicitacoes_antes() returns trigger language plpgsql as $$
begin
  if new.tarefa_id is distinct from old.tarefa_id or new.obra_id <> old.obra_id
     or new.solicitante_id <> old.solicitante_id or new.numero <> old.numero then
    raise exception 'Obra, tarefa de origem e solicitante da solicitação não podem ser alterados';
  end if;
  return new;
end $$;
create trigger tg_solicitacoes_antes before update on solicitacoes for each row execute function _tg_solicitacoes_antes();

-- Anexo precisa pertencer à mesma obra da tarefa/solicitação
create or replace function _tg_anexos_antes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.enviado_por := coalesce(auth.uid(), new.enviado_por);
  if new.tarefa_id is not null and not exists (select 1 from tarefas where id = new.tarefa_id and obra_id = new.obra_id) then
    raise exception 'Anexo: tarefa não pertence à obra';
  end if;
  if new.solicitacao_id is not null and not exists (select 1 from solicitacoes where id = new.solicitacao_id and obra_id = new.obra_id) then
    raise exception 'Anexo: solicitação não pertence à obra';
  end if;
  if split_part(new.caminho, '/', 1) <> new.obra_id::text then
    raise exception 'Anexo: o arquivo deve estar na pasta da obra';
  end if;
  return new;
end $$;
create trigger tg_anexos_antes before insert on anexos for each row execute function _tg_anexos_antes();

create or replace function _tg_anexos_depois() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tarefa_id is not null then
    perform _evento(new.tarefa_id, 'anexo', null, null, 'Arquivo anexado: ' || new.nome, jsonb_build_object('anexo_id', new.id));
  end if;
  return new;
end $$;
create trigger tg_anexos_depois after insert on anexos for each row execute function _tg_anexos_depois();
