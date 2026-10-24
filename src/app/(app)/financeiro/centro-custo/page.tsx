import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { BaixarCSV } from '@/components/BaixarCSV';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { CATEGORIAS_DESPESA, reais } from '@/lib/dominio';
import { hojeISO } from '@/lib/formato';

export const metadata = { title: 'Centro de custo por obra' };

type L = { obra_id: string | null; tipo: 'receita' | 'despesa'; categoria: string; valor: number; valor_liquidado: number | null; status: string; competencia: string; origem: string };
const fimDoMes = (m: string) => { const [a, mm] = m.split('-').map(Number); return new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10); };
const ok = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : null);

/** Custos e receitas separados por obra (centro de custo), por categoria, na competência escolhida. */
export default async function CentroCusto({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'financeiro');
  const hoje = hojeISO();
  const de = ok(sp.de) ?? `${hoje.slice(0, 4)}-01`, ate = ok(sp.ate) ?? hoje.slice(0, 7);
  const [{ data: lancs }, { data: obras }] = await Promise.all([
    supabase.from('lancamentos').select('obra_id, tipo, categoria, valor, valor_liquidado, status, competencia, origem')
      .neq('status', 'cancelado').gte('competencia', `${de}-01`).lte('competencia', fimDoMes(ate)).limit(20000),
    supabase.from('obras').select('id, codigo, nome, situacao, orcamento_custo').order('codigo'),
  ]);
  const l = (lancs ?? []) as L[];
  const cats = Object.keys(CATEGORIAS_DESPESA).filter((c) => l.some((x) => x.tipo === 'despesa' && x.categoria === c));
  const info = new Map((obras ?? []).map((o) => [o.id, o]));
  type Linha = { id: string; codigo: string; nome: string; desp: Record<string, number>; despesa: number; pago: number; receita: number; orcamento: number | null };
  const linhas = new Map<string, Linha>();
  for (const x of l) {
    const k = x.obra_id ?? 'adm';
    const o = x.obra_id ? info.get(x.obra_id) : null;
    const r: Linha = linhas.get(k) ?? { id: k, codigo: o?.codigo ?? 'ADM', nome: o?.nome ?? 'Administração central (sem obra)', desp: {}, despesa: 0, pago: 0, receita: 0, orcamento: o?.orcamento_custo ?? null };
    const v = Number(x.valor);
    if (x.tipo === 'despesa') {
      r.desp[x.categoria] = (r.desp[x.categoria] ?? 0) + v; r.despesa += v;
      if (x.status === 'liquidado') r.pago += Number(x.valor_liquidado ?? v);
    } else r.receita += v;
    linhas.set(k, r);
  }
  let lista = [...linhas.values()].sort((a, b) => (a.id === 'adm' ? 1 : b.id === 'adm' ? -1 : a.codigo.localeCompare(b.codigo)));
  if (sp.obra) lista = lista.filter((x) => x.id === sp.obra);
  const tot = (f: (x: Linha) => number) => lista.reduce((s, x) => s + f(x), 0);
  const csv = lista.map((x) => [x.codigo, x.nome, ...cats.map((c) => x.desp[c] ?? 0), x.despesa, x.receita, x.receita - x.despesa]);
  const periodo = de === ate ? de.split('-').reverse().join('/') : `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`;

  return (
    <>
      <Cabecalho titulo="Centro de custo por obra" sub={`Competência ${periodo}. Compras (OC), pagamentos da equipe, folha e medições entram sozinhos no centro de custo da obra.`}
        acoes={<div className="flex gap-2"><BaixarCSV nome={`centro-custo-${de}-${ate}`} cabecalho={['Obra', 'Nome', ...cats.map((c) => CATEGORIAS_DESPESA[c]), 'Custo total', 'Receitas', 'Resultado']} linhas={csv} /><BotaoImprimir rotulo="🖨 PDF" /></div>} />
      <AbasFinanceiro atual="cc" />
      <form className="nao-imprimir mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="text-xs text-concreto-600">De<input type="month" name="de" defaultValue={de} className="entrada block w-auto" /></label>
        <label className="text-xs text-concreto-600">Até<input type="month" name="ate" defaultValue={ate} className="entrada block w-auto" /></label>
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option><option value="adm">Administração central</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <button className="rounded-md bg-concreto-800 px-4 py-2 font-semibold text-white">Ver</button>
      </form>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Custo no período" valor={reais(tot((x) => x.despesa))} />
        <Indicador rotulo="Já pago" valor={reais(tot((x) => x.pago))} tom="ok" />
        <Indicador rotulo="Receitas (medições)" valor={reais(tot((x) => x.receita))} />
        <Indicador rotulo="Resultado" valor={reais(tot((x) => x.receita - x.despesa))} tom={tot((x) => x.receita - x.despesa) < 0 ? 'atraso' : 'ok'} />
      </div>
      {!lista.length ? <Vazio>Nenhum lançamento no período.</Vazio> : (
        <div className="space-y-5">
          <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela whitespace-nowrap">
            <thead><tr><th>Obra</th>{cats.map((c) => <th key={c} className="text-right">{CATEGORIAS_DESPESA[c].replace(/ \(.*\)/, '')}</th>)}<th className="text-right">Custo total</th><th className="text-right">Receitas</th><th className="text-right">Resultado</th></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id}>
                  <td><Link className="link font-semibold" href={x.id === 'adm' ? '/financeiro/lancamentos?obra=adm&situacao=todos' : `/obras/${x.id}/financeiro`}>{x.codigo}</Link><div className="text-xs text-concreto-500">{x.nome}</div></td>
                  {cats.map((c) => <td key={c} className="text-right font-mono">{x.desp[c] ? reais(x.desp[c]) : '—'}</td>)}
                  <td className="text-right font-mono font-bold">{reais(x.despesa)}{x.orcamento ? <div className="text-xs font-normal text-concreto-500">orçado {reais(x.orcamento)}</div> : null}</td>
                  <td className="text-right font-mono">{x.receita ? reais(x.receita) : '—'}</td>
                  <td className={`text-right font-mono font-semibold ${x.receita - x.despesa < 0 ? 'text-atraso-700' : 'text-ok-700'}`}>{reais(x.receita - x.despesa)}</td>
                </tr>))}
              {lista.length > 1 && (
                <tr className="bg-concreto-50 font-semibold"><td>Total</td>{cats.map((c) => <td key={c} className="text-right font-mono">{reais(tot((x) => x.desp[c] ?? 0))}</td>)}
                  <td className="text-right font-mono">{reais(tot((x) => x.despesa))}</td><td className="text-right font-mono">{reais(tot((x) => x.receita))}</td><td className="text-right font-mono">{reais(tot((x) => x.receita - x.despesa))}</td></tr>)}
            </tbody>
          </table></div>
          <Cartao titulo="Como cada custo chega à obra">
            <ul className="list-disc space-y-1 pl-5 text-sm text-concreto-600">
              <li><b>Mão de obra e benefícios:</b> ao fechar um pagamento da equipe (dia 20 ou 05), cada linha vai para a obra do funcionário. A taxa das empresas também é dividida por obra.</li>
              <li><b>Folha fechada por obra:</b> salários, INSS, FGTS e benefícios entram no centro de custo daquela obra.</li>
              <li><b>Material:</b> cada ordem de compra entra na obra que pediu. Quem está no escritório ou sem obra fica em “Administração central”.</li>
            </ul>
          </Cartao>
        </div>)}
    </>
  );
}
