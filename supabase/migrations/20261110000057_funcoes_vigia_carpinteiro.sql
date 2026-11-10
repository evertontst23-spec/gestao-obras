-- Funções Vigia diurno / Vigia noturno (12h) e Carpinteiro.
-- O vigia noturno recebe +20% de adicional noturno: a função guarda o percentual e,
-- ao colocar alguém nessa função (sem adicional já informado), o adicional do funcionário é preenchido.

alter table funcoes add column if not exists adicional_noturno_pct numeric(5,2) not null default 0
  check (adicional_noturno_pct between 0 and 100);

create or replace function _tg_func_adicional_funcao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if new.funcao_id is not null
     and (tg_op = 'INSERT' or new.funcao_id is distinct from old.funcao_id)
     and coalesce(new.adicional_pct, 0) = 0 then
    select adicional_noturno_pct into v from funcoes where id = new.funcao_id;
    if coalesce(v, 0) > 0 then new.adicional_pct := v; end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_func_adicional_funcao on funcionarios;
create trigger tg_func_adicional_funcao before insert or update of funcao_id on funcionarios
  for each row execute function _tg_func_adicional_funcao();

-- Vigias: mesmo salário base do vigia hoje em uso (R$ 1.810), jornada 12h (12x36), sem vale-alimentação.
insert into funcoes (nome, cbo, salario_base, carga_diaria_horas, vale_alimentacao_dia, vale_transporte_dia,
                     adicional_insalubridade_pct, adicional_periculosidade, epis_obrigatorios, riscos, adicional_noturno_pct)
select v.nome, '5174-20', 1810, 12, 0, 0, 0, false, '{}'::text[], '{}'::text[], v.ad
  from (values ('Vigia diurno', 0::numeric), ('Vigia noturno', 20::numeric)) v(nome, ad)
 where not exists (select 1 from funcoes f where lower(f.nome) = lower(v.nome));

-- Carpinteiro: mesmos parâmetros do Pedreiro CLT (ajustar o salário se for diferente).
insert into funcoes (nome, cbo, salario_base, carga_diaria_horas, vale_alimentacao_dia, vale_transporte_dia,
                     adicional_insalubridade_pct, adicional_periculosidade, epis_obrigatorios, riscos)
select 'Carpinteiro', '7155-05', coalesce(p.salario_base, 0), coalesce(p.carga_diaria_horas, 8),
       coalesce(p.vale_alimentacao_dia, 0), coalesce(p.vale_transporte_dia, 0), 0, false,
       coalesce(p.epis_obrigatorios, '{}'), coalesce(p.riscos, '{}')
  from (select 1) x
  left join lateral (select * from funcoes where nome ilike 'pedreiro%' order by (nome = 'Pedreiro CLT') desc limit 1) p on true
 where not exists (select 1 from funcoes f where lower(f.nome) = 'carpinteiro');
