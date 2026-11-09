-- =====================================================================
-- 0050 — Notas e despesas avulsas
--  Cadastro só de notas/cupons do dia a dia (materiais diversos das obras, almoços, combustível,
--  frete…), separado do cadastro de insumos. Cada nota vira uma despesa no financeiro
--  (origem 'nota'), na obra/centro de custo informado. As categorias são editáveis.
-- =====================================================================
alter table lancamentos drop constraint if exists lancamentos_origem_check;
alter table lancamentos add constraint lancamentos_origem_check check (origem in ('manual','oc','folha','bm','nota'));

create table categorias_nota (
  id             serial primary key,
  nome           text not null unique check (length(trim(nome)) >= 3),
  categoria_fin  text not null check (categoria_fin in ('material','equipamentos','servicos_terceiros','administrativo','outras_despesas','impostos','beneficios')),
  ativo          boolean not null default true,
  ordem          int not null default 100
);
insert into categorias_nota (nome, categoria_fin, ordem) values
  ('Materiais diversos da obra', 'material', 1),
  ('Alimentação / almoço', 'outras_despesas', 2),
  ('Combustível', 'outras_despesas', 3),
  ('Frete e transporte', 'servicos_terceiros', 4),
  ('Ferramentas e pequenos equipamentos', 'equipamentos', 5),
  ('Serviços avulsos', 'servicos_terceiros', 6),
  ('Escritório e administrativo', 'administrativo', 7),
  ('Outros', 'outras_despesas', 99);

create sequence nota_despesa_numero_seq;
create table notas_despesa (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint not null unique default nextval('nota_despesa_numero_seq'),
  categoria_id         int not null references categorias_nota(id),
  obra_id              uuid references obras(id),
  data_nota            date not null,
  estabelecimento      text not null check (length(trim(estabelecimento)) >= 2),
  documento_numero     text,
  descricao            text,
  valor                numeric(14,2) not null check (valor > 0),
  pago                 boolean not null default true,
  forma_pagamento      text,
  vencimento           date,
  caminho              text,
  lancamento_id        uuid references lancamentos(id),
  status               text not null default 'ativa' check (status in ('ativa','cancelada')),
  motivo_cancelamento  text,
  criado_por           uuid references perfis(id) default auth.uid(),
  criado_em            timestamptz not null default now()
);
create index on notas_despesa (data_nota desc);
create index on notas_despesa (obra_id, data_nota);

create or replace function _nota_permissao() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_papel('admin','financeiro','compras') then raise exception 'Apenas diretoria, financeiro ou compras registram notas'; end if;
end $$;

create or replace function nota_registrar(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare c categorias_nota; v_id uuid; v_lanc uuid; v_valor numeric; v_data date; v_pago boolean; v_venc date; v_desc text; v_estab text;
begin
  perform _nota_permissao();
  select * into c from categorias_nota where id = nullif(p->>'categoria_id','')::int and ativo;
  if not found then raise exception 'Escolha a categoria da nota'; end if;
  v_valor := nullif(p->>'valor','')::numeric;
  if coalesce(v_valor, 0) <= 0 then raise exception 'Informe o valor da nota'; end if;
  v_data := coalesce(nullif(p->>'data_nota','')::date, hoje());
  if v_data > hoje() then raise exception 'A data da nota não pode ser futura'; end if;
  v_estab := trim(coalesce(p->>'estabelecimento',''));
  if length(v_estab) < 2 then raise exception 'Informe o estabelecimento / fornecedor'; end if;
  v_pago := coalesce((p->>'pago')::boolean, false);
  v_venc := case when v_pago then v_data else nullif(p->>'vencimento','')::date end;
  if v_venc is null then raise exception 'Informe o vencimento (ou marque que já foi paga)'; end if;
  v_desc := left(c.nome || ' — ' || v_estab || coalesce(' — ' || nullif(trim(p->>'descricao'),''), ''), 300);

  insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento, documento_numero, caminho, origem, criado_por)
  values (nullif(p->>'obra_id','')::uuid, 'despesa', c.categoria_fin, v_desc, v_estab, v_valor, v_data, v_venc,
          nullif(trim(p->>'documento_numero'),''), nullif(p->>'caminho',''), 'nota', auth.uid())
  returning id into v_lanc;
  if v_pago then
    update lancamentos set status = 'liquidado', liquidado_em = v_data, valor_liquidado = v_valor,
           forma_pagamento = nullif(p->>'forma_pagamento',''), atualizado_em = now() where id = v_lanc;
  end if;

  insert into notas_despesa (categoria_id, obra_id, data_nota, estabelecimento, documento_numero, descricao, valor, pago, forma_pagamento,
                             vencimento, caminho, lancamento_id)
  values (c.id, nullif(p->>'obra_id','')::uuid, v_data, v_estab, nullif(trim(p->>'documento_numero'),''), nullif(trim(p->>'descricao'),''),
          v_valor, v_pago, case when v_pago then nullif(p->>'forma_pagamento','') end, v_venc, nullif(p->>'caminho',''), v_lanc)
  returning id into v_id;
  return v_id;
