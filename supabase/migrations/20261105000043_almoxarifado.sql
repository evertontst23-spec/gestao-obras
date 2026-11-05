-- =====================================================================
-- 0043 — Almoxarifado
--  * Retirada de material: saída do estoque com quem retirou (funcionário) e para onde vai (frente/serviço).
--  * Devolução de sobra: volta ao estoque com quem devolveu.
--  * Ferramentas emprestadas (cautela): empresta ao funcionário, controla a devolução e o estado
--    (devolvida, danificada ou perdida). Sai do estoque ao emprestar e volta na devolução em bom estado.
--  * Inventário: contagem física por local; as diferenças viram ajustes com motivo.
-- =====================================================================
alter table estoque_movimentos add column funcionario_id uuid references funcionarios(id), add column destino text;

-- o movimento é imutável: quem retirou/devolveu e o destino entram no insert, via configuração da transação
create or replace function _tg_mov_quem() returns trigger language plpgsql set search_path = public as $$
begin
  new.funcionario_id := coalesce(new.funcionario_id, nullif(current_setting('app.mov_func', true), '')::uuid);
  new.destino := coalesce(new.destino, nullif(current_setting('app.mov_destino', true), ''));
  return new;
end $$;
create trigger tg_mov_quem before insert on estoque_movimentos for each row execute function _tg_mov_quem();

create or replace function _mov_quem(p_func uuid, p_destino text default null) returns void language sql set search_path = public as $$
  select set_config('app.mov_func', coalesce(p_func::text, ''), true), set_config('app.mov_destino', coalesce(p_destino, ''), true);
$$;

create or replace function _almox() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_papel('almoxarifado','admin') then raise exception 'Apenas o almoxarifado ou a diretoria movimentam o almoxarifado'; end if;
end $$;

