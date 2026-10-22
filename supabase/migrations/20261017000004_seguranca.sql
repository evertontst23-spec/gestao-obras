-- =====================================================================
-- GESTÃO DE OBRAS — 04. SEGURANÇA (RLS), ALERTAS, TEMPO REAL, STORAGE
-- =====================================================================

-- ---------------------------------------------------------------------
-- Row Level Security em todas as tabelas
-- ---------------------------------------------------------------------
alter table perfis            enable row level security;
alter table obras             enable row level security;
alter table obra_membros      enable row level security;
alter table etapas            enable row level security;
alter table tarefas           enable row level security;
alter table tarefa_eventos    enable row level security;
alter table reprogramacoes    enable row level security;
alter table impedimentos      enable row level security;
alter table solicitacoes      enable row level security;
alter table solicitacao_itens enable row level security;
alter table item_eventos      enable row level security;
alter table entregas          enable row level security;
alter table anexos            enable row level security;
alter table diario_obra       enable row level security;
alter table diario_tarefas    enable row level security;
alter table notificacoes      enable row level security;
alter table auditoria         enable row level security;

-- Visitantes não autenticados não acessam nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- PERFIS: todos os colaboradores logados veem nomes; cada um edita o próprio; admin edita todos
create policy perfis_select on perfis for select to authenticated using (meu_papel() is not null);
create policy perfis_update on perfis for update to authenticated
  using (id = auth.uid() or e_admin()) with check (id = auth.uid() or e_admin());

-- OBRAS
create policy obras_select on obras for select to authenticated
  using (engenheiro_id = auth.uid() or encarregado_id = auth.uid() or membro_obra(id));
create policy obras_insert on obras for insert to authenticated
  with check (meu_papel() in ('admin','engenheiro'));
create policy obras_update on obras for update to authenticated
  using (gere_obra(id)) with check (gere_obra(id));

-- EQUIPE DA OBRA
create policy membros_select on obra_membros for select to authenticated using (membro_obra(obra_id));
create policy membros_insert on obra_membros for insert to authenticated with check (gere_obra(obra_id));
create policy membros_delete on obra_membros for delete to authenticated using (gere_obra(obra_id));

-- ETAPAS
create policy etapas_select on etapas for select to authenticated using (membro_obra(obra_id));
create policy etapas_insert on etapas for insert to authenticated with check (gere_obra(obra_id));
create policy etapas_update on etapas for update to authenticated using (gere_obra(obra_id)) with check (gere_obra(obra_id));

