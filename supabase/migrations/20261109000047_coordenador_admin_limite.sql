-- 0047: coordenador de compras com acesso geral (papel admin) continua limitado na aprovação de compras
create or replace function public.pode_aprovar_compra(p_valor numeric) returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select case
    when exists (select 1 from perfis where id = auth.uid() and ativo and coordenador_compras)
      then coalesce(p_valor, 0) <= (select limite_coordenador from compras_parametros where id = 1)
    else tem_papel('admin') end
$function$;

do $$
declare d text := pg_get_functiondef('cotacao_decidir'::regproc);
begin
  d := replace(d, 'v_quem := case when tem_papel(''admin'') then ''diretoria'' else ''coordenador de compras'' end;',
    'v_quem := case when exists (select 1 from perfis where id = auth.uid() and coordenador_compras) then ''coordenador de compras'' else ''diretoria'' end;');
  execute d;
end $$;
