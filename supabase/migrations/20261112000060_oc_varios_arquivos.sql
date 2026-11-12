-- OC: vários arquivos (PDF/fotos) no mesmo envio. O primeiro arquivo passa por oc_anexar_documento
-- (confere NF, avisa etc.); os demais entram como páginas/arquivos extras do mesmo documento, sem repetir avisos.
create or replace function oc_documento_arquivo_extra(p_doc uuid, p_caminho text, p_mime text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d oc_documentos; o ordens_compra; v_id uuid;
begin
  select * into d from oc_documentos where id = p_doc;
  if not found then raise exception 'Documento não encontrado'; end if;
  select * into o from ordens_compra where id = d.oc_id;
  if not (tem_papel('compras','financeiro','almoxarifado','admin') or (o.obra_id is not null and membro_obra(o.obra_id) and tem_papel('engenheiro','encarregado'))) then
    raise exception 'Sem permissão para anexar documentos a esta OC';
  end if;
  if o.status = 'cancelada' then raise exception 'OC cancelada'; end if;
  if coalesce(trim(p_caminho), '') = '' then raise exception 'Arquivo não enviado'; end if;
  insert into oc_documentos (oc_id, tipo, numero, valor, vencimento, caminho, tipo_mime, enviado_por)
  values (d.oc_id, d.tipo, d.numero, d.valor, d.vencimento, p_caminho, p_mime, auth.uid()) returning id into v_id;
  return v_id;
end $$;
grant execute on function oc_documento_arquivo_extra(uuid, text, text) to authenticated;
