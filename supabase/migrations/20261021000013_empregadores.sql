-- =====================================================================
-- 13. EMPRESAS CONTRATANTES (empregador de cada funcionário)
-- A equipe da obra pode vir de empresas diferentes: equipe própria (CAD),
-- fornecedoras de mão de obra (IDERES, FÊNIX — com taxa administrativa)
-- e CLTs de empresas parceiras (Mundial, A2 — fechamento feito por elas).
-- =====================================================================

create table empregadores (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null unique check (length(trim(nome)) >= 2),
  razao_social       text,
  cnpj               text unique,
  tipo               text not null default 'propria' check (tipo in ('propria','fornecedora_mao_obra','parceira')),
  vinculo_padrao     text not null default 'clt' check (vinculo_padrao in ('clt','terceirizado','clt_parceira','autonomo')),
  taxa_tipo          text not null default 'nenhuma' check (taxa_tipo in ('nenhuma','percentual_folha','fixo_funcionario_mes')),
  taxa_valor         numeric(10,2) not null default 0 check (taxa_valor >= 0),
  adiantamento_pct   numeric(5,2) not null default 40 check (adiantamento_pct between 0 and 100),
  dia_adiantamento   int not null default 20 check (dia_adiantamento between 1 and 31),
  dia_saldo          int not null default 5 check (dia_saldo between 1 and 31),
  fechamento_externo boolean not null default false,   -- a própria empresa calcula a folha (ex.: Mundial)
  contato            text,
  telefone           text,
  observacoes        text,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

alter table funcionarios
  add column empregador_id    uuid references empregadores(id),
  add column vinculo          text check (vinculo in ('clt','terceirizado','clt_parceira','autonomo')),
  add column adicional_pct    numeric(5,2) not null default 0 check (adicional_pct between 0 and 300),  -- ex.: +40% sobre o salário
  add column alimentacao_dia  numeric(10,2),         -- nulo = valor da função
  add column passagens_dia    numeric(4,1),          -- nº de passagens por dia útil
  add column valor_passagem   numeric(8,2),          -- nulo = valor padrão do DP
  add column passagem_semanal numeric(10,2),         -- auxílio fixo por semana (combustível/passagem)
  add column pendencias       text;                  -- dados que ainda faltam confirmar no cadastro
create index on funcionarios (empregador_id);

alter table dp_parametros add column valor_passagem numeric(8,2) not null default 4.50;

-- permissões por coluna (a tabela funcionarios usa grants por coluna para esconder a biometria)
grant select (empregador_id, vinculo, adicional_pct, alimentacao_dia, passagens_dia, valor_passagem, passagem_semanal, pendencias)
  on funcionarios to authenticated;
grant update (empregador_id, vinculo, adicional_pct, alimentacao_dia, passagens_dia, valor_passagem, passagem_semanal, pendencias)
  on funcionarios to authenticated;

-- vínculo padrão vem da empresa
create or replace function _tg_func_vinculo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.empregador_id is not null and new.vinculo is null then
    select vinculo_padrao into new.vinculo from empregadores where id = new.empregador_id;
  end if;
  return new;
end $$;
create trigger tg_func_vinculo before insert or update of empregador_id on funcionarios for each row execute function _tg_func_vinculo();

drop view v_funcionarios;
create view v_funcionarios with (security_invoker = true) as
select f.id, f.matricula, f.nome, f.cpf, f.rg, f.data_nascimento, f.telefone, f.endereco, f.funcao_id, f.obra_id, f.salario,
       f.data_admissao, f.ativo, f.data_demissao, f.motivo_demissao, f.banco, f.agencia, f.conta, f.pix, f.usuario_id,
       funcionario_tem_biometria(f.id) as biometria_cadastrada, f.biometria_consentida_em, f.observacoes, f.criado_em,
       f.empregador_id, f.vinculo, f.adicional_pct, f.alimentacao_dia, f.passagens_dia, f.valor_passagem, f.passagem_semanal, f.pendencias,
       e.nome as empregador_nome, e.tipo as empregador_tipo, e.fechamento_externo,
       fn.nome as funcao_nome,
       case when e.fechamento_externo and f.salario is null then null      -- salário definido pela empresa parceira
            else round(coalesce(f.salario, fn.salario_base) * (1 + f.adicional_pct / 100), 2) end as salario_efetivo,
       fn.carga_diaria_horas, coalesce(f.alimentacao_dia, fn.vale_alimentacao_dia) as vale_alimentacao_dia,
       fn.vale_transporte_dia, fn.epis_obrigatorios, fn.riscos,
       o.codigo as obra_codigo, o.nome as obra_nome,
       (select count(*) from funcionario_documentos d where d.funcionario_id = f.id and not d.substituido
          and d.validade is not null and d.validade < hoje()) as documentos_vencidos,
       (select count(*) from funcionario_documentos d where d.funcionario_id = f.id and not d.substituido
          and d.validade between hoje() and hoje() + 30) as documentos_a_vencer
  from funcionarios f
  left join funcoes fn on fn.id = f.funcao_id
  left join obras o on o.id = f.obra_id
  left join empregadores e on e.id = f.empregador_id;

-- ---------------------------------------------------------------------
-- Folha: salário com adicional, alimentação/passagem do próprio funcionário, empresa
-- ---------------------------------------------------------------------
drop function folha_previa(date, uuid);
create or replace function folha_previa(p_mes date, p_obra uuid default null)
returns table (funcionario_id uuid, matricula text, nome text, funcao text, obra_id uuid, obra_codigo text,
               empregador text, vinculo text, fechamento_externo boolean,
               salario_base numeric, insalubridade numeric, periculosidade numeric, valor_hora numeric,
               he_util_h numeric, he_util_valor numeric, he_100_h numeric, he_100_valor numeric, dsr_he numeric,
               faltas int, desconto_faltas numeric, atraso_h numeric, desconto_atrasos numeric,
               dias_trabalhados int, vale_alimentacao numeric, vale_transporte numeric, desconto_vt numeric,
               bruto numeric, inss numeric, liquido_estimado numeric, incompletos int)
language plpgsql stable security definer set search_path = public as $$
declare par dp_parametros; r record; rp record; v_ini date := date_trunc('month', p_mes)::date; v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
        v_vt_dia numeric;
begin
  if not tem_papel('admin','rh','financeiro') and not (tem_papel('engenheiro') and p_obra is not null and gere_obra(p_obra)) then
    raise exception 'Sem permissão para ver a folha';
  end if;
  select * into par from dp_parametros where id = 1;
  for r in select f.*, fn.nome as fnome,
                  round(coalesce(f.salario, fn.salario_base, 0) * (1 + f.adicional_pct / 100), 2) as sal,
                  fn.adicional_insalubridade_pct as ins_pct, fn.adicional_periculosidade as peric,
                  coalesce(f.alimentacao_dia, fn.vale_alimentacao_dia) as va, fn.vale_transporte_dia as vt_funcao,
                  o.codigo as ocod, e.nome as enome, e.fechamento_externo as fext
             from funcionarios f left join funcoes fn on fn.id = f.funcao_id left join obras o on o.id = f.obra_id
             left join empregadores e on e.id = f.empregador_id
            where f.data_admissao <= v_fim and (f.data_demissao is null or f.data_demissao >= v_ini)
              and (p_obra is null or f.obra_id = p_obra)
            order by e.nome nulls first, f.nome loop
    select * into rp from resumo_ponto(r.id, p_mes);
    funcionario_id := r.id; matricula := r.matricula; nome := r.nome; funcao := r.fnome; obra_id := r.obra_id; obra_codigo := r.ocod;
    empregador := r.enome; vinculo := r.vinculo; fechamento_externo := coalesce(r.fext, false);
    salario_base := r.sal;
    insalubridade := round(par.salario_minimo * coalesce(r.ins_pct,0) / 100, 2);
    periculosidade := case when r.peric then round(r.sal * 0.30, 2) else 0 end;
    valor_hora := round((r.sal + insalubridade + periculosidade) / par.divisor_horas_mes, 4);
    he_util_h := round(rp.he_util_min / 60.0, 2); he_100_h := round(rp.he_100_min / 60.0, 2);
    he_util_valor := round(he_util_h * valor_hora * (1 + par.percentual_he_util / 100), 2);
    he_100_valor := round(he_100_h * valor_hora * (1 + par.percentual_he_domingo / 100), 2);
    dsr_he := case when rp.dias_uteis > 0 then round((he_util_valor + he_100_valor) / rp.dias_uteis * rp.domingos_feriados, 2) else 0 end;
    faltas := rp.faltas; desconto_faltas := round(r.sal / 30 * rp.faltas, 2);
    atraso_h := round(rp.atraso_min / 60.0, 2); desconto_atrasos := round(atraso_h * valor_hora, 2);
    dias_trabalhados := rp.dias_trabalhados;
    vale_alimentacao := round(coalesce(r.va,0) * rp.dias_trabalhados, 2);
    v_vt_dia := coalesce(r.passagens_dia * coalesce(r.valor_passagem, par.valor_passagem), r.passagem_semanal / 5, r.vt_funcao, 0);
    vale_transporte := round(v_vt_dia * rp.dias_trabalhados, 2);
    desconto_vt := case when coalesce(r.vinculo, 'clt') = 'clt' then least(vale_transporte, round(r.sal * par.desconto_vt_pct / 100, 2)) else 0 end;
    bruto := r.sal + insalubridade + periculosidade + he_util_valor + he_100_valor + dsr_he - desconto_faltas - desconto_atrasos;
    inss := _inss(bruto);
    liquido_estimado := bruto - inss - desconto_vt;
    incompletos := rp.incompletos;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS, auditoria, permissões
-- ---------------------------------------------------------------------
alter table empregadores enable row level security;
revoke all on empregadores from anon;
create policy emp_sel on empregadores for select to authenticated using (meu_papel() is not null);
create policy emp_ins on empregadores for insert to authenticated with check (tem_papel('admin','rh','financeiro'));
create policy emp_upd on empregadores for update to authenticated using (tem_papel('admin','rh','financeiro')) with check (tem_papel('admin','rh','financeiro'));
create trigger tg_empregadores_upd before update on empregadores for each row execute function _tg_atualizado_em();
create trigger tg_empregadores_audit after insert or update or delete on empregadores for each row execute function _tg_auditoria();
create trigger tg_empregadores_nodelete before delete on empregadores for each row execute function _tg_bloquear_exclusao();

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' loop
    if f.proname like '\_%' then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    else
      execute format('revoke execute on function %s from public, anon', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig);
      begin execute format('grant execute on function %s to service_role', f.sig); exception when undefined_object then null; end;
    end if;
  end loop;
end $$;
grant execute on function espelho_publico(text, date) to anon;
grant execute on function ponto_contestar(text, date, text) to anon;