end $$;

-- cancela a nota e a despesa gerada (mesmo se já baixada — a nota foi lançada errada)
create or replace function nota_cancelar(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare n notas_despesa;
begin
  perform _nota_permissao();
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into n from notas_despesa where id = p_id for update;
  if not found then raise exception 'Nota não encontrada'; end if;
  if n.status = 'cancelada' then raise exception 'Nota já cancelada'; end if;
  update notas_despesa set status = 'cancelada', motivo_cancelamento = trim(p_motivo) where id = p_id;
  update lancamentos set status = 'cancelado', motivo_cancelamento = 'Nota cancelada: ' || trim(p_motivo), atualizado_em = now()
   where id = n.lancamento_id and status <> 'cancelado';
end $$;

create or replace function nota_categoria_salvar(p_nome text, p_categoria_fin text) returns int
language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  perform _nota_permissao();
  if length(trim(coalesce(p_nome,''))) < 3 then raise exception 'Nome da categoria muito curto'; end if;
  insert into categorias_nota (nome, categoria_fin) values (trim(p_nome), coalesce(nullif(p_categoria_fin,''), 'outras_despesas'))
  on conflict (nome) do update set ativo = true returning id into v_id;
  return v_id;
end $$;

create view v_notas_despesa with (security_invoker = true) as
select n.*, c.nome as categoria_nome, c.categoria_fin, o.codigo as obra_codigo, o.nome as obra_nome, p.nome as criado_por_nome,
       l.status as lancamento_status, l.numero as lancamento_numero
  from notas_despesa n join categorias_nota c on c.id = n.categoria_id left join obras o on o.id = n.obra_id
  left join perfis p on p.id = n.criado_por left join lancamentos l on l.id = n.lancamento_id;

create trigger tg_notas_nodelete before delete on notas_despesa for each row execute function _tg_bloquear_exclusao();
create trigger tg_notas_audit after insert or update on notas_despesa for each row execute function _tg_auditoria();
alter table notas_despesa enable row level security;
alter table categorias_nota enable row level security;
revoke all on notas_despesa, categorias_nota from anon;
grant select on notas_despesa, categorias_nota, v_notas_despesa to authenticated;
create policy notas_sel on notas_despesa for select to authenticated
  using (tem_papel('admin','financeiro','compras') or (obra_id is not null and membro_obra(obra_id)));
create policy catnota_sel on categorias_nota for select to authenticated using (true);

revoke execute on function _nota_permissao() from public, anon, authenticated;
revoke execute on function nota_registrar(jsonb) from public, anon;
revoke execute on function nota_cancelar(uuid, text) from public, anon;
revoke execute on function nota_categoria_salvar(text, text) from public, anon;
grant execute on function nota_registrar(jsonb), nota_cancelar(uuid, text), nota_categoria_salvar(text, text) to authenticated;
