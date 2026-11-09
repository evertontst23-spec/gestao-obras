-- 0048: código do insumo automático (Material → M0044, M0045…; EPI → EPI13, EPI14…) quando vier em branco
create or replace function _tg_insumo_codigo() returns trigger language plpgsql set search_path = public as $$
declare n int;
begin
  if coalesce(trim(new.codigo), '') <> '' then new.codigo := upper(trim(new.codigo)); return new; end if;
  perform pg_advisory_xact_lock(hashtext('insumo_codigo'));
  if new.categoria = 'EPI' then
    select coalesce(max(substring(codigo from '^EPI\s*(\d+)$')::int), 0) + 1 into n from insumos where codigo ~ '^EPI\s*\d+$';
    new.codigo := 'EPI' || lpad(n::text, 2, '0');
  else
    select coalesce(max(substring(codigo from '^M(\d+)$')::int), 0) + 1 into n from insumos where codigo ~ '^M\d+$';
    new.codigo := 'M' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists tg_insumo_codigo on insumos;
create trigger tg_insumo_codigo before insert on insumos for each row execute function _tg_insumo_codigo();
