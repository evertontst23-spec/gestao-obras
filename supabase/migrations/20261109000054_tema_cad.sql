-- =====================================================================
-- 0054 — Aparência: novo modelo "CAD" (preto, menu novo e tela de Pagamentos nova) como mais uma opção
-- =====================================================================
alter table perfis drop constraint if exists perfis_tema_check;
alter table perfis add constraint perfis_tema_check check (tema in ('claro','escuro','petroleo','cad'));

create or replace function perfil_tema(p_tema text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  if p_tema not in ('claro','escuro','petroleo','cad') then raise exception 'Tema inválido'; end if;
  update perfis set tema = p_tema where id = auth.uid();
end $$;
