-- =====================================================================
-- 0044 — Pagamento dos benefícios
--  * Empresas que repassam aos funcionários (IDERES, FÊNIX, Mundial, A2): o Pix vai para a empresa.
--    empregadores.beneficios_via_empresa + chave Pix/banco da empresa.
--  * Marcar o Pix como enviado (por empresa ou por funcionário), com quem e quando; dá para desfazer.
-- =====================================================================
alter table empregadores add column pix text, add column banco text,
  add column beneficios_via_empresa boolean not null default false;
update empregadores set beneficios_via_empresa = true where tipo in ('parceira','fornecedora_mao_obra');

alter table beneficio_linhas add column pago_em timestamptz, add column pago_por uuid references perfis(id), add column pago_para text
  check (pago_para in ('empresa','funcionario'));

create or replace function beneficio_marcar_pago(p_linhas bigint[], p_pago boolean, p_para text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not tem_papel('admin','rh','financeiro') then raise exception 'Apenas diretoria, RH ou financeiro registram o pagamento'; end if;
  if coalesce(array_length(p_linhas, 1), 0) = 0 then raise exception 'Nenhuma linha selecionada'; end if;
  if p_pago and p_para not in ('empresa','funcionario') then raise exception 'Informe se o Pix foi para a empresa ou para o funcionário'; end if;
  update beneficio_linhas set pago_em = case when p_pago then now() end, pago_por = case when p_pago then auth.uid() end,
         pago_para = case when p_pago then p_para end
   where id = any(p_linhas) and (p_pago = (pago_em is null));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function beneficio_marcar_pago(bigint[], boolean, text) from public, anon;
grant execute on function beneficio_marcar_pago(bigint[], boolean, text) to authenticated;
