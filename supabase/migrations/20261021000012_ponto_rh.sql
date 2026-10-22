-- =====================================================================
-- 12. PONTO NO RH — correção de marcações pelo RH (sem apagar o original),
--     espelho de ponto acessível pelo funcionário (link pessoal) e
--     pedidos de correção feitos pelo próprio funcionário.
-- As marcações originais continuam imutáveis (Portaria MTP 671/2021):
-- o RH "desconsidera" a marcação errada e inclui a correta, com justificativa.
-- =====================================================================

create table ponto_desconsideracoes (
  registro_id bigint primary key references registros_ponto(id),
  motivo      text not null check (length(trim(motivo)) >= 5),
  por         uuid not null references perfis(id),
  em          timestamptz not null default now()
);

create table ponto_contestacoes (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios(id),
  data           date not null,
  mensagem       text not null check (length(trim(mensagem)) >= 5),
  status         text not null default 'aberta' check (status in ('aberta','corrigida','indeferida')),
  resposta       text,
  respondido_por uuid references perfis(id),
  respondido_em  timestamptz,
  criado_em      timestamptz not null default now()
);
create index on ponto_contestacoes (funcionario_id, status);

create table funcionario_acessos (
  token          text primary key,
  funcionario_id uuid not null references funcionarios(id),
  criado_por     uuid not null references perfis(id),
  criado_em      timestamptz not null default now(),
  revogado_em    timestamptz,
  ultimo_acesso  timestamptz
);
create unique index funcionario_acesso_ativo on funcionario_acessos (funcionario_id) where revogado_em is null;

-- ---------------------------------------------------------------------
-- Espelho: cálculo interno (sem checagem) + versão com permissão
-- ---------------------------------------------------------------------
create or replace function _espelho_ponto(p_func uuid, p_inicio date, p_fim date)
returns table (data date, dia_semana int, feriado text, marcacoes jsonb, trabalhado_min int, previsto_min int,
               he_util_min int, he_100_min int, atraso_min int, falta boolean, abonado text, incompleto boolean)
language plpgsql stable security definer set search_path = public as $$
declare f record; par dp_parametros; d date; regs record; v_ent timestamptz; v_trab int; v_prev int; v_marc jsonb; v_inc boolean;
        v_fer text; v_ab text; v_dif int; v_horas_ab numeric; v_validas int;
begin
  select fu.*, coalesce(fn.carga_diaria_horas, 8) as carga into f from funcionarios fu left join funcoes fn on fn.id = fu.funcao_id where fu.id = p_func;
  if not found then return; end if;
  select * into par from dp_parametros where id = 1;
  d := p_inicio;
  while d <= p_fim loop
    if d >= f.data_admissao and (f.data_demissao is null or d <= f.data_demissao) and d <= hoje() then
      v_trab := 0; v_ent := null; v_inc := false; v_marc := '[]'::jsonb; v_validas := 0;
      for regs in select r.*, pd.motivo as desc_motivo from registros_ponto r left join ponto_desconsideracoes pd on pd.registro_id = r.id
                   where r.funcionario_id = p_func and r.data = d order by r.momento loop
        v_marc := v_marc || jsonb_strip_nulls(jsonb_build_object('id', regs.id, 't', regs.tipo,
                    'h', to_char(regs.momento at time zone 'America/Recife', 'HH24:MI'), 'm', regs.metodo,
                    'j', regs.justificativa, 'x', regs.desc_motivo));
        continue when regs.desc_motivo is not null;          -- desconsiderada pelo RH
        v_validas := v_validas + 1;
        if regs.tipo = 'entrada' then
          if v_ent is not null then v_inc := true; end if;
          v_ent := regs.momento;
        elsif v_ent is not null then
          v_trab := v_trab + floor(extract(epoch from regs.momento - v_ent) / 60)::int; v_ent := null;
        else v_inc := true; end if;
      end loop;
      if v_ent is not null and d < hoje() then v_inc := true; end if;   -- hoje: turno ainda em andamento
      select descricao into v_fer from feriados fe where fe.data = d and fe.ambito <> 'facultativo';
      v_prev := case when v_fer is not null or extract(isodow from d) = 7 then 0
                     when extract(isodow from d) = 6 then round(par.jornada_sabado_horas * 60)
                     else round(f.carga * 60) end;
      select string_agg(a.tipo || coalesce(' ' || a.horas || 'h', ''), ', '), sum(case when a.tipo = 'declaracao_horas' then a.horas end)
        into v_ab, v_horas_ab
        from atestados a where a.funcionario_id = p_func and d between a.data_inicio and a.data_inicio + greatest(a.dias - 1, 0);
      data := d; dia_semana := extract(isodow from d); feriado := v_fer; marcacoes := v_marc; trabalhado_min := v_trab;
      previsto_min := v_prev; incompleto := v_inc; abonado := v_ab;
      he_util_min := 0; he_100_min := 0; atraso_min := 0; falta := false;
      if v_inc or d = hoje() then
        null;   -- marcação incompleta (ou o dia de hoje, ainda aberto): não calcula HE/atraso/falta
      elsif v_fer is not null or extract(isodow from d) = 7 then
        he_100_min := v_trab;
      else
        v_dif := v_trab - v_prev;
        if v_dif > par.tolerancia_minutos then he_util_min := v_dif; end if;
        if v_prev > 0 and v_trab = 0 and v_validas = 0 and v_ab is null then
          falta := true;
        elsif v_dif < -par.tolerancia_minutos and v_prev > 0 then
          atraso_min := greatest(0, -v_dif - coalesce(round(v_horas_ab * 60), 0)::int);
          if v_ab is not null and coalesce(v_horas_ab, 0) = 0 then atraso_min := 0; end if;  -- atestado de dia inteiro
        end if;
      end if;
      return next;
    end if;
    d := d + 1;
  end loop;
