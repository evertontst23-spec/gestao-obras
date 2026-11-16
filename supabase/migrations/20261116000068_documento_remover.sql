-- Remoção de documento enviado por engano, no dossiê.
-- A exclusão física continua bloqueada (regra "não apagar"): isto é uma remoção LÓGICA —
-- o documento some do dossiê, da lista de pendências e do link de admissão, mas fica guardado
-- com quem removeu, quando e o motivo, e pode ser restaurado. O arquivo em si é preservado.

alter table funcionario_documentos add column if not exists removido boolean not null default false;
alter table funcionario_documentos add column if not exists removido_em timestamptz;
alter table funcionario_documentos add column if not exists removido_por uuid references perfis(id);
alter table funcionario_documentos add column if not exists motivo_remocao text;

create index if not exists ix_fdoc_removido on funcionario_documentos (funcionario_id) where not removido;

create or replace function documento_remover(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin', 'rh', 'seguranca') then
    raise exception 'Sem permissão para remover documentos';
  end if;
  update funcionario_documentos
     set removido = true, removido_em = now(), removido_por = auth.uid(),
         motivo_remocao = nullif(btrim(p_motivo), '')
   where id = p_id and not removido;
  if not found then raise exception 'Documento não encontrado'; end if;
end $$;

create or replace function documento_restaurar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tem_papel('admin', 'rh', 'seguranca') then
    raise exception 'Sem permissão para restaurar documentos';
  end if;
  update funcionario_documentos
     set removido = false, removido_em = null, removido_por = null, motivo_remocao = null
   where id = p_id and removido;
  if not found then raise exception 'Documento não encontrado'; end if;
end $$;

grant execute on function documento_remover(uuid, text) to authenticated;
grant execute on function documento_restaurar(uuid) to authenticated;
