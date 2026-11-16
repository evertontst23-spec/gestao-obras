-- Link de admissão: uma página sem login, protegida por um token longo e com prazo de validade,
-- onde a contabilidade vê os dados cadastrais e as fotos dos documentos que cada funcionário entregou.
-- O token é conferido no servidor do sistema (rota /p/admissao). O banco continua fechado:
-- nenhuma permissão é dada ao papel anônimo.

create table if not exists links_admissao (
  token         text primary key,
  titulo        text not null default 'Documentos para admissão',
  observacao    text,
  funcionarios  uuid[] not null,
  criado_por    uuid references perfis(id),
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  revogado_em   timestamptz,
  ultimo_acesso timestamptz,
  acessos       integer not null default 0
);
comment on table links_admissao is 'Links de admissão (sem login) com os documentos enviados à contabilidade';

alter table links_admissao enable row level security;
drop policy if exists links_adm_ver on links_admissao;
create policy links_adm_ver on links_admissao for select to authenticated using (tem_papel('admin', 'rh'));
-- escrita só pelas funções abaixo (security definer); o papel anônimo não recebe nada

create index if not exists ix_links_adm_criado on links_admissao (criado_em desc);

-- tipos de documento que podem aparecer no link: só os que interessam à admissão.
-- Atestados, ASO e certificados de treinamento ficam de fora (dado de saúde / não é documento de admissão).
create or replace function _tipos_admissao() returns text[]
language sql immutable as $$
  select array['RG (frente)', 'RG (verso)', 'RG / CPF', 'CPF', 'CTPS', 'Comprovante de residência',
               'Certidão de nascimento/casamento', 'Título de eleitor', 'Reservista', 'Comprovante de escolaridade',
               'Dados bancários', 'Ficha de registro', 'Foto', 'Outro']::text[];
$$;

create or replace function admissao_link_criar(p_funcionarios uuid[], p_dias integer default 30,
                                               p_titulo text default null, p_observacao text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not tem_papel('admin', 'rh') then raise exception 'Sem permissão para gerar o link de admissão'; end if;
  if coalesce(array_length(p_funcionarios, 1), 0) = 0 then raise exception 'Escolha pelo menos um funcionário'; end if;
  if p_dias < 1 or p_dias > 180 then raise exception 'A validade do link deve ficar entre 1 e 180 dias'; end if;
  insert into links_admissao (token, titulo, observacao, funcionarios, criado_por, expira_em)
  values (v_token, coalesce(nullif(btrim(p_titulo), ''), 'Documentos para admissão'), nullif(btrim(p_observacao), ''),
          p_funcionarios, auth.uid(), now() + make_interval(days => p_dias));
  return v_token;
end $$;

create or replace function admissao_link_revogar(p_token text, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin', 'rh') then raise exception 'Sem permissão para revogar o link'; end if;
  update links_admissao set revogado_em = now(),
         observacao = coalesce(observacao || ' · ', '') || coalesce('Revogado: ' || nullif(btrim(p_motivo), ''), 'Revogado')
   where token = p_token and revogado_em is null;
end $$;

grant execute on function admissao_link_criar(uuid[], integer, text, text) to authenticated;
grant execute on function admissao_link_revogar(text, text) to authenticated;
