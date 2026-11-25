-- Contas a pagar: chave Pix por lançamento + baixa em lote (marcar → planilha C6 → anexar comprovante → baixa)
alter table lancamentos add column if not exists pix text;

-- Baixa várias contas de uma vez e anexa o mesmo comprovante do lote (Pix em massa no C6) em todas.
create or replace function lancamento_liquidar_lote(p_ids uuid[], p_data date, p_forma text, p_caminho text)
returns integer language plpgsql security definer set search_path = public as $$
declare r lancamentos; n int := 0;
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro registram pagamentos'; end if;
  if p_data is null or p_data > hoje() then raise exception 'Data de pagamento inválida (não pode ser futura)'; end if;
  if p_ids is null or array_length(p_ids,1) is null then raise exception 'Selecione ao menos uma conta'; end if;
  for r in select * from lancamentos where id = any(p_ids) and status = 'aberto' for update loop
    update lancamentos
       set status = 'liquidado', liquidado_em = p_data, valor_liquidado = r.valor,
           forma_pagamento = coalesce(p_forma, forma_pagamento),
           comprovante_caminho = coalesce(p_caminho, comprovante_caminho),
           comprovante_em = case when p_caminho is not null then now() else comprovante_em end,
           atualizado_em = now()
     where id = r.id;
    if r.oc_id is not null then
      perform _oc_evento(r.oc_id, 'pagamento', format('Pagamento de %s registrado no financeiro em %s (baixa em lote)', _brl(r.valor), to_char(p_data, 'DD/MM/YYYY')));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function lancamento_liquidar_lote(uuid[], date, text, text) to authenticated;
