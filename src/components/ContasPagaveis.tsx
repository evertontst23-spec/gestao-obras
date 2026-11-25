'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Selo } from '@/components/ui';
import { UploadArquivo } from '@/components/UploadArquivo';
import { darBaixaContas } from '@/app/(app)/financeiro/acoes';
import { CATEGORIAS_FIN, ORIGEM_LANC, codLanc, reais, situacaoLanc } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';

export type SRow = {
  id: string; vencimento: string; descricao: string; numero: number; categoria: string;
  origem: string; tipo: 'receita' | 'despesa'; valor: number; valor_liquidado: number | null; status: string;
  boleto: boolean; comprovante: boolean; pix: string | null;
  fornecedor: string | null; favorecido: string | null; obra: string;
  pagavel: boolean; temChave: boolean;
};
export type SGrupoPag = { kind: 'pag'; key: string; pag: string; titulo: string; count: number; quem: string; obra: string; venc: string; valor: number; cor: string; rotulo: string };
export type SGrupo = SGrupoPag | { kind: 'row'; key: string; row: SRow };

const linhaFn = (l: SRow) => {
  const s = situacaoLanc(l, hojeISO());
  return (
    <>
      <td className="whitespace-nowrap font-mono text-sm">{data(l.vencimento)}</td>
      <td><Link href={`/financeiro/lancamentos/${l.id}`} className="link">{l.descricao}</Link>
        <div className="text-xs text-concreto-500">{codLanc(l.numero)} • {CATEGORIAS_FIN[l.categoria]}{l.fornecedor ? ` • ${l.fornecedor}` : l.favorecido ? ` • ${l.favorecido}` : ''}{l.origem !== 'manual' && ` • via ${ORIGEM_LANC[l.origem]}`}</div></td>
      <td className="whitespace-nowrap text-xs">{l.obra}</td>
      <td className={`whitespace-nowrap text-right font-mono font-semibold ${l.tipo === 'receita' ? 'text-ok-700' : 'text-atraso-700'}`}>{l.tipo === 'receita' ? '+' : '−'}{reais(l.valor)}</td>
      <td className="whitespace-nowrap"><Selo cor={s.cor}>{s.rotulo}</Selo>
        {l.status === 'aberto' && l.tipo === 'despesa' && (l.boleto
          ? <span className="ml-1 text-xs text-ok-700" title="Boleto anexado">📄</span>
          : <Link href={`/financeiro/lancamentos/${l.id}`} className="ml-1 text-[11px] font-semibold text-atencao-800">sem boleto</Link>)}
        {l.status === 'liquidado' && l.tipo === 'despesa' && (l.comprovante
          ? <span className="ml-1 text-xs text-ok-700" title="Comprovante anexado">📎</span>
          : <Link href={`/financeiro/lancamentos/${l.id}`} className="ml-1 text-[11px] font-semibold text-atencao-800">sem comprovante</Link>)}</td>
    </>
  );
};

