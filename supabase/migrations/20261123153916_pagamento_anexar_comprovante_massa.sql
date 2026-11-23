-- Anexa um comprovante (o lote do C6) a TODAS as contas a pagar geradas por um pagamento.
CREATE OR REPLACE FUNCTION pagamento_anexar_comprovante(p_pagamento uuid, p_caminho text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare afetadas int;
begin
  if not tem_papel('admin','rh','financeiro') then raise exception 'Apenas RH, financeiro ou diretoria anexam comprovante'; end if;
  if p_caminho is null then raise exception 'Envie o comprovante'; end if;
  update lancamentos
     set comprovante_caminho = p_caminho, comprovante_em = now()
   where pagamento_id = p_pagamento and status <> 'cancelado';
  get diagnostics afetadas = row_count;
  if afetadas = 0 then
    raise exception 'Este pagamento ainda não tem contas no financeiro — feche o pagamento antes de anexar o comprovante.';
  end if;
  return afetadas;
end $$;

GRANT EXECUTE ON FUNCTION pagamento_anexar_comprovante(uuid, text) TO authenticated;