end $$;

create or replace function espelho_ponto(p_func uuid, p_inicio date, p_fim date)
returns table (data date, dia_semana int, feriado text, marcacoes jsonb, trabalhado_min int, previsto_min int,
               he_util_min int, he_100_min int, atraso_min int, falta boolean, abonado text, incompleto boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not _pode_ver_dp(p_func) then raise exception 'Sem permissão para ver o ponto deste funcionário'; end if;
  return query select * from _espelho_ponto(p_func, p_inicio, p_fim);
end $$;

-- ---------------------------------------------------------------------
-- Correção pelo RH
-- ---------------------------------------------------------------------
create or replace function ponto_corrigir_dia(p_func uuid, p_data date, p_desconsiderar bigint[], p_incluir jsonb,
                                              p_justificativa text, p_contestacao uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare f funcionarios; v_id bigint; it jsonb; v_mom timestamptz; n int := 0;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas o RH corrige marcações de ponto'; end if;
  select * into f from funcionarios where id = p_func;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if coalesce(length(trim(p_justificativa)), 0) < 5 then raise exception 'Justifique a correção (ex.: esqueceu de bater a saída — confirmado pelo encarregado)'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Data inválida'; end if;
  if exists (select 1 from folhas where competencia = date_trunc('month', p_data)::date) then
    raise exception 'A folha de % já foi fechada — o ponto deste mês não pode mais ser alterado', to_char(p_data, 'MM/YYYY');
  end if;
  foreach v_id in array coalesce(p_desconsiderar, '{}') loop
    if not exists (select 1 from registros_ponto where id = v_id and funcionario_id = p_func and data = p_data) then
      raise exception 'Marcação % não pertence a este funcionário/dia', v_id;
    end if;
    insert into ponto_desconsideracoes (registro_id, motivo, por) values (v_id, trim(p_justificativa), auth.uid())
    on conflict (registro_id) do nothing;
    n := n + 1;
  end loop;
  for it in select * from jsonb_array_elements(coalesce(p_incluir, '[]')) loop
    continue when coalesce(it->>'hora', '') = '';
    if it->>'tipo' not in ('entrada','saida') then raise exception 'Informe se a marcação é entrada ou saída'; end if;
    v_mom := (p_data + (it->>'hora')::time) at time zone 'America/Recife';
    if v_mom > now() then raise exception 'Não é possível incluir marcação no futuro'; end if;
    perform _ponto_inserir(p_func, f.obra_id, v_mom, it->>'tipo', 'manual', null, null, null, null, 'Correção RH: ' || trim(p_justificativa));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nada a corrigir: marque uma marcação para desconsiderar ou inclua um horário'; end if;
  if p_contestacao is not null then
    update ponto_contestacoes set status = 'corrigida', resposta = trim(p_justificativa), respondido_por = auth.uid(), respondido_em = now()
     where id = p_contestacao and funcionario_id = p_func and status = 'aberta';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Link pessoal do funcionário
-- ---------------------------------------------------------------------
create or replace function ponto_link_gerar(p_func uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas o RH gera o acesso do funcionário'; end if;
  if not exists (select 1 from funcionarios where id = p_func and ativo) then raise exception 'Funcionário não encontrado ou desligado'; end if;
  update funcionario_acessos set revogado_em = now() where funcionario_id = p_func and revogado_em is null;
  insert into funcionario_acessos (token, funcionario_id, criado_por) values (v_token, p_func, auth.uid());
  return v_token;
end $$;

create or replace function ponto_link_revogar(p_func uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','rh') then raise exception 'Sem permissão'; end if;
  update funcionario_acessos set revogado_em = now() where funcionario_id = p_func and revogado_em is null;
end $$;

create or replace function _func_do_token(p_token text) returns funcionarios
language plpgsql security definer set search_path = public as $$
declare f funcionarios;
begin
  select fu.* into f from funcionario_acessos a join funcionarios fu on fu.id = a.funcionario_id
   where a.token = p_token and a.revogado_em is null and fu.ativo and length(p_token) = 64;
  if not found then raise exception 'Link inválido ou desativado. Peça um novo link ao RH.'; end if;
  return f;
end $$;

-- Consulta do funcionário (sem login): espelho do mês + pedidos de correção
create or replace function espelho_publico(p_token text, p_mes date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f funcionarios; v_ini date := date_trunc('month', coalesce(p_mes, hoje()))::date; v_fim date; v jsonb;
begin
  f := _func_do_token(p_token);
  v_ini := greatest(v_ini, date_trunc('month', hoje() - interval '12 months')::date);   -- últimos 12 meses
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  update funcionario_acessos set ultimo_acesso = now() where token = p_token;
  select jsonb_build_object(
    'funcionario', jsonb_build_object('nome', f.nome, 'matricula', f.matricula,
       'funcao', (select nome from funcoes where id = f.funcao_id), 'obra', (select codigo || ' — ' || nome from obras where id = f.obra_id),
       'admissao', f.data_admissao),
    'mes', to_char(v_ini, 'YYYY-MM'),
    'fechada', exists (select 1 from folhas where competencia = v_ini),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('data', e.data, 'dia_semana', e.dia_semana, 'feriado', e.feriado,
               'marcacoes', (select coalesce(jsonb_agg(m - 'id'), '[]') from jsonb_array_elements(e.marcacoes) m),
               'trabalhado_min', e.trabalhado_min, 'he_util_min', e.he_util_min, 'he_100_min', e.he_100_min,
               'atraso_min', e.atraso_min, 'falta', e.falta, 'abonado', e.abonado is not null, 'incompleto', e.incompleto) order by e.data)
             from _espelho_ponto(f.id, v_ini, v_fim) e), '[]'),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('data', c.data, 'mensagem', c.mensagem, 'status', c.status,
               'resposta', c.resposta, 'criado_em', c.criado_em) order by c.criado_em desc)
             from ponto_contestacoes c where c.funcionario_id = f.id and c.criado_em > now() - interval '120 days'), '[]'))
  into v;
  return v;
