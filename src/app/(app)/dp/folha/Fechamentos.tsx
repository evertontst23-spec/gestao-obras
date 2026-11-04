import Link from 'next/link';
import { Cartao, Selo } from '@/components/ui';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data } from '@/lib/formato';
import { editarItem } from '../pagamentos/acoes';
import { BENEFICIO, CAT_PAG, STATUS_PAG } from '../pagamentos/comum';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Item = {
  id: number; pagamento_id: string; categoria: string; destino: string; descricao: string; valor: number; obra_id: string | null; empregador_id: string | null;
  funcionarios: { nome: string; funcoes: { nome: string } | null } | null; empregadores: { nome: string; tipo: string } | null; obras: { codigo: string; nome: string } | null;
};
const n = (v: unknown) => Number(v ?? 0);
const TIPO_EMP: Record<string, string> = { fornecedora_mao_obra: 'Instituto / fornecedora de mão de obra', parceira: 'Empresa parceira (CLT)', propria: 'Equipe própria' };

/** Competência do pagamento: período informado; senão, saldo do dia 05 = mês anterior */
function competencia(p: { tipo: string; data_pagamento: string; periodo_inicio: string | null }) {
  if (p.periodo_inicio) return p.periodo_inicio.slice(0, 7);
  const [a, m] = p.data_pagamento.split('-').map(Number);
  if (p.tipo !== 'saldo') return p.data_pagamento.slice(0, 7);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export async function Fechamentos({ supabase, mes, cc: obra, emp, ag, pg, rh, base }:
  { supabase: SB; mes: string; cc?: string; emp?: string; ag?: string; pg?: string; rh: boolean; base: string }) {
  const [a, m] = mes.split('-').map(Number);
  const ini = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10);
  const { data: pags } = await supabase.from('pagamentos').select('id, titulo, tipo, status, data_pagamento, periodo_inicio')
    .gte('data_pagamento', ini).lte('data_pagamento', fim).neq('status', 'cancelado').order('data_pagamento');
  const doMes = ((pags ?? []) as { id: string; titulo: string; tipo: string; status: string; data_pagamento: string; periodo_inicio: string | null }[])
    .filter((p) => competencia(p) === mes);
  const ids = doMes.map((p) => p.id);
  const { data: brutos } = ids.length ? await supabase.from('pagamento_itens')
    .select('id, pagamento_id, categoria, destino, descricao, valor, obra_id, empregador_id, funcionarios(nome, funcoes(nome)), empregadores(nome, tipo), obras(codigo, nome)')
    .in('pagamento_id', ids).eq('removido', false).order('id') : { data: [] };
  const todos = ((brutos ?? []) as unknown as Item[]).filter((i) => !BENEFICIO.includes(i.categoria));
  const pgSel = pg && ids.includes(pg) ? pg : '';
  const itens = todos.filter((i) => (!pgSel || i.pagamento_id === pgSel) && (!obra || (obra === 'sem' ? !i.obra_id : i.obra_id === obra))
    && (!emp || i.empregador_id === emp));
  const pagPorId = new Map(doMes.map((p) => [p.id, p]));
  const agrupar = ag === 'empresa' || ag === 'tipo' ? ag : 'obra';
  const chave = (i: Item) => agrupar === 'empresa' ? i.empregadores?.nome ?? 'Sem empresa'
    : agrupar === 'tipo' ? TIPO_EMP[i.empregadores?.tipo ?? ''] ?? 'Sem empresa'
    : i.obras ? `${i.obras.codigo} — ${i.obras.nome}` : 'Escritório / sem obra';
  const grupos = new Map<string, Item[]>();
  for (const i of itens) grupos.set(chave(i), [...(grupos.get(chave(i)) ?? []), i]);
  const lista = [...grupos.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  const total = itens.reduce((t, i) => t + n(i.valor), 0);
  const empresas = new Map<string, string>();
  todos.forEach((i) => { if (i.empregador_id) empresas.set(i.empregador_id, i.empregadores?.nome ?? ''); });
  const obrasDoMes = new Map<string, string>();
  todos.forEach((i) => obrasDoMes.set(i.obra_id ?? 'sem', i.obras?.codigo ?? 'Escritório / sem obra'));

  return (
    <Cartao titulo={<span>Fechamento dos salários — o que vai ser pago <span className="font-mono text-sinal-700">{reais(total)}</span></span>} className="mb-5">
      {!doMes.length ? <p className="text-sm text-concreto-500">Nenhum pagamento de salários desta competência ainda. Crie em <Link className="link" href="/dp/pagamentos">Pagamentos</Link>.</p> : (<>
        <form className="nao-imprimir mb-3 flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="mes" value={mes} />
          <label>Pagamento<select name="pg" defaultValue={pgSel} className="entrada w-auto"><option value="">Todos do mês</option>{doMes.map((p) => <option key={p.id} value={p.id}>{data(p.data_pagamento)} — {p.tipo === 'saldo' ? 'saldo' : p.tipo}</option>)}</select></label>
          <label>Centro de custo<select name="cc" defaultValue={obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>{[...obrasDoMes.entries()].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Empresa / instituto<select name="emp" defaultValue={emp ?? ''} className="entrada w-auto"><option value="">Todas</option>{[...empresas.entries()].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Separar por<select name="ag" defaultValue={agrupar} className="entrada w-auto"><option value="obra">Centro de custo (obra)</option><option value="empresa">Empresa / instituto</option><option value="tipo">Tipo (instituto, parceira, própria)</option></select></label>
          <button className="rounded-md bg-concreto-800 px-4 py-2 font-semibold text-white">Filtrar</button>
          {(obra || emp || pgSel || ag) && <Link className="link py-2" href={`${base}?mes=${mes}`}>Limpar</Link>}
        </form>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">{doMes.map((p) => (
          <Link key={p.id} href={`/dp/pagamentos/${p.id}`} className="rounded-md border border-concreto-200 px-2 py-1 hover:border-sinal-400">
            {p.titulo} <Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo></Link>))}</div>
        {!itens.length ? <p className="text-sm text-concreto-500">Nada com esses filtros.</p> : (
          <div className="space-y-4">
            {lista.map(([nome, ls]) => (
              <div key={nome} className="rounded-lg border border-concreto-200">
                <div className="flex items-center justify-between bg-concreto-50 px-3 py-2 text-sm font-semibold"><span>{nome} <span className="font-normal text-concreto-500">({ls.length})</span></span><span className="font-mono">{reais(ls.reduce((t, i) => t + n(i.valor), 0))}</span></div>
                <ul className="divide-y divide-concreto-100 text-sm">
                  {ls.map((i) => {
                    const p = pagPorId.get(i.pagamento_id)!;
                    const pode = rh && p.status === 'rascunho';
                    const info = [CAT_PAG[i.categoria], agrupar === 'obra' ? i.empregadores?.nome : i.obras?.codigo, i.destino === 'empresa' ? 'pagar à empresa' : 'pagar ao funcionário', `dia ${data(p.data_pagamento).slice(0, 5)}`].filter(Boolean).join(' • ');
                    return (
                      <li key={i.id} className="px-3 py-2">
                        {pode ? (
                          <FormAcao acao={editarItem} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={i.pagamento_id} /><input type="hidden" name="item" value={i.id} />
                            <div className="min-w-[12rem] flex-1"><div className="text-xs font-semibold">{i.funcionarios?.nome ?? CAT_PAG[i.categoria]} <span className="font-normal text-concreto-500">• {info}</span></div>
                              <input name="descricao" defaultValue={i.descricao} className="entrada !py-1 text-xs" aria-label="Descrição" /></div>
                            <input name="valor" defaultValue={Math.abs(n(i.valor)).toFixed(2).replace('.', ',')} inputMode="decimal" className={`entrada w-28 !py-1 text-right font-mono ${n(i.valor) < 0 ? 'text-atraso-700' : ''}`} aria-label="Valor" />
                            <Botao variante="secundario" className="!px-2 !py-1 text-xs">Salvar</Botao>
                          </FormAcao>
                        ) : (
                          <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{i.funcionarios?.nome ?? CAT_PAG[i.categoria]} <span className="font-normal text-concreto-500">• {info}</span></div><div className="text-xs text-concreto-500">{i.descricao}</div></div>
                            <span className="font-mono">{reais(i.valor)}</span></div>)}
                      </li>);
                  })}
                </ul>
              </div>))}
          </div>)}
        <p className="nao-imprimir mt-2 text-xs text-concreto-500">Mesmas linhas da aba Pagamentos (editar aqui ou lá dá no mesmo). Passagens e alimentação ficam em Benefícios. Para incluir, retirar ou fechar e lançar no financeiro, abra o pagamento.</p>
      </>)}
    </Cartao>
  );
}
