import Link from 'next/link';
import { Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { Botao, FormAcao } from '@/components/formulario';
import { nomeMes } from '@/components/AbasDP';
import { reais } from '@/lib/dominio';
import { data } from '@/lib/formato';
import { editarItem, removerItem } from '../pagamentos/acoes';
import { BENEFICIO, CAT_PAG, STATUS_PAG } from '../pagamentos/comum';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type PagResumo = { id: string; titulo: string; tipo: string; status: string; data_pagamento: string; periodo_inicio: string | null };
type Item = {
  id: number; pagamento_id: string; funcionario_id: string | null; categoria: string; destino: string; descricao: string; valor: number;
  obra_id: string | null; empregador_id: string | null;
  funcionarios: { nome: string; ativo: boolean; funcoes: { nome: string } | null } | null; empregadores: { nome: string; tipo: string } | null; obras: { codigo: string; nome: string } | null;
};
const n = (v: unknown) => Number(v ?? 0);
const TIPO_EMP: Record<string, string> = { fornecedora_mao_obra: 'Institutos / fornecedoras (IDERES, FÊNIX)', parceira: 'CLT de empresa parceira (Mundial/A2)', propria: 'Equipe própria (CAD)' };
const VER = { obra: 'Centro de custo (obra)', empresa: 'Empresa / instituto', tipo: 'Tipo de contratação' } as const;
type Ver = keyof typeof VER;

/** Competência do pagamento: período informado; senão o saldo do dia 05 é do mês anterior */
export function competencia(p: { tipo: string; data_pagamento: string; periodo_inicio: string | null }) {
  if (p.periodo_inicio) return p.periodo_inicio.slice(0, 7);
  if (p.tipo !== 'saldo') return p.data_pagamento.slice(0, 7);
  const [a, m] = p.data_pagamento.split('-').map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

export async function Fechamentos({ supabase, mes, pags, ver: verP, g: gP, pg: pgP, rh, base = '/dp/folha', umPagamento = false }:
  { supabase: SB; mes: string; pags: PagResumo[]; ver?: string; g?: string; pg?: string; rh: boolean; base?: string; umPagamento?: boolean }) {
  const doMes = pags.filter((p) => umPagamento || competencia(p) === mes).sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento));
  const ids = doMes.map((p) => p.id);
  const { data: brutos } = ids.length ? await supabase.from('pagamento_itens')
    .select('id, pagamento_id, funcionario_id, categoria, destino, descricao, valor, obra_id, empregador_id, funcionarios(nome, ativo, funcoes(nome)), empregadores(nome, tipo), obras(codigo, nome)')
    .in('pagamento_id', ids).eq('removido', false).order('id') : { data: [] };
  const brutosOk = ((brutos ?? []) as unknown as Item[]).filter((i) => umPagamento || !BENEFICIO.includes(i.categoria));
  // na Folha, quem já saiu não aparece (o que foi pago a eles continua no pagamento)
  const desligados = umPagamento ? [] : brutosOk.filter((i) => i.funcionarios && !i.funcionarios.ativo);
  const todos = umPagamento ? brutosOk : brutosOk.filter((i) => !(i.funcionarios && !i.funcionarios.ativo));
  const pagPorId = new Map(doMes.map((p) => [p.id, p]));

  const ver: Ver = verP === 'empresa' || verP === 'tipo' ? verP : 'obra';
  const pg = pgP && ids.includes(pgP) ? pgP : null;
  const chaveDe = (i: Item) => ver === 'obra' ? i.obra_id ?? 'sem' : ver === 'empresa' ? i.empregador_id ?? 'sem' : i.empregadores?.tipo ?? 'sem';
  const nomeDe = (i: Item) => ver === 'obra' ? (i.obras ? `${i.obras.codigo} — ${i.obras.nome}` : 'Escritório / sem obra')
    : ver === 'empresa' ? i.empregadores?.nome ?? 'Sem empresa' : TIPO_EMP[i.empregadores?.tipo ?? ''] ?? 'Sem empresa';
  const visiveis = todos.filter((i) => !pg || i.pagamento_id === pg);
  const grupos = new Map<string, { nome: string; itens: Item[] }>();
  for (const i of visiveis) { const k = chaveDe(i); if (!grupos.has(k)) grupos.set(k, { nome: nomeDe(i), itens: [] }); grupos.get(k)!.itens.push(i); }
  const ordem = [...grupos.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  const gSel = gP && grupos.has(gP) ? gP : null;
  const sel = gSel ? grupos.get(gSel)!.itens : visiveis;

  const soma = (ls: Item[], f: (i: Item) => boolean = () => true) => ls.filter(f).reduce((t, i) => t + n(i.valor), 0);
  const pessoas = (ls: Item[]) => new Set(ls.filter((i) => i.funcionario_id).map((i) => i.funcionario_id)).size;
  const url = (o: { ver?: Ver; g?: string | null; pg?: string | null }) => {
    const q = new URLSearchParams(umPagamento ? {} : { mes });
    const v = o.ver ?? ver; if (v !== 'obra') q.set('ver', v);
    const gg = o.ver && o.ver !== ver ? null : o.g === undefined ? gSel : o.g; if (gg) q.set('g', gg);
    const p = o.pg === undefined ? pg : o.pg; if (p) q.set('pg', p);
    return `${base}?${q.toString()}`;
  };
  const chip = (ativo: boolean) => `rounded-md border px-3 py-1.5 text-sm font-semibold ${ativo ? 'border-sinal-500 bg-sinal-500 text-white' : 'border-concreto-300 bg-white text-concreto-700 hover:border-sinal-400'}`;
  const rotPag = (p: PagResumo) => `${p.tipo === 'saldo' ? 'Saldo' : p.tipo === 'adiantamento' ? 'Adiantamento' : 'Pagamento'} de ${data(p.data_pagamento).slice(0, 5)}`;

  if (!doMes.length) return <Vazio>Nenhum fechamento de salários em {nomeMes(mes)}. Crie em <Link className="link" href="/dp/pagamentos">Pagamentos</Link>.</Vazio>;

  return (
    <>
      <h2 className="so-imprimir mb-2 text-lg font-bold capitalize">Folha — {nomeMes(mes)}{gSel ? ` — ${grupos.get(gSel)!.nome}` : ''}</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo={gSel ? grupos.get(gSel)!.nome : 'Total da folha'} valor={reais(soma(sel))} tom="sinal" />
        <Indicador rotulo="Pagar às empresas" valor={reais(soma(sel, (i) => i.destino === 'empresa'))} detalhe="IDERES, FÊNIX, Mundial/A2 (com taxas)" />
        <Indicador rotulo="Pagar aos funcionários" valor={reais(soma(sel, (i) => i.destino !== 'empresa'))} detalhe="equipe CAD" />
        {umPagamento && soma(sel, (i) => BENEFICIO.includes(i.categoria)) !== 0
          ? <Indicador rotulo="Passagens e alimentação" valor={reais(soma(sel, (i) => BENEFICIO.includes(i.categoria)))} detalhe={`${pessoas(sel)} funcionários`} />
          : <Indicador rotulo="Funcionários" valor={pessoas(sel)} detalhe={doMes.map(rotPag).join(' + ')} />}
      </div>

      {!umPagamento && <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
        {doMes.map((p) => (
          <Link key={p.id} href={`/dp/pagamentos/${p.id}`} className="flex items-center gap-1 rounded-md border border-concreto-200 bg-white px-2 py-1 hover:border-sinal-400">
            <b>{rotPag(p)}</b> <span className="font-mono">{reais(soma(todos, (i) => i.pagamento_id === p.id))}</span> <Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo></Link>))}
        <span className="text-xs text-concreto-500">abrir para incluir/retirar linhas ou fechar no financeiro</span>
      </div>}

      {/* filtros */}
      <div className="nao-imprimir mb-5 space-y-2 rounded-lg border border-concreto-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-semibold text-concreto-600">Separar por:</span>
          {(Object.keys(VER) as Ver[]).map((v) => <Link key={v} href={url({ ver: v, g: null })} className={chip(ver === v)}>{VER[v]}</Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-semibold text-concreto-600">{ver === 'obra' ? 'Obra:' : ver === 'empresa' ? 'Empresa:' : 'Tipo:'}</span>
          <Link href={url({ g: null })} className={chip(!gSel)}>Resumo de todas</Link>
          {ordem.map(([k, gr]) => (
            <Link key={k} href={url({ g: k })} className={chip(gSel === k)}>{gr.nome} <span className="font-mono text-xs opacity-80">{reais(soma(gr.itens))}</span></Link>))}
        </div>
        {!umPagamento && <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-semibold text-concreto-600">Pagamento:</span>
          <Link href={url({ pg: null })} className={chip(!pg)}>Todos do mês</Link>
          {doMes.map((p) => <Link key={p.id} href={url({ pg: p.id })} className={chip(pg === p.id)}>{rotPag(p)}</Link>)}
        </div>}
      </div>

      {!gSel ? (
        <Cartao titulo={`Resumo por ${VER[ver].toLowerCase()}`}>
          <div className="overflow-x-auto"><table className="tabela whitespace-nowrap">
            <thead><tr><th>{VER[ver]}</th><th className="text-right">Func.</th>
              {(pg ? doMes.filter((p) => p.id === pg) : doMes).map((p) => <th key={p.id} className="text-right">{rotPag(p)}</th>)}
              <th className="text-right">Empresas</th><th className="text-right">Funcionários</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {ordem.map(([k, gr]) => (
                <tr key={k}>
                  <td><Link className="link font-semibold" href={url({ g: k })}>{gr.nome}</Link></td>
                  <td className="text-right">{pessoas(gr.itens)}</td>
                  {(pg ? doMes.filter((p) => p.id === pg) : doMes).map((p) => <td key={p.id} className="text-right font-mono">{reais(soma(gr.itens, (i) => i.pagamento_id === p.id))}</td>)}
                  <td className="text-right font-mono">{reais(soma(gr.itens, (i) => i.destino === 'empresa'))}</td>
                  <td className="text-right font-mono">{reais(soma(gr.itens, (i) => i.destino !== 'empresa'))}</td>
                  <td className="text-right font-mono font-bold">{reais(soma(gr.itens))}</td>
                </tr>))}
              <tr className="bg-concreto-50 font-semibold"><td>Total</td><td className="text-right">{pessoas(visiveis)}</td>
                {(pg ? doMes.filter((p) => p.id === pg) : doMes).map((p) => <td key={p.id} className="text-right font-mono">{reais(soma(visiveis, (i) => i.pagamento_id === p.id))}</td>)}
                <td className="text-right font-mono">{reais(soma(visiveis, (i) => i.destino === 'empresa'))}</td>
                <td className="text-right font-mono">{reais(soma(visiveis, (i) => i.destino !== 'empresa'))}</td>
                <td className="text-right font-mono">{reais(soma(visiveis))}</td></tr>
            </tbody>
          </table></div>
          <p className="mt-2 text-xs text-concreto-500">Clique numa linha para ver e editar os valores de cada funcionário.</p>
          {desligados.length > 0 && (
            <p className="mt-1 text-xs text-concreto-500">Não aparecem aqui {new Set(desligados.map((i) => i.funcionario_id)).size} funcionário(s) que já saíram ({[...new Set(desligados.map((i) => i.funcionarios?.nome?.split(' ')[0]))].join(', ')}): {reais(soma(desligados))} já acertados — ficam registrados em <Link className="link" href="/dp/pagamentos">Pagamentos</Link>.</p>)}
        </Cartao>
      ) : (
        <Cartao titulo={grupos.get(gSel)!.nome}>
          <div className="space-y-6">{(pg ? doMes.filter((p) => p.id === pg) : doMes).map((p) => {
            const lp = sel.filter((i) => i.pagamento_id === p.id)
              .sort((a, b) => (a.funcionarios?.nome ?? 'zz').localeCompare(b.funcionarios?.nome ?? 'zz') || a.id - b.id);
            if (!lp.length) return null;
            const pode = rh && p.status === 'rascunho';
            return (
              <section key={p.id}>
                <div className="mb-2 flex items-center justify-between border-b-2 border-concreto-200 pb-1">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-concreto-700">{rotPag(p)} <span className="font-normal normal-case text-concreto-500">({pessoas(lp)} func.)</span> {!pode && <Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo>}</h3>
                  <b className="font-mono">{reais(soma(lp))}</b>
                </div>
                {(() => {
                  // uma linha por funcionário (taxas e valores sem funcionário ficam em linha própria)
                  const pessoasG = new Map<string, Item[]>();
                  for (const i of lp) { const k = i.funcionario_id ?? `x${i.id}`; pessoasG.set(k, [...(pessoasG.get(k) ?? []), i]); }
                  const cols = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_110px_110px_120px_70px]';
                  return (<>
                    <div className={`${cols} mb-1 hidden text-[11px] font-semibold uppercase tracking-wide text-concreto-400 sm:grid`}>
                      <span>Funcionário</span><span>{ver === 'obra' ? 'Empresa' : 'Obra'}</span><span className="text-right">Valor</span><span className="text-right">Descontos</span><span className="text-right">A pagar</span><span />
                    </div>
                    <div className="divide-y divide-concreto-100">{[...pessoasG.entries()].map(([k, its]) => {
                      const i0 = its[0];
                      const bruto = soma(its, (i) => n(i.valor) > 0); const desc = soma(its, (i) => n(i.valor) < 0);
                      const resumo = its.map((i) => i.descricao).join(' • ');
                      return (
                        <div key={k} className="py-2">
                          <div className={`${cols} text-sm`}>
                            <span className="font-semibold">{i0.funcionarios?.nome ?? CAT_PAG[i0.categoria]}
                              <span className="block text-[11px] font-normal text-concreto-500">{i0.funcionarios?.funcoes?.nome ?? (i0.destino === 'empresa' ? 'pagar à empresa' : '')}{i0.funcionarios ? '' : ` • ${i0.descricao}`}</span></span>
                            <span className="hidden text-xs text-concreto-600 sm:block">{ver === 'obra' ? i0.empregadores?.nome ?? '—' : i0.obras?.codigo ?? 'sem obra'}</span>
                            <span className="hidden text-right font-mono sm:block">{reais(bruto)}</span>
                            <span className={`hidden text-right font-mono sm:block ${desc ? 'text-atraso-700' : 'text-concreto-400'}`}>{desc ? reais(desc) : '—'}</span>
                            <span className="text-right font-mono font-bold">{reais(bruto + desc)}</span>
                            <span className="hidden sm:block" />
                          </div>
                          {i0.funcionarios && <div className="text-[11px] text-concreto-500">{resumo}</div>}
                          {pode && (
                            <details className="nao-imprimir mt-1">
                              <summary className="cursor-pointer text-[11px] font-semibold text-sinal-700">editar</summary>
                              <div className="mt-1 space-y-1 rounded-md bg-concreto-50 p-2">{its.map((i) => (
                                <div key={i.id} className="flex flex-wrap items-center gap-2">
                                  <FormAcao acao={editarItem} className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><input type="hidden" name="id" value={i.pagamento_id} /><input type="hidden" name="item" value={i.id} />
                                    <span className={`w-24 text-xs font-semibold ${i.categoria === 'desconto' ? 'text-atraso-700' : ''}`}>{CAT_PAG[i.categoria]}</span>
                                    <input name="descricao" defaultValue={i.descricao} className="entrada min-w-[10rem] flex-1 px-2 py-1 text-xs" aria-label="Descrição" />
                                    <input name="valor" defaultValue={Math.abs(n(i.valor)).toFixed(2).replace('.', ',')} inputMode="decimal" className="entrada w-28 px-2 py-1 text-right font-mono" aria-label="Valor" />
                                    <Botao variante="secundario" className="px-2 py-1 text-xs">Salvar</Botao>
                                  </FormAcao>
                                  {umPagamento && (
                                    <FormAcao acao={removerItem}><input type="hidden" name="id" value={i.pagamento_id} /><input type="hidden" name="item" value={i.id} />
                                      <button className="text-[11px] text-atraso-700 hover:underline">retirar</button></FormAcao>)}
                                </div>))}</div>
                            </details>)}
                        </div>);
                    })}</div>
                  </>);
                })()}
              </section>);
          })}</div>
          <p className="nao-imprimir mt-3 text-xs text-concreto-500">Desconto é sempre abatido (digite o valor sem sinal).{!umPagamento && ' Passagens e alimentação ficam na aba Benefícios.'}</p>
        </Cartao>)}
    </>
  );
}
