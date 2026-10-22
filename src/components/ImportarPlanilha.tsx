'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { importarPlanilha } from '@/app/(app)/obras/avanco-acoes';
import { ROTULOS_COLUNA, escolherAba, detectarCabecalho, formatarReais, interpretar, type Coluna, type Mapeamento } from '@/lib/planilha';
import type { Aba } from '@/lib/lerArquivo';

const letra = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const COLUNAS = Object.keys(ROTULOS_COLUNA) as Coluna[];
const num = (n: number | null, c = 2) => (n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: c }));

export function ImportarPlanilha({ obraId, reimportar = false }: { obraId: string; reimportar?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState<Aba[]>([]);
  const [abaSel, setAbaSel] = useState('');
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [criarEtapas, setCriarEtapas] = useState(true);
  const [estado, setEstado] = useState<'livre' | 'lendo' | 'enviando'>('livre');
  const [erro, setErro] = useState<string | null>(null);

  const aba = abas.find((a) => a.nome === abaSel);
  const resultado = useMemo(() => (aba && mapa ? interpretar(aba.valores, aba.textos, mapa) : null), [aba, mapa]);
  const nColunas = aba ? Math.max(...aba.valores.slice(0, 60).map((l) => l?.length ?? 0), 1) : 0;
  const cab = aba && mapa ? aba.textos[mapa.linhaCabecalho] ?? [] : [];

  async function abrir(f: File | undefined) {
    if (!f) return;
    setErro(null); setEstado('lendo'); setArquivo(f);
    try {
      const { lerPlanilha } = await import('@/lib/lerArquivo');
      const lidas = lerPlanilha(await f.arrayBuffer(), f.name);
      const melhor = escolherAba(lidas.map((a) => ({ nome: a.nome, valores: a.valores })));
      setAbas(lidas);
      if (!melhor) {
        setAbaSel(lidas[0]?.nome ?? '');
        setMapa({ linhaCabecalho: 0, colunas: {} });
        setErro('Não reconheci o cabeçalho automaticamente. Indique abaixo a linha do cabeçalho e as colunas.');
      } else { setAbaSel(melhor.nome); setMapa(melhor.mapa); }
    } catch (e) {
      setErro('Não foi possível ler o arquivo: ' + (e as Error).message);
    } finally { setEstado('livre'); }
  }

  function trocarAba(nome: string) {
    setAbaSel(nome);
    const a = abas.find((x) => x.nome === nome);
    setMapa(a ? detectarCabecalho(a.valores) ?? { linhaCabecalho: 0, colunas: {} } : null);
  }
  function trocarColuna(c: Coluna, v: string) {
    if (!mapa) return;
    const colunas = { ...(resultado?.mapa.colunas ?? mapa.colunas) };
    if (v === '') delete colunas[c]; else colunas[c] = Number(v);
    setMapa({ ...mapa, colunas });
  }

  async function confirmar() {
    if (!resultado || !arquivo || !mapa) return;
    setErro(null); setEstado('enviando');
    let caminho: string | null = null;
    try {
      const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? 'xlsx';
      const p = `${obraId}/planilhas/${crypto.randomUUID()}.${ext}`;
      const up = await criarClienteNavegador().storage.from('anexos').upload(p, arquivo, { contentType: arquivo.type || 'application/octet-stream' });
      if (!up.error) caminho = p;
    } catch { /* o original é opcional; os dados seguem */ }
    const r = await importarPlanilha({ obraId, nome: arquivo.name, caminho, aba: abaSel, mapa: resultado.mapa, itens: resultado.itens, criarEtapas });
    setEstado('livre');
    if (r?.erro) { setErro(r.erro); return; }
    setAbas([]); setArquivo(null); setMapa(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input ref={ref} type="file" className="hidden" accept=".xlsx,.xls,.xlsm,.ods,.csv"
        onChange={(e) => { abrir(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={estado !== 'livre'}
        className="flex min-h-[88px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-concreto-300 bg-white px-4 text-center hover:border-sinal-400 disabled:opacity-60">
        <span className="text-base font-bold">{estado === 'lendo' ? 'Lendo planilha…' : arquivo ? `📄 ${arquivo.name} — trocar arquivo` : `📊 ${reimportar ? 'Reimportar' : 'Lançar'} planilha da obra`}</span>
        <span className="text-xs text-concreto-500">Excel (.xlsx, .xls), LibreOffice (.ods) ou CSV — orçamento sintético, EAP ou planilha de quantitativos</span>
      </button>
      {erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{erro}</p>}

      {aba && mapa && resultado && (
        <div className="space-y-4 rounded-lg border border-concreto-200 bg-white p-4">
          <div>
            <h3 className="font-bold">O sistema entendeu a planilha assim:</h3>
            <p className="text-sm text-concreto-500">Confira e ajuste se algo estiver trocado. Nada é gravado até você confirmar.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded bg-concreto-50 p-2"><div className="text-xs text-concreto-500">Grupos / etapas</div><b className="font-mono text-lg">{resultado.grupos}</b></div>
            <div className="rounded bg-concreto-50 p-2"><div className="text-xs text-concreto-500">Serviços</div><b className="font-mono text-lg">{resultado.servicos}</b></div>
            <div className="rounded bg-concreto-50 p-2"><div className="text-xs text-concreto-500">Valor total</div><b className="font-mono text-lg">{resultado.valorTotal ? formatarReais(resultado.valorTotal) : '—'}</b></div>
            <div className="rounded bg-concreto-50 p-2"><div className="text-xs text-concreto-500">Linhas ignoradas</div><b className="font-mono text-lg">{resultado.ignoradas}</b><div className="text-[10px] text-concreto-500">títulos, totais, vazias</div></div>
          </div>
          {resultado.avisos.length > 0 && (
            <ul className="space-y-1 text-sm">{resultado.avisos.map((a) => (
              <li key={a} className={`rounded px-2 py-1 ${a.startsWith('Total conferido') ? 'bg-ok-50 text-ok-700' : 'bg-atencao-50 text-atencao-700'}`}>{a.startsWith('Total conferido') ? '✓' : '⚠'} {a}</li>))}
            </ul>)}

          <details className="rounded-md border border-concreto-200" open={!resultado.servicos}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Colunas reconhecidas (ajustar)</summary>
            <div className="grid gap-2 border-t border-concreto-100 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {abas.length > 1 && (
                <label className="text-xs font-semibold text-concreto-600">Aba
                  <select value={abaSel} onChange={(e) => trocarAba(e.target.value)} className="entrada mt-1">{abas.map((a) => <option key={a.nome}>{a.nome}</option>)}</select>
                </label>)}
              <label className="text-xs font-semibold text-concreto-600">Linha do cabeçalho
                <input type="number" min={1} value={mapa.linhaCabecalho + 1} className="entrada mt-1"
                  onChange={(e) => setMapa({ ...mapa, linhaCabecalho: Math.max(0, Number(e.target.value) - 1) })} />
              </label>
              {COLUNAS.map((c) => (
                <label key={c} className="text-xs font-semibold text-concreto-600">{ROTULOS_COLUNA[c]}
                  <select value={resultado.mapa.colunas[c] ?? ''} onChange={(e) => trocarColuna(c, e.target.value)} className="entrada mt-1">
                    <option value="">— não existe —</option>
                    {Array.from({ length: nColunas }).map((_, i) => <option key={i} value={i}>{letra(i)}{cab[i] ? ` · ${String(cab[i]).slice(0, 30)}` : ''}</option>)}
                  </select>
                </label>))}
            </div>
          </details>

          <div className="max-h-[420px] overflow-auto rounded-md border border-concreto-200">
            <table className="tabela text-xs">
              <thead className="sticky top-0 bg-white"><tr><th>Lin.</th><th>Item</th><th>Descrição</th><th>Ref.</th><th>Und</th><th className="text-right">Qtd.</th><th className="text-right">P. unit.</th><th className="text-right">Total</th></tr></thead>
              <tbody>{resultado.itens.slice(0, 300).map((it, i) => (
                <tr key={i} className={it.tipo === 'grupo' ? 'bg-concreto-50 font-bold' : ''}>
                  <td className="text-concreto-400">{it.linha}</td>
                  <td className="whitespace-nowrap font-mono">{it.codigo}</td>
                  <td style={{ paddingLeft: `${(it.nivel - 1) * 14 + 12}px` }}>{it.tipo === 'grupo' ? '▸ ' : ''}{it.descricao}</td>
                  <td className="whitespace-nowrap text-concreto-500">{[it.fonte, it.codigo_referencia].filter(Boolean).join(' ')}</td>
                  <td>{it.unidade}</td>
                  <td className="text-right font-mono">{num(it.quantidade, 3)}</td>
                  <td className="text-right font-mono">{num(it.preco_unitario)}</td>
                  <td className="text-right font-mono">{num(it.valor_total)}</td>
                </tr>))}
              </tbody>
            </table>
            {resultado.itens.length > 300 && <p className="p-2 text-center text-xs text-concreto-500">… e mais {resultado.itens.length - 300} linhas</p>}
          </div>

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={criarEtapas} onChange={(e) => setCriarEtapas(e.target.checked)} className="h-4 w-4 accent-sinal-500" />
            Criar as etapas da obra a partir dos grupos principais da planilha</label>
          <button type="button" onClick={confirmar} disabled={estado !== 'livre' || !resultado.servicos}
            className="min-h-[48px] w-full rounded-md bg-sinal-500 px-4 font-semibold text-white hover:bg-sinal-600 disabled:opacity-50">
            {estado === 'enviando' ? 'Importando…' : `Confirmar importação (${resultado.servicos} serviços)`}
          </button>
        </div>
      )}
    </div>
  );
}