-- TAREFAS: encarregado vê as suas (e todas da obra se for o encarregado responsável);
-- demais perfis veem as das obras a que têm acesso. Criação/edição: engenheiro da obra.
create or replace function ve_tarefa(p_obra uuid, p_encarregado uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_encarregado = auth.uid()
      or (meu_papel() <> 'encarregado' and membro_obra(p_obra))
      or exists (select 1 from obras o where o.id = p_obra and o.encarregado_id = auth.uid())
$$;
create policy tarefas_select on tarefas for select to authenticated using (ve_tarefa(obra_id, encarregado_id));
create policy tarefas_insert on tarefas for insert to authenticated with check (gere_obra(obra_id));
create policy tarefas_update on tarefas for update to authenticated using (gere_obra(obra_id)) with check (gere_obra(obra_id));

-- HISTÓRICOS DA TAREFA (somente leitura; escrita só pelas funções de fluxo)
create policy eventos_select on tarefa_eventos for select to authenticated
  using (exists (select 1 from tarefas t where t.id = tarefa_id));
create policy reprog_select on reprogramacoes for select to authenticated
  using (exists (select 1 from tarefas t where t.id = tarefa_id));
create policy imped_select on impedimentos for select to authenticated
  using (exists (select 1 from tarefas t where t.id = tarefa_id));

-- MATERIAIS (escrita só pelas funções de fluxo)
create policy sol_select on solicitacoes for select to authenticated using (membro_obra(obra_id));
create policy itens_select on solicitacao_itens for select to authenticated
  using (exists (select 1 from solicitacoes s where s.id = solicitacao_id));
create policy ievent_select on item_eventos for select to authenticated
  using (exists (select 1 from solicitacao_itens i where i.id = item_id));
create policy entregas_select on entregas for select to authenticated
  using (exists (select 1 from solicitacao_itens i where i.id = item_id));

-- ANEXOS
create policy anexos_select on anexos for select to authenticated using (membro_obra(obra_id));
create policy anexos_insert on anexos for insert to authenticated
  with check (membro_obra(obra_id) and enviado_por = auth.uid());

-- DIÁRIO (escrita pelas funções diario_registrar / diario_validar)
create policy diario_select on diario_obra for select to authenticated using (membro_obra(obra_id));
create policy diario_tarefas_select on diario_tarefas for select to authenticated
  using (exists (select 1 from diario_obra d where d.id = diario_id));

-- NOTIFICAÇÕES: cada um vê as suas e só pode marcar como lida
create policy notif_select on notificacoes for select to authenticated using (usuario_id = auth.uid());
create policy notif_update on notificacoes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
revoke update on notificacoes from authenticated;
grant update (lida) on notificacoes to authenticated;

-- AUDITORIA: somente diretoria
create policy auditoria_select on auditoria for select to authenticated using (e_admin());

-- Colunas de perfis que o próprio usuário pode alterar
revoke update on perfis from authenticated;
grant update (nome, telefone, papel, ativo) on perfis to authenticated;  -- papel/ativo protegidos por gatilho

-- =====================================================================
-- ALERTAS AUTOMÁTICOS DE PRAZO
-- Executado pelo pg_cron (de hora em hora) ou pela rota /api/cron/alertas.
-- A "chave" com a data impede alerta repetido no mesmo dia.
-- =====================================================================
create or replace function gerar_alertas() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_hoje date := hoje(); v_antes int; v_depois int; v_eng uuid;
begin
  if auth.uid() is not null and not e_admin() then
    raise exception 'Apenas a diretoria pode disparar os alertas manualmente';
  end if;
  select count(*) into v_antes from notificacoes;

  -- 1. Serviço programado para começar hoje
  for r in select * from tarefas where inicio_previsto = v_hoje and status in ('aguardando_confirmacao','programado') loop
    perform _notificar(r.encarregado_id, 'inicio_hoje', 'Começa hoje: ' || r.titulo,
      _cod_tarefa(r.numero) || ' está programada para iniciar hoje.', '/tarefas/' || r.id, 'inicio:' || r.id || ':' || v_hoje);
  end loop;

  -- 2. Próximo do vencimento (até 2 dias)
  for r in select * from tarefas where fim_previsto between v_hoje and v_hoje + 2
             and status not in ('aprovado','aguardando_validacao','concluido_encarregado') loop
    perform _notificar(r.encarregado_id, 'vencimento_proximo', 'Prazo próximo: ' || r.titulo,
      format('%s vence em %s (%s%% executado).', _cod_tarefa(r.numero), to_char(r.fim_previsto,'DD/MM'), r.percentual),
      '/tarefas/' || r.id, 'vence:' || r.id || ':' || v_hoje);
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'vencimento_proximo', 'Prazo próximo: ' || r.titulo,
        format('%s vence em %s (%s%% executado).', _cod_tarefa(r.numero), to_char(r.fim_previsto,'DD/MM'), r.percentual),
        '/tarefas/' || r.id, 'vence:' || r.id || ':' || v_hoje);
    end loop;
  end loop;

  -- 3. Serviço atrasado
  for r in select * from tarefas where fim_previsto < v_hoje
             and status not in ('aprovado','aguardando_validacao','concluido_encarregado') loop
    perform _notificar(r.encarregado_id, 'atrasado', 'ATRASADA: ' || r.titulo,
      format('%s venceu em %s (%s dia(s) de atraso).', _cod_tarefa(r.numero), to_char(r.fim_previsto,'DD/MM'), v_hoje - r.fim_previsto),
      '/tarefas/' || r.id, 'atraso:' || r.id || ':' || v_hoje);
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'atrasado', 'ATRASADA: ' || r.titulo,
        format('%s venceu em %s (%s dia(s) de atraso).', _cod_tarefa(r.numero), to_char(r.fim_previsto,'DD/MM'), v_hoje - r.fim_previsto),
        '/tarefas/' || r.id, 'atraso:' || r.id || ':' || v_hoje);
    end loop;
  end loop;

  -- 4. Paralisado por falta de material
  for r in select * from tarefas where status = 'aguardando_material' loop
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'paralisado_material', 'Parado por material: ' || r.titulo,
        _cod_tarefa(r.numero) || ' continua aguardando material.', '/tarefas/' || r.id, 'parmat:' || r.id || ':' || v_hoje);
    end loop;
  end loop;

  -- 5. Concluído aguardando aprovação há mais de 1 dia
  for r in select * from tarefas where status in ('aguardando_validacao','concluido_encarregado') and concluido_em < now() - interval '1 day' loop
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'aguardando_validacao', 'Validação pendente: ' || r.titulo,
        _cod_tarefa(r.numero) || ' aguarda sua validação.', '/tarefas/' || r.id, 'valid:' || r.id || ':' || v_hoje);
    end loop;
  end loop;

  -- 6. Solicitação pendente de aprovação há mais de 4 horas
  for r in select * from solicitacoes where status = 'aguardando_aprovacao' and criado_em < now() - interval '4 hours' loop
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'material_aprovacao', 'Pedido aguardando aprovação ' || _cod_sm(r.numero),
        'Necessário em ' || to_char(r.data_necessidade,'DD/MM/YYYY'), '/materiais/' || r.id, 'solpend:' || r.id || ':' || v_hoje);
    end loop;
  end loop;

  -- 7. Material com data de necessidade próxima (até 3 dias) ainda não entregue
  for r in select i.*, s.obra_id, s.solicitante_id, s.numero as sm from solicitacao_itens i join solicitacoes s on s.id = i.solicitacao_id
            where i.status not in ('entregue','cancelado','aguardando_aprovacao','solicitado')
              and i.data_necessidade between v_hoje and v_hoje + 3 loop
    perform _notificar(r.solicitante_id, 'necessidade_proxima', 'Material necessário em breve: ' || r.material,
      format('%s • necessário em %s • status: %s', _cod_sm(r.sm), to_char(r.data_necessidade,'DD/MM'), replace(r.status::text,'_',' ')),
      '/materiais/' || r.solicitacao_id, 'nec:' || r.id || ':' || v_hoje);
    perform _notificar_papel(case when r.status in ('aprovado','disponivel_estoque','parcialmente_entregue') then 'almoxarifado'::papel_usuario else 'compras'::papel_usuario end,
      'necessidade_proxima', 'Prioridade: ' || r.material,
      format('%s • necessário em %s', _cod_sm(r.sm), to_char(r.data_necessidade,'DD/MM')),
      '/materiais/' || r.solicitacao_id, 'nec:' || r.id || ':' || v_hoje);
  end loop;

  -- 8. Compra com entrega atrasada
  for r in select i.*, s.obra_id, s.numero as sm from solicitacao_itens i join solicitacoes s on s.id = i.solicitacao_id
            where i.status in ('compra_autorizada','comprado','em_transporte') and i.previsao_entrega < v_hoje loop
    perform _notificar_papel('compras', 'entrega_atrasada', 'Entrega atrasada: ' || r.material,
      format('%s • previsto %s • fornecedor %s', _cod_sm(r.sm), to_char(r.previsao_entrega,'DD/MM'), coalesce(r.fornecedor,'-')),
      '/materiais/' || r.solicitacao_id, 'entatr:' || r.id || ':' || v_hoje);
    for v_eng in select * from _engenheiros_obra(r.obra_id) loop
      perform _notificar(v_eng, 'entrega_atrasada', 'Entrega atrasada: ' || r.material,
        format('%s • previsto %s', _cod_sm(r.sm), to_char(r.previsao_entrega,'DD/MM')),
        '/materiais/' || r.solicitacao_id, 'entatr:' || r.id || ':' || v_hoje);
    end loop;
  end loop;

  select count(*) into v_depois from notificacoes;
  return v_depois - v_antes;
end $$;

-- Agendamento no banco (Supabase: extensão pg_cron). Se não estiver disponível,
-- use a rota /api/cron/alertas (ver docs/IMPLANTACAO.md).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('gerar-alertas-obras', '5 * * * *', 'select public.gerar_alertas()');
exception when others then
  raise notice 'pg_cron indisponível (%). Use a rota /api/cron/alertas.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Tempo real (Supabase Realtime)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table notificacoes, tarefas, solicitacao_itens, solicitacoes;
exception when undefined_object then
  raise notice 'Publicação supabase_realtime não encontrada';
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket privado "anexos", pasta = id da obra
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 15728640,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy anexos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.membro_obra(public.uuid_ou_nulo((storage.foldername(name))[1])));
create policy anexos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.membro_obra(public.uuid_ou_nulo((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- Funções internas (prefixo "_") não ficam expostas pela API REST/RPC
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname not like '\_%' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    begin execute format('grant execute on function %s to service_role', f.sig); exception when undefined_object then null; end;
  end loop;
end $$;
