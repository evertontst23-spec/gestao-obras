-- =====================================================================
-- 0025 — Banco de espera (cadastro reserva de candidatos)
--  Pessoas que ficam aguardando vaga: nome completo, celular, função pretendida e informações úteis.
--  Situações: aguardando → chamado → contratado (vira funcionário) | desistiu | não apto.
-- =====================================================================
create table espera_candidatos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(trim(nome)) >= 5),
  celular           text not null,
  cpf               text,
  funcao_pretendida text,
  bairro_cidade     text,
  experiencia       text,
  indicado_por      text,
  disponivel_em     date,
  status            text not null default 'aguardando'
                    check (status in ('aguardando','chamado','contratado','desistiu','nao_apto')),
  observacoes       text,
  contato_em        timestamptz,
  funcionario_id    uuid references funcionarios(id),
  criado_por        uuid references perfis(id) default auth.uid(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
-- o mesmo celular não entra duas vezes
create unique index espera_celular_unico on espera_candidatos ((regexp_replace(celular, '\D', '', 'g')));
create index on espera_candidatos (status, funcao_pretendida);

create or replace function _tg_espera_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
  if length(regexp_replace(new.celular, '\D', '', 'g')) not between 10 and 13 then
    raise exception 'Celular inválido: informe DDD e número';
  end if;
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'chamado' then new.contato_em := now(); end if;
  return new;
end $$;
create trigger espera_antes before insert or update on espera_candidatos for each row execute function _tg_espera_antes();

alter table espera_candidatos enable row level security;
create policy espera_sel on espera_candidatos for select to authenticated using (tem_papel('admin','rh','engenheiro','seguranca'));
create policy espera_ins on espera_candidatos for insert to authenticated with check (tem_papel('admin','rh','engenheiro'));
create policy espera_upd on espera_candidatos for update to authenticated using (tem_papel('admin','rh','engenheiro')) with check (tem_papel('admin','rh','engenheiro'));
grant select, insert, update on espera_candidatos to authenticated;

-- Contratar: cria o funcionário com os dados do banco de espera
create or replace function espera_contratar(p_id uuid, p_funcao uuid, p_obra uuid, p_empregador uuid, p_admissao date)
returns uuid language plpgsql security definer set search_path = public as $$
declare c espera_candidatos; v_func uuid;
begin
  if not tem_papel('admin','rh') then raise exception 'Apenas RH ou diretoria contratam'; end if;
  select * into c from espera_candidatos where id = p_id for update;
  if not found then raise exception 'Candidato não encontrado'; end if;
  if c.status = 'contratado' then raise exception 'Este candidato já foi contratado'; end if;
  if c.cpf is not null and exists (select 1 from funcionarios where regexp_replace(cpf, '\D', '', 'g') = regexp_replace(c.cpf, '\D', '', 'g') and ativo) then
    raise exception 'Já existe um funcionário ativo com o CPF %', c.cpf;
  end if;
  insert into funcionarios (nome, telefone, cpf, funcao_id, obra_id, empregador_id, vinculo, data_admissao, observacoes, criado_por)
  values (c.nome, c.celular, c.cpf, p_funcao, p_obra, p_empregador, 'clt', coalesce(p_admissao, hoje()),
          concat_ws(E'\n', 'Contratado do banco de espera' || coalesce(' (pretendia: ' || c.funcao_pretendida || ')', ''), nullif(c.observacoes, '')),
          auth.uid())
  returning id into v_func;
  update espera_candidatos set status = 'contratado', funcionario_id = v_func where id = p_id;
  return v_func;
end $$;
revoke execute on function espera_contratar(uuid, uuid, uuid, uuid, date) from public, anon;
grant execute on function espera_contratar(uuid, uuid, uuid, uuid, date) to authenticated;