end $$;

create or replace function ponto_contestar(p_token text, p_data date, p_mensagem text) returns void
language plpgsql security definer set search_path = public as $$
declare f funcionarios;
begin
  f := _func_do_token(p_token);
  if p_data is null or p_data > hoje() or p_data < f.data_admissao or p_data < hoje() - 90 then raise exception 'Escolha um dia dos últimos 90 dias'; end if;
  if coalesce(length(trim(p_mensagem)), 0) < 5 then raise exception 'Explique o que está errado (ex.: entrei às 7h e não registrou)'; end if;
  if (select count(*) from ponto_contestacoes where funcionario_id = f.id and status = 'aberta') >= 10 then
    raise exception 'Você já tem 10 pedidos aguardando o RH. Aguarde a resposta.';
  end if;
  insert into ponto_contestacoes (funcionario_id, data, mensagem) values (f.id, p_data, left(trim(p_mensagem), 1000));
  perform _notificar_papeis(array['rh','admin'], 'ponto_contestacao', 'Pedido de correção de ponto — ' || f.nome,
    to_char(p_data, 'DD/MM') || ': ' || left(trim(p_mensagem), 120),
    format('/dp/espelho?mes=%s&func=%s&dia=%s', to_char(p_data, 'YYYY-MM'), f.id, p_data));
end $$;

create or replace function ponto_contestacao_responder(p_id uuid, p_status text, p_resposta text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','rh') then raise exception 'Sem permissão'; end if;
  if p_status not in ('corrigida','indeferida') then raise exception 'Resposta inválida'; end if;
  if coalesce(length(trim(p_resposta)), 0) < 5 then raise exception 'Escreva a resposta ao funcionário'; end if;
  update ponto_contestacoes set status = p_status, resposta = trim(p_resposta), respondido_por = auth.uid(), respondido_em = now()
   where id = p_id and status = 'aberta';
  if not found then raise exception 'Pedido não encontrado ou já respondido'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Imutabilidade, auditoria, RLS e permissões
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ponto_desconsideracoes','ponto_contestacoes','funcionario_acessos'] loop
    execute format('create trigger tg_%s_nodelete before delete on %I for each row execute function _tg_bloquear_exclusao()', t, t);
    execute format('create trigger tg_%s_audit after insert or update or delete on %I for each row execute function _tg_auditoria()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
create trigger tg_pdesc_noupdate before update on ponto_desconsideracoes for each row execute function _tg_auditoria_imutavel();

create policy pdesc_sel on ponto_desconsideracoes for select to authenticated
  using (exists (select 1 from registros_ponto r where r.id = registro_id));
create policy pcont_sel on ponto_contestacoes for select to authenticated
  using (tem_papel('admin','rh') or exists (select 1 from funcionarios f where f.id = funcionario_id and f.usuario_id = auth.uid()));
create policy facess_sel on funcionario_acessos for select to authenticated using (tem_papel('admin','rh'));

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    if f.proname like '\_%' then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    else
      execute format('revoke execute on function %s from public, anon', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig);
      begin execute format('grant execute on function %s to service_role', f.sig); exception when undefined_object then null; end;
    end if;
  end loop;
end $$;
-- únicas funções liberadas sem login (protegidas pelo token de 64 caracteres)
grant execute on function espelho_publico(text, date) to anon;
grant execute on function ponto_contestar(text, date, text) to anon;