/** Lista de contas com seleção: marca o que vai pagar, baixa a planilha do C6, anexa o comprovante e dá baixa em lote. */
export function ContasPagaveis({ grupos, totReceita, totDespesa }: { grupos: SGrupo[]; totReceita: number; totDespesa: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<'baixa' | null>(null);
  const [dataPg, setDataPg] = useState(hojeISO());

  const pagaveis = useMemo(() => grupos.flatMap((g) => (g.kind === 'row' && g.row.pagavel ? [g.row] : [])), [grupos]);
  const porId = useMemo(() => new Map(pagaveis.map((r) => [r.id, r])), [pagaveis]);
  const marcadas = [...sel].map((id) => porId.get(id)).filter(Boolean) as SRow[];
  const total = marcadas.reduce((s, r) => s + r.valor, 0);
  const semChave = marcadas.filter((r) => !r.temChave);
  const comChave = marcadas.filter((r) => r.temChave);
  const todasMarcadas = pagaveis.length > 0 && pagaveis.every((r) => sel.has(r.id));

  const alterna = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarTodas = () => setSel(todasMarcadas ? new Set() : new Set(pagaveis.map((r) => r.id)));
  const limpar = () => { setSel(new Set()); setModo(null); };

  const baixarC6 = () => {
    if (!comChave.length) return;
    const ids = comChave.map((r) => r.id).join(',');
    window.location.href = `/financeiro/lancamentos/c6?ids=${ids}&data=${dataPg}`;
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-superficie"><table className="tabela">
        <thead><tr>
          {pagaveis.length > 0 && <th className="w-8"><input type="checkbox" checked={todasMarcadas} onChange={marcarTodas} title="Marcar todas as pagáveis" aria-label="Marcar todas" /></th>}
          <th>Vencimento</th><th>Descrição</th><th>Obra</th><th className="text-right">Valor</th><th>Situação</th>
        </tr></thead>
        <tbody>
          {grupos.map((g) => {
            if (g.kind === 'pag') return (
              <tr key={g.key}>
                {pagaveis.length > 0 && <td />}
                <td className="whitespace-nowrap font-mono text-sm">{data(g.venc)}</td>
                <td><Link href={`/dp/pagamentos/${g.pag}`} className="link font-semibold">{g.titulo}</Link>
                  <div className="text-xs text-concreto-500">{g.count} conta(s){g.quem ? ` • ${g.quem}` : ''}</div></td>
                <td className="whitespace-nowrap text-xs">{g.obra}</td>
                <td className="whitespace-nowrap text-right font-mono font-semibold text-atraso-700">−{reais(g.valor)}</td>
                <td className="whitespace-nowrap"><Selo cor={g.cor}>{g.rotulo}</Selo></td>
              </tr>);
            const r = g.row;
            const marcada = sel.has(r.id);
            return (
              <tr key={g.key} className={marcada ? 'bg-sinal-50' : ''}>
                {pagaveis.length > 0 && <td>{r.pagavel && <input type="checkbox" checked={marcada} onChange={() => alterna(r.id)} aria-label={`Marcar ${r.descricao}`} />}</td>}
                {linhaFn(r)}
              </tr>);
          })}
          <tr className="bg-concreto-50 font-semibold">
            <td colSpan={pagaveis.length > 0 ? 4 : 3}>Totais da lista</td>
            <td className="whitespace-nowrap text-right font-mono"><div className="text-ok-700">+{reais(totReceita)}</div><div className="text-atraso-700">−{reais(totDespesa)}</div></td>
            <td />
          </tr>
        </tbody>
      </table></div>

      {marcadas.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 rounded-lg border border-sinal-300 bg-superficie p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <b className="text-concreto-900">{marcadas.length} conta(s) marcada(s)</b> — total <b className="font-mono text-atraso-700">{reais(total)}</b>
              {semChave.length > 0 && <div className="mt-0.5 text-xs text-atencao-800">⚠ {semChave.length} sem chave Pix (não entram na planilha; abra a conta e informe o Pix).</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={limpar} className="rounded-md border border-concreto-300 px-3 py-2 text-sm font-semibold text-concreto-700 hover:bg-concreto-50">Limpar</button>
              <button onClick={baixarC6} disabled={!comChave.length} className="rounded-md bg-concreto-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">⬇ Planilha C6 ({comChave.length})</button>
              <button onClick={() => setModo(modo === 'baixa' ? null : 'baixa')} className="rounded-md bg-sinal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sinal-600">Anexar comprovante e dar baixa</button>
            </div>
          </div>
          {modo === 'baixa' && (
            <div className="mt-4 border-t border-concreto-100 pt-4">
              <p className="mb-3 text-sm text-concreto-700">Depois de pagar no C6, informe a data e anexe o comprovante do lote. As {marcadas.length} conta(s) marcada(s) serão baixadas de uma vez.</p>
              <UploadArquivo pasta="fin/comprovantes" acao={darBaixaContas} exigirArquivo={false} rotuloBotao={`Dar baixa em ${marcadas.length} conta(s)`} aoConcluir={limpar}>
                <input type="hidden" name="ids" value={marcadas.map((r) => r.id).join(',')} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="mb-1 block text-sm font-semibold text-concreto-700">Data do pagamento</span>
                    <input type="date" name="data" value={dataPg} max={hojeISO()} onChange={(e) => setDataPg(e.target.value)} className="entrada" /></label>
                  <label className="block"><span className="mb-1 block text-sm font-semibold text-concreto-700">Forma</span>
                    <select name="forma" defaultValue="PIX" className="entrada"><option>PIX</option><option>Boleto</option><option>Transferência</option><option>Dinheiro</option></select></label>
                </div>
              </UploadArquivo>
            </div>)}
        </div>)}
    </>
  );
}
