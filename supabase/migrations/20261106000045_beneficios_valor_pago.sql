-- =====================================================================
-- 0045 — Benefícios: quanto já foi pago em cada linha
--  Se a linha muda depois de paga (ex.: retroativo lançado depois), só a diferença fica pendente
--  e vai para a próxima planilha do C6.
-- =====================================================================
alter table beneficio_linhas add column valor_pago numeric(12,2) not null default 0;
update beneficio_linhas set valor_pago = valor_total where pago_em is not null;

create or replace function beneficio_marcar_pago(p_linhas bigint[], p_pago boolean, p_para text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not tem_papel('admin','rh','financeiro') then raise exception 'Apenas diretoria, RH ou financeiro registram o pagamento'; end if;
  if coalesce(array_length(p_linhas, 1), 0) = 0 then raise exception 'Nenhuma linha selecionada'; end if;
  if p_pago and p_para not in ('empresa','funcionario') then raise exception 'Informe se o Pix foi para a empresa ou para o funcionário'; end if;
  if p_pago then
    update beneficio_linhas set pago_em = now(), pago_por = auth.uid(), pago_para = p_para, valor_pago = valor_total
     where id = any(p_linhas) and valor_total > valor_pago;
  else
    update beneficio_linhas set pago_em = null, pago_por = null, pago_para = null, valor_pago = 0
     where id = any(p_linhas) and valor_pago > 0;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
