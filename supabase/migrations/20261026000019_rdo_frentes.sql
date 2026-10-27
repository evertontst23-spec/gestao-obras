-- =====================================================================
-- 0019 — RDO por frentes de serviço; responsável pela obra e pelas tarefas
--  * Diário: em vez de "equipe presente", cada frente de serviço diz o serviço, o local e quem trabalhou
--    nela (funcionário e função). O total de pessoas e a composição da equipe saem das frentes.
--  * A obra e as tarefas podem ter como responsável um encarregado, o engenheiro ou a diretoria.
-- =====================================================================
alter table diario_obra add column frentes jsonb not null default '[]';

create or replace function diario_registrar(p_obra uuid, p_data date, p_dados jsonb, p_tarefas jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; d diario_obra; it jsonb; v_frentes jsonb := coalesce(p_dados->'frentes', '[]'); v_pessoas int; v_comp text; v_serv text;
begin
  if not membro_obra(p_obra) or meu_papel() not in ('encarregado','engenheiro','admin') then
    raise exception 'Sem permissão para registrar diário nesta obra';
  end if;
  if p_data > hoje() then raise exception 'Não é possível registrar diário de data futura'; end if;
  select * into d from diario_obra where obra_id = p_obra and data = p_data for update;
  if found and d.validado_em is not null then raise exception 'Diário já validado pelo engenheiro'; end if;
  -- frentes de serviço: [{servico, local, tarefa_id, equipe: [{funcionario_id, nome, funcao}]}]
  if jsonb_typeof(v_frentes) <> 'array' then raise exception 'Frentes de serviço inválidas'; end if;
  if exists (select 1 from jsonb_array_elements(v_frentes) fr where coalesce(trim(fr->>'servico'), '') = '') then
    raise exception 'Informe o serviço de cada frente';
  end if;
  select count(distinct coalesce(p->>'funcionario_id', lower(trim(p->>'nome')))) into v_pessoas
    from jsonb_array_elements(v_frentes) fr, jsonb_array_elements(coalesce(fr->'equipe', '[]')) p
   where coalesce(p->>'funcionario_id', trim(p->>'nome'), '') <> '';
  select string_agg(n || ' ' || f, ', ' order by n desc, f) into v_comp from (
    select coalesce(nullif(trim(p->>'funcao'), ''), 'sem função') f, count(distinct coalesce(p->>'funcionario_id', lower(trim(p->>'nome')))) n
      from jsonb_array_elements(v_frentes) fr, jsonb_array_elements(coalesce(fr->'equipe', '[]')) p
     where coalesce(p->>'funcionario_id', trim(p->>'nome'), '') <> '' group by 1) x;
  select string_agg('• ' || trim(fr->>'servico') || coalesce(' (' || nullif(trim(fr->>'local'), '') || ')', ''), E'\n') into v_serv
    from jsonb_array_elements(v_frentes) fr;
  if coalesce(trim(p_dados->>'servicos_executados'), '') = '' and v_serv is null then
    raise exception 'Informe pelo menos uma frente de serviço ou descreva os serviços executados';
  end if;

  insert into diario_obra (obra_id, data, clima, equipe_presente, equipe_descricao, servicos_executados, ocorrencias,
                           paralisacoes, necessidades_material, observacoes, registrado_por, frentes)
  values (p_obra, p_data, p_dados->>'clima',
          case when jsonb_array_length(v_frentes) > 0 then v_pessoas else nullif(p_dados->>'equipe_presente','')::int end,
          case when jsonb_array_length(v_frentes) > 0 then v_comp else p_dados->>'equipe_descricao' end,
          coalesce(nullif(trim(p_dados->>'servicos_executados'), ''), v_serv), p_dados->>'ocorrencias', p_dados->>'paralisacoes',
          p_dados->>'necessidades_material', p_dados->>'observacoes', auth.uid(), v_frentes)
  on conflict (obra_id, data) do update set
    clima = excluded.clima, equipe_presente = excluded.equipe_presente, equipe_descricao = excluded.equipe_descricao,
    servicos_executados = excluded.servicos_executados, ocorrencias = excluded.ocorrencias,
    paralisacoes = excluded.paralisacoes, necessidades_material = excluded.necessidades_material,
    observacoes = excluded.observacoes, frentes = excluded.frentes
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

create or replace function _tg_tarefas_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fluxo boolean := coalesce(current_setting('app.fluxo', true), '') = 'on';
begin
  if not exists (select 1 from perfis where id = new.encarregado_id and papel in ('encarregado','engenheiro','admin') and ativo) then
    raise exception 'O responsável pela tarefa precisa ser um encarregado ativo, o engenheiro ou a diretoria';
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
  if new.encarregado_id is not null and not exists (select 1 from perfis where id = new.encarregado_id and papel in ('encarregado','engenheiro','admin')) then
    raise exception 'O responsável pela obra precisa ser encarregado, engenheiro ou diretoria';
  end if;
  return new;
end $$;
