-- Anexo de boleto nos lançamentos em aberto (Gemerson lança os boletos para visualização).
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS boleto_caminho text,
  ADD COLUMN IF NOT EXISTS boleto_em timestamptz;

CREATE OR REPLACE FUNCTION lancamento_anexar_boleto(p_id uuid, p_caminho text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE lancamentos
     SET boleto_caminho = p_caminho,
         boleto_em      = now()
   WHERE id = p_id
     AND status = 'aberto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado ou já liquidado/cancelado.';
  END IF;
END;
$$;
