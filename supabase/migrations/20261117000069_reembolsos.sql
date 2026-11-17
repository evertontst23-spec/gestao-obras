-- Reembolsos: alguém (colaborador, sócio) pagou do próprio bolso e a empresa devolve.
-- É um lançamento de despesa (conta a pagar) com favorecido = quem recebe de volta e comprovante anexo.
-- Marcamos pela origem 'reembolso' para a aba de Reembolsos filtrar; continua aparecendo no
-- fluxo de caixa e em Contas a pagar normalmente.

alter table lancamentos drop constraint if exists lancamentos_origem_check;
alter table lancamentos add constraint lancamentos_origem_check
  check (origem = any (array['manual','oc','folha','bm','nota','reembolso']));

create or replace function reembolso_criar(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cat text := coalesce(nullif(p->>'categoria',''), 'administrativo');
begin
  if not tem_papel('admin','financeiro') then raise exception 'Apenas diretoria ou financeiro registram reembolsos'; end if;
  if nullif(trim(p->>'favorecido'),'') is null then raise exception 'Informe quem vai receber o reembolso'; end if;
  if length(trim(coalesce(p->>'descricao',''))) < 3 then raise exception 'Descreva o que foi o gasto'; end if;
  if coalesce(nullif(p->>'valor','')::numeric, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if nullif(p->>'vencimento','') is null then raise exception 'Informe quando pretende reembolsar (vencimento)'; end if;
  if v_cat not in ('material','equipamentos','servicos_terceiros','administrativo','outras_despesas','mao_de_obra','impostos') then
    v_cat := 'administrativo';
  end if;

  insert into lancamentos (obra_id, tipo, categoria, descricao, favorecido, valor, competencia, vencimento,
    caminho, origem, criado_por)
  values (nullif(p->>'obra_id','')::uuid, 'despesa', v_cat, trim(p->>'descricao'), nullif(trim(p->>'favorecido'),''),
    (p->>'valor')::numeric, coalesce(nullif(p->>'competencia','')::date, hoje()), (p->>'vencimento')::date,
    nullif(p->>'caminho',''), 'reembolso', auth.uid())
  returning id into v_id;

  if (p->>'liquidado')::boolean then
    perform lancamento_liquidar(v_id, coalesce(nullif(p->>'liquidado_em','')::date, hoje()), null, nullif(p->>'forma_pagamento',''), null);
  end if;
  return v_id;
end $$;

grant execute on function reembolso_criar(jsonb) to authenticated;
