-- =====================================================================
-- 0037 — RH/DP: Benefícios do mês (alimentação e passagem) por obra
--  Planilha do mês editável: dias, dias retroativos, faltas/descontos, quantidade de passagens por dia
--  e valor unitário de cada funcionário. Total por linha, por obra e geral. Fechar trava as edições.
-- =====================================================================
create table beneficio_competencias (
  id           uuid primary key default gen_random_uuid(),
  competencia  date not null unique check (extract(day from competencia) = 1),
  dias_uteis   int not null check (dias_uteis between 0 and 31),
  status       text not null default 'aberta' check (status in ('aberta','fechada')),
  observacoes  text,
  criado_por   uuid references perfis(id),
  criado_em    timestamptz not null default now(),
  fechado_por  uuid references perfis(id),
  fechado_em   timestamptz
);

create table beneficio_linhas (
  id               bigserial primary key,
  competencia_id   uuid not null references beneficio_competencias(id),
  obra_id          uuid references obras(id),
  funcionario_id   uuid not null references funcionarios(id),
  tipo             text not null check (tipo in ('alimentacao','passagem')),
  dias             numeric(6,2) not null default 0 check (dias >= 0),
  dias_retroativos numeric(6,2) not null default 0 check (dias_retroativos >= 0),
  dias_desconto    numeric(6,2) not null default 0 check (dias_desconto >= 0),
  qtd_dia          numeric(6,2) not null default 1 check (qtd_dia > 0),
  valor_unitario   numeric(10,2) not null check (valor_unitario >= 0),
  valor_total      numeric(12,2) generated always as (round(greatest(dias + dias_retroativos - dias_desconto, 0) * qtd_dia * valor_unitario, 2)) stored,
  observacao       text,
  atualizado_por   uuid references perfis(id),
  atualizado_em    timestamptz not null default now(),
  unique (competencia_id, funcionario_id, tipo)
);
create index on beneficio_linhas (competencia_id, obra_id);

alter table beneficio_competencias enable row level security;
alter table beneficio_linhas enable row level security;
revoke all on beneficio_competencias, beneficio_linhas from anon;
grant select on beneficio_competencias, beneficio_linhas to authenticated;
create policy benc_sel on beneficio_competencias for select to authenticated using (tem_papel('admin','rh','financeiro'));
create policy benl_sel on beneficio_linhas for select to authenticated using (tem_papel('admin','rh','financeiro'));
create trigger tg_beneficio_linhas_audit after insert or update or delete on beneficio_linhas for each row execute function _tg_auditoria();
create trigger tg_beneficio_comp_audit after insert or update on beneficio_competencias for each row execute function _tg_auditoria();

create or replace function _benef_editavel(p_comp uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas diretoria ou RH alteram os benefícios'; end if;
  if not exists (select 1 from beneficio_competencias where id = p_comp) then raise exception 'Mês de benefícios não encontrado'; end if;
  if exists (select 1 from beneficio_competencias where id = p_comp and status = 'fechada') then
    raise exception 'Os benefícios deste mês estão fechados: reabra para alterar';
  end if;
end $$;

create or replace function beneficio_competencia_criar(p_mes date, p_dias_uteis int, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas diretoria ou RH criam o mês de benefícios'; end if;
  insert into beneficio_competencias (competencia, dias_uteis, observacoes, criado_por)
  values (date_trunc('month', p_mes)::date, p_dias_uteis, nullif(trim(p_obs), ''), auth.uid())
  on conflict (competencia) do nothing returning id into v_id;
  if v_id is null then raise exception 'Este mês já existe'; end if;
  return v_id;
end $$;

-- Inclui ou altera uma linha (funcionário + tipo). p: {competencia_id, funcionario_id, obra_id, tipo, dias, dias_retroativos,
--   dias_desconto, qtd_dia, valor_unitario, observacao}
create or replace function beneficio_linha_salvar(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_comp uuid := (p->>'competencia_id')::uuid; v_func uuid := (p->>'funcionario_id')::uuid; v_id bigint; f funcionarios;
begin
  perform _benef_editavel(v_comp);
  select * into f from funcionarios where id = v_func;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if coalesce(p->>'tipo', '') not in ('alimentacao','passagem') then raise exception 'Escolha alimentação ou passagem'; end if;
  if nullif(p->>'valor_unitario', '') is null then raise exception 'Informe o valor'; end if;
  insert into beneficio_linhas (competencia_id, obra_id, funcionario_id, tipo, dias, dias_retroativos, dias_desconto, qtd_dia, valor_unitario, observacao, atualizado_por)
  values (v_comp, coalesce(nullif(p->>'obra_id','')::uuid, f.obra_id), v_func, p->>'tipo',
          coalesce(nullif(p->>'dias','')::numeric, 0), coalesce(nullif(p->>'dias_retroativos','')::numeric, 0),
          coalesce(nullif(p->>'dias_desconto','')::numeric, 0), coalesce(nullif(p->>'qtd_dia','')::numeric, 1),
          (p->>'valor_unitario')::numeric, nullif(trim(p->>'observacao'), ''), auth.uid())
  on conflict (competencia_id, funcionario_id, tipo) do update set
    obra_id = excluded.obra_id, dias = excluded.dias, dias_retroativos = excluded.dias_retroativos, dias_desconto = excluded.dias_desconto,
    qtd_dia = excluded.qtd_dia, valor_unitario = excluded.valor_unitario, observacao = excluded.observacao,
    atualizado_por = auth.uid(), atualizado_em = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function beneficio_linha_remover(p_linha bigint) returns void
language plpgsql security definer set search_path = public as $$
declare l beneficio_linhas;
begin
  select * into l from beneficio_linhas where id = p_linha;
  if not found then raise exception 'Linha não encontrada'; end if;
  perform _benef_editavel(l.competencia_id);
  delete from beneficio_linhas where id = p_linha;   -- fica registrado na auditoria
end $$;

create or replace function beneficio_competencia_situacao(p_comp uuid, p_fechar boolean, p_dias_uteis int default null, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_fechar is null then
    if not tem_papel('admin','rh') then raise exception 'Apenas diretoria ou RH alteram o mês'; end if;
    update beneficio_competencias set dias_uteis = coalesce(p_dias_uteis, dias_uteis), observacoes = coalesce(nullif(trim(p_obs), ''), observacoes) where id = p_comp;
  elsif p_fechar then
    if not tem_papel('admin','rh') then raise exception 'Apenas diretoria ou RH fecham os benefícios'; end if;
    update beneficio_competencias set status = 'fechada', fechado_por = auth.uid(), fechado_em = now() where id = p_comp and status = 'aberta';
  else
    if not tem_papel('admin') then raise exception 'Apenas a diretoria reabre os benefícios'; end if;
    update beneficio_competencias set status = 'aberta', fechado_por = null, fechado_em = null where id = p_comp;
  end if;
end $$;

revoke execute on function _benef_editavel(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['beneficio_competencia_criar(date,int,text)','beneficio_linha_salvar(jsonb)','beneficio_linha_remover(bigint)',
                           'beneficio_competencia_situacao(uuid,boolean,int,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
