-- =====================================================================
-- 0053 — Aparência: cada usuário escolhe o tema do sistema (claro, escuro ou petróleo)
-- =====================================================================
alter table perfis add column tema text not null default 'claro' check (tema in ('claro','escuro','petroleo'));

create or replace function perfil_tema(p_tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  if p_tema not in ('claro','escuro','petroleo') then raise exception 'Tema inválido'; end if;
  update perfis set tema = p_tema where id = auth.uid();
end $$;
revoke execute on function perfil_tema(text) from public, anon;
grant execute on function perfil_tema(text) to authenticated;
