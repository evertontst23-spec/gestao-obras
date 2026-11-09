-- 0046: compras (coordenador de compras) também cria pedido de material
do $$
declare d text := pg_get_functiondef('criar_solicitacao'::regproc);
begin
  if position('''encarregado'',''engenheiro'',''admin'',''almoxarifado''' in d) = 0 then raise exception 'trecho não encontrado'; end if;
  d := replace(d, '''encarregado'',''engenheiro'',''admin'',''almoxarifado''', '''encarregado'',''engenheiro'',''admin'',''almoxarifado'',''compras''');
  execute d;
end $$;
