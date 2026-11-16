-- Lançamentos restritos (pró-labore dos sócios): só quem está em acesso_restrito enxerga.
-- A trava é no banco (RLS), então vale para todas as telas, relatórios, exportações e auditoria.
create table if not exists acesso_restrito (usuario_id uuid primary key references perfis(id), criado_em timestamptz not null default now());
alter table acesso_restrito enable row level security;   -- sem políticas: ninguém lê nem altera pela aplicação

create or replace function ve_restrito() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from acesso_restrito where usuario_id = auth.uid()) $$;
grant execute on function ve_restrito() to authenticated;

alter table lancamentos add column if not exists restrito boolean not null default false;

drop policy if exists lanc_restrito on lancamentos;
create policy lanc_restrito on lancamentos as restrictive for select to authenticated using (not restrito or ve_restrito());

-- ninguém sem acesso altera (baixa, cancelamento, reprogramação) um lançamento restrito, nem por função
create or replace function _tg_lanc_restrito() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.restrito and auth.uid() is not null and not ve_restrito() then raise exception 'Lançamento não encontrado'; end if;
  if new.restrito is distinct from old.restrito and auth.uid() is not null and not ve_restrito() then raise exception 'Sem permissão'; end if;
  return new;
end $$;
drop trigger if exists tg_lanc_restrito on lancamentos;
create trigger tg_lanc_restrito before update on lancamentos for each row execute function _tg_lanc_restrito();

-- auditoria: registros de lançamentos restritos também ficam escondidos
create or replace function _lanc_e_restrito(p_id text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from lancamentos where id::text = p_id and restrito) $$;
drop policy if exists auditoria_restrito on auditoria;
create policy auditoria_restrito on auditoria as restrictive for select to authenticated
  using (tabela <> 'lancamentos' or ve_restrito() or not _lanc_e_restrito(registro_id));

-- novo lançamento pode nascer restrito (só para quem tem o acesso)
create or replace function lancamento_criar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tipo text := p->>'tipo'; v_id uuid;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro lançam contas'; end if;
  if nullif(p->>'vencimento','') is null then raise exception 'Informe o vencimento'; end if;
  if coalesce(nullif(p->>'valor','')::numeric, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  insert into lancamentos (obra_id, tipo, categoria, descricao, fornecedor_id, favorecido, valor, competencia, vencimento,
    documento_numero, caminho, origem, criado_por, restrito)
  values (nullif(p->>'obra_id','')::uuid, v_tipo, p->>'categoria', trim(p->>'descricao'), nullif(p->>'fornecedor_id','')::uuid,
    nullif(trim(p->>'favorecido'),''), (p->>'valor')::numeric, coalesce(nullif(p->>'competencia','')::date, hoje()),
    (p->>'vencimento')::date, nullif(p->>'documento_numero',''), nullif(p->>'caminho',''), 'manual', auth.uid(),
    coalesce((p->>'restrito')::boolean, false) and ve_restrito())
  returning id into v_id;
  if (p->>'liquidado')::boolean then
    perform lancamento_liquidar(v_id, coalesce(nullif(p->>'liquidado_em','')::date, hoje()), null, nullif(p->>'forma_pagamento',''), null);
  end if;
  return v_id;
end $$;

-- avisos de contas vencidas / a vencer não contam os restritos
do $$
declare v text := pg_get_functiondef('gerar_alertas()'::regprocedure);
begin
  if position('and not restrito' in v) = 0 then
    v := replace(v, 'from lancamentos where status = ''aberto'' and tipo = ''despesa''', 'from lancamentos where status = ''aberto'' and tipo = ''despesa'' and not restrito');
    execute v;
  end if;
end $$;

-- acesso inicial (Everton e Itamar) e marcação dos pró-labores já lançados: feitos direto em produção em 16/11/2026
