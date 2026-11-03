-- =====================================================================
-- 0040 — Obra arquivada some de todo o sistema; nomes de funcionários em MAIÚSCULAS
--  * obras.arquivada: a obra deixa de aparecer em todas as telas e listas (o registro continua no banco).
--  * Nome do funcionário sempre em maiúsculas (os atuais são convertidos; os novos já entram assim).
-- =====================================================================
alter table obras add column arquivada boolean not null default false;
create policy obras_sem_arquivadas on obras as restrictive for select to authenticated using (not arquivada);

update obras set arquivada = true where codigo = 'CAMPO-CAFE' and situacao = 'concluida';

create or replace function _tg_func_nome_maiusculo() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := upper(regexp_replace(trim(new.nome), '\s+', ' ', 'g'));
  return new;
end $$;
create trigger tg_func_nome_maiusculo before insert or update of nome on funcionarios
  for each row execute function _tg_func_nome_maiusculo();
update funcionarios set nome = nome where nome is distinct from upper(regexp_replace(trim(nome), '\s+', ' ', 'g'));
revoke execute on function _tg_func_nome_maiusculo() from public, anon, authenticated;
