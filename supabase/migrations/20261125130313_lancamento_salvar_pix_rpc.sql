-- A tabela lancamentos só tem políticas de SELECT; toda gravação passa por SECURITY DEFINER.
-- O update direto de pix era barrado pelo RLS sem erro (0 linhas). Salva a chave via RPC.
create or replace function lancamento_salvar_pix(p_id uuid, p_pix text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro alteram contas'; end if;
  update lancamentos set pix = nullif(trim(p_pix), ''), atualizado_em = now() where id = p_id;
  if not found then raise exception 'Lançamento não encontrado'; end if;
end $$;

grant execute on function lancamento_salvar_pix(uuid, text) to authenticated;
