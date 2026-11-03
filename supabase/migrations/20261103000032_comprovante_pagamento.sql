-- =====================================================================
-- 0032 — Contas a pagar/receber: anexar o comprovante depois da baixa
--  O boleto/documento continua em "caminho"; o comprovante de pagamento fica em campo próprio
--  e pode ser anexado ou trocado a qualquer momento depois que a conta foi paga.
-- =====================================================================
alter table lancamentos add column comprovante_caminho text, add column comprovante_em timestamptz, add column comprovante_por uuid references perfis(id);

create or replace function lancamento_anexar_comprovante(p_id uuid, p_caminho text) returns void
language plpgsql security definer set search_path = public as $$
declare l lancamentos;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro anexam comprovantes'; end if;
  if coalesce(trim(p_caminho), '') = '' then raise exception 'Escolha o arquivo do comprovante'; end if;
  select * into l from lancamentos where id = p_id for update;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  if l.status <> 'liquidado' then raise exception 'Dê a baixa antes de anexar o comprovante (ou anexe junto com a baixa)'; end if;
  update lancamentos set comprovante_caminho = p_caminho, comprovante_em = now(), comprovante_por = auth.uid(), atualizado_em = now() where id = p_id;
  if l.oc_id is not null then
    perform _oc_evento(l.oc_id, 'comprovante', 'Comprovante de pagamento anexado no financeiro');
  end if;
end $$;
revoke execute on function lancamento_anexar_comprovante(uuid, text) from public, anon;
grant execute on function lancamento_anexar_comprovante(uuid, text) to authenticated;