-- Retirada de material pelo funcionário (consumo na frente de serviço)
create or replace function almox_retirada(p_obra uuid, p_insumo uuid, p_quantidade numeric, p_funcionario uuid, p_destino text default null,
  p_observacao text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_nome text;
begin
  perform _almox();
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade retirada'; end if;
  if p_funcionario is null then raise exception 'Informe quem retirou o material'; end if;
  select nome into v_nome from funcionarios where id = p_funcionario;
  perform _mov_quem(p_funcionario, nullif(trim(p_destino), ''));
  perform _movimentar(p_obra, p_insumo, 'saida', p_quantidade, 'retirada', null,
    concat_ws(' — ', 'Retirado por ' || v_nome, nullif(trim(p_destino), ''), nullif(trim(p_observacao), '')));
  v_id := currval('estoque_movimentos_id_seq');
  perform _mov_quem(null);
  return v_id;
end $$;

-- Devolução de sobra ao estoque
create or replace function almox_devolucao(p_obra uuid, p_insumo uuid, p_quantidade numeric, p_funcionario uuid default null,
  p_observacao text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform _almox();
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade devolvida'; end if;
  perform _mov_quem(p_funcionario);
  perform _movimentar(p_obra, p_insumo, 'entrada', p_quantidade, 'devolucao', null,
    concat_ws(' — ', 'Sobra devolvida' || coalesce(' por ' || (select nome from funcionarios where id = p_funcionario), ''), nullif(trim(p_observacao), '')));
  v_id := currval('estoque_movimentos_id_seq');
  perform _mov_quem(null);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Ferramentas emprestadas (cautela)
-- ---------------------------------------------------------------------
create table cautelas (
  id                    bigserial primary key,
  obra_id               uuid references obras(id),
  funcionario_id        uuid not null references funcionarios(id),
  insumo_id             uuid not null references insumos(id),
  quantidade            numeric(14,3) not null check (quantidade > 0),
  retirada_em           timestamptz not null default now(),
  previsao_devolucao    date,
  observacao            text,
  situacao              text not null default 'emprestada' check (situacao in ('emprestada','devolvida','danificada','perdida')),
  devolvido_em          timestamptz,
  quantidade_devolvida  numeric(14,3) not null default 0,
  obs_devolucao         text,
  registrado_por        uuid references perfis(id),
  recebido_por          uuid references perfis(id),
  criado_em             timestamptz not null default now()
);
create index on cautelas (funcionario_id) where situacao = 'emprestada';
create index on cautelas (obra_id, situacao);

create or replace function cautela_emprestar(p_obra uuid, p_funcionario uuid, p_insumo uuid, p_quantidade numeric,
  p_previsao date default null, p_observacao text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; f funcionarios;
begin
  perform _almox();
  select * into f from funcionarios where id = p_funcionario;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if not f.ativo then raise exception 'Funcionário desligado não pode retirar ferramenta'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade'; end if;
  if p_previsao is not null and p_previsao < hoje() then raise exception 'A previsão de devolução não pode ser no passado'; end if;
  insert into cautelas (obra_id, funcionario_id, insumo_id, quantidade, previsao_devolucao, observacao, registrado_por)
  values (p_obra, p_funcionario, p_insumo, p_quantidade, p_previsao, nullif(trim(p_observacao), ''), auth.uid()) returning id into v_id;
  perform _mov_quem(p_funcionario);
  perform _movimentar(p_obra, p_insumo, 'saida', p_quantidade, 'cautela', null, 'Emprestado a ' || f.nome || ' (cautela nº ' || v_id || ')');
  perform _mov_quem(null);
  return v_id;
end $$;

-- p_boa: quantidade que voltou em bom estado (volta ao estoque); o restante fica como danificado ou perdido
create or replace function cautela_devolver(p_cautela bigint, p_boa numeric, p_situacao_resto text default 'danificada', p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c cautelas; v_sit text;
begin
  perform _almox();
  select * into c from cautelas where id = p_cautela for update;
  if not found then raise exception 'Cautela não encontrada'; end if;
  if c.situacao <> 'emprestada' then raise exception 'Esta ferramenta já foi devolvida'; end if;
  if p_boa is null or p_boa < 0 or p_boa > c.quantidade then raise exception 'Quantidade devolvida deve estar entre 0 e %', trim_scale(c.quantidade); end if;
  if p_boa < c.quantidade and p_situacao_resto not in ('danificada','perdida') then raise exception 'Informe se o restante voltou danificado ou foi perdido'; end if;
  if p_boa < c.quantidade and coalesce(length(trim(p_observacao)), 0) < 3 then raise exception 'Descreva o que aconteceu com a ferramenta'; end if;
  v_sit := case when p_boa = c.quantidade then 'devolvida' else p_situacao_resto end;
  update cautelas set situacao = v_sit, devolvido_em = now(), quantidade_devolvida = p_boa, obs_devolucao = nullif(trim(p_observacao), ''),
         recebido_por = auth.uid() where id = p_cautela;
  if p_boa > 0 then
    perform _mov_quem(c.funcionario_id);
    perform _movimentar(c.obra_id, c.insumo_id, 'entrada', p_boa, 'devolucao_cautela', null,
      'Devolvido por ' || (select nome from funcionarios where id = c.funcionario_id) || ' (cautela nº ' || c.id || ')');
    perform _mov_quem(null);
  end if;
  if v_sit in ('danificada','perdida') then
    perform _notificar_papel('compras', 'ferramenta_' || v_sit, 'Ferramenta ' || v_sit || ': ' || (select descricao from insumos where id = c.insumo_id),
      format('%s • %s %s não voltaram em bom estado — %s', (select nome from funcionarios where id = c.funcionario_id),
             trim_scale(c.quantidade - p_boa), (select unidade from insumos where id = c.insumo_id), p_observacao), '/almoxarifado/ferramentas');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Inventário: contagem física; diferenças viram ajustes
-- ---------------------------------------------------------------------
create or replace function almox_inventario(p_obra uuid, p_itens jsonb, p_observacao text default null) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_cont numeric; v_saldo numeric; n int := 0; v_ins uuid;
begin
  perform _almox();
  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    continue when nullif(it->>'contado', '') is null;
    v_ins := (it->>'insumo_id')::uuid; v_cont := (it->>'contado')::numeric;
    if v_cont < 0 then raise exception 'Contagem não pode ser negativa'; end if;
    v_saldo := saldo_estoque(v_ins, p_obra);
    if v_cont <> v_saldo then
      perform _movimentar(p_obra, v_ins, 'ajuste', v_cont - v_saldo, 'ajuste_inventario', null,
        format('Inventário %s: sistema %s, contado %s%s', to_char(hoje(), 'DD/MM/YYYY'), trim_scale(v_saldo), trim_scale(v_cont),
               coalesce(' — ' || nullif(trim(p_observacao), ''), '')));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- view das cautelas com nomes e atraso
create view v_cautelas with (security_invoker = true) as
select c.*, f.nome as funcionario_nome, i.codigo, i.descricao, i.unidade, o.codigo as obra_codigo, coalesce(o.nome, 'Depósito central') as local_nome,
       (c.situacao = 'emprestada' and c.previsao_devolucao is not null and c.previsao_devolucao < hoje()) as atrasada
  from cautelas c join funcionarios f on f.id = c.funcionario_id join insumos i on i.id = c.insumo_id left join obras o on o.id = c.obra_id;

create trigger tg_cautelas_nodelete before delete on cautelas for each row execute function _tg_bloquear_exclusao();
create trigger tg_cautelas_audit after insert or update on cautelas for each row execute function _tg_auditoria();
alter table cautelas enable row level security;
revoke all on cautelas from anon;
grant select on cautelas, v_cautelas to authenticated;
create policy cautelas_sel on cautelas for select to authenticated
  using (tem_papel('admin','almoxarifado','compras','engenheiro','seguranca','rh') or (obra_id is not null and membro_obra(obra_id)));

revoke execute on function _almox() from public, anon, authenticated;
revoke execute on function _mov_quem(uuid, text) from public, anon, authenticated;
do $$
declare s text;
begin
  foreach s in array array['almox_retirada(uuid,uuid,numeric,uuid,text,text)','almox_devolucao(uuid,uuid,numeric,uuid,text)',
    'cautela_emprestar(uuid,uuid,uuid,numeric,date,text)','cautela_devolver(bigint,numeric,text,text)','almox_inventario(uuid,jsonb,text)'] loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end $$;
