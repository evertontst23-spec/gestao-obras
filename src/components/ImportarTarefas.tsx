'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importarTarefas, type LinhaImport } from '@/app/(app)/tarefas/acoes';
import { ROTULOS_TAREFA, detectarCabecalhoTarefas, lerData, lerNumero, lerPrioridade, normalizar, type CampoTarefa, type MapaTarefas } from '@/lib/tarefasPlanilha';
import type { Aba } from '@/lib/lerArquivo';

type Op = { id: string; nome: string };
const CAMPOS = Object.keys(ROTULOS_TAREFA) as CampoTarefa[];
const letra = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const MODELO = 'Serviço;Local;Quantidade;Unidade;Início;Fim;Responsável;Etapa;Prioridade;Observações\n'
  + 'Alvenaria de vedação bloco A;Térreo;120;m²;03/11/2026;14/11/2026;;Estrutura;Normal;\n'
  + 'Reboco interno;Pavimento 1;80;m²;10/11/2026;21/11/2026;;Acabamento;Alta;Usar argamassa industrializada\n';

/** Importa uma planilha (Excel ou CSV) de tarefas para uma obra: reconhece as colunas, mostra a prévia e cria tudo de uma vez. */
export function ImportarTarefas({ obra, encarregados, etapas, hoje, padrao = '' }: { obra: string; encarregados: Op[]; etapas: Op[]; hoje: string; padrao?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [nomeArq, setNomeArq] = useState('');
  const [abas, setAbas] = useState<Aba[]>([]);
  const [abaSel, setAbaSel] = useState('');
  const [mapa, setMapa] = useState<MapaTarefas | null>(null);
  const [respPadrao, setRespPadrao] = useState(padrao || (encarregados.length === 1 ? encarregados[0].id : ''));
  const [iniPadrao, setIniPadrao] = useState(hoje);
  const [diasPadrao, setDiasPadrao] = useState('7');
  const [estado, setEstado] = useState<'livre' | 'lendo' | 'enviando'>('livre');
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const aba = abas.find((a) => a.nome === abaSel);
  const ano = Number(hoje.slice(0, 4));

  const linhas = useMemo(() => {
    if (!aba || !mapa) return [];
    const c = mapa.colunas;
    const pega = (l: (string | number | boolean | Date | null)[], k: CampoTarefa) => (c[k] === undefined ? null : l?.[c[k]!] ?? null);
    const txt = (v: unknown) => { const s = v === null || v === undefined ? '' : v instanceof Date ? '' : String(v).trim(); return s || null; };
    const out: (LinhaImport & { n: number; resp: string; avisos: string[] })[] = [];
    for (let i = mapa.linha + 1; i < aba.valores.length; i++) {
      const lv = aba.valores[i] ?? [], lt = aba.textos[i] ?? [];
      const titulo = txt(pega(lt, 'titulo'));
      if (!titulo || titulo.length < 3 || /^total/i.test(titulo)) continue;
      const avisos: string[] = [];
      let ini = lerData(pega(lv, 'inicio'), ano) ?? lerData(pega(lt, 'inicio'), ano);
      let fim = lerData(pega(lv, 'fim'), ano) ?? lerData(pega(lt, 'fim'), ano);
      if (!ini) { ini = iniPadrao; if (c.inicio !== undefined && txt(pega(lt, 'inicio'))) avisos.push('início não entendido'); }
      if (!fim) { const d = new Date(`${ini}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.max(0, Number(diasPadrao || 0))); fim = d.toISOString().slice(0, 10); }
      if (fim < ini) avisos.push('fim antes do início');
      const respTxt = normalizar(pega(lt, 'responsavel'));
      const resp = respTxt ? encarregados.find((e) => normalizar(e.nome).includes(respTxt) || respTxt.includes(normalizar(e.nome).split(' ')[0])) : undefined;
      if (respTxt && !resp) avisos.push(`responsável “${txt(pega(lt, 'responsavel'))}” não encontrado`);
      const etTxt = normalizar(pega(lt, 'etapa'));
      const et = etTxt ? etapas.find((e) => normalizar(e.nome) === etTxt) ?? etapas.find((e) => normalizar(e.nome).includes(etTxt)) : undefined;
      if (etTxt && !et) avisos.push(`etapa “${txt(pega(lt, 'etapa'))}” não existe na obra`);
      const encarregado_id = resp?.id ?? respPadrao;
      out.push({
        n: i + 1, titulo, descricao: txt(pega(lt, 'descricao')), local: txt(pega(lt, 'local')),
        quantidade_prevista: lerNumero(pega(lv, 'quantidade')), unidade: txt(pega(lt, 'unidade')),
        inicio_previsto: ini, fim_previsto: fim, encarregado_id, etapa_id: et?.id ?? null,
        prioridade: lerPrioridade(pega(lt, 'prioridade')) ?? 'normal', observacoes: txt(pega(lt, 'observacoes')),
        resp: encarregados.find((e) => e.id === encarregado_id)?.nome ?? '', avisos,
      });
    }
    return out;
  }, [aba, mapa, ano, iniPadrao, diasPadrao, encarregados, etapas, respPadrao]);
  const bloqueadas = linhas.filter((l) => !l.encarregado_id || l.fim_previsto < l.inicio_previsto);

  async function abrir(f: File | undefined) {
    if (!f) return;
    setMsg(null); setEstado('lendo'); setNomeArq(f.name);
    try {
      const { lerPlanilha } = await import('@/lib/lerArquivo');
      const lidas = lerPlanilha(await f.arrayBuffer(), f.name);
      setAbas(lidas);
      const achada = lidas.map((a) => ({ a, m: detectarCabecalhoTarefas(a.valores) })).find((x) => x.m);
      if (achada) { setAbaSel(achada.a.nome); setMapa(achada.m); }
      else { setAbaSel(lidas[0]?.nome ?? ''); setMapa({ linha: 0, colunas: { titulo: 0 } }); setMsg({ erro: 'Não reconheci o cabeçalho. Indique abaixo a linha do cabeçalho e as colunas.' }); }
    } catch (e) { setMsg({ erro: 'Não foi possível ler o arquivo: ' + (e as Error).message }); }
    finally { setEstado('livre'); }
  }
  function trocarAba(nome: string) {
    setAbaSel(nome);
    const a = abas.find((x) => x.nome === nome);
    setMapa(a ? detectarCabecalhoTarefas(a.valores) ?? { linha: 0, colunas: { titulo: 0 } } : null);
  }
  async function enviar() {
    if (!linhas.length || bloqueadas.length) return;
    setEstado('enviando'); setMsg(null);
    const r = await importarTarefas(obra, linhas.map(({ n, resp, avisos, ...l }) => { void n; void resp; void avisos; return l; }));
    setEstado('livre'); setMsg(r);
    if (r?.ok) { setAbas([]); setMapa(null); setNomeArq(''); if (ref.current) ref.current.value = ''; router.refresh(); }
  }
  function baixarModelo() {
    const url = URL.createObjectURL(new Blob(['﻿' + MODELO], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-tarefas.csv'; a.click(); URL.revokeObjectURL(url);
  }
  const nCol = aba ? Math.max(1, ...aba.valores.slice(0, 40).map((l) => l?.length ?? 0)) : 0;
  const cab = aba && mapa ? aba.textos[mapa.linha] ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-concreto-300 bg-concreto-50 px-3 text-sm font-semibold text-concreto-700 hover:border-sinal-400">
          <input ref={ref} type="file" accept=".xlsx,.xls,.ods,.csv,.txt" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
          {estado === 'lendo' ? 'Lendo…' : nomeArq ? `📎 ${nomeArq} (trocar)` : '📂 Escolher planilha (Excel ou CSV)'}
        </label>
        <button type="button" onClick={baixarModelo} className="min-h-[48px] rounded-md border border-concreto-300 bg-white px-3 text-sm font-semibold hover:border-sinal-400">⬇ Baixar modelo</button>
      </div>

      {aba && mapa && (
        <>
          <div className="grid gap-3 rounded-lg border border-concreto-200 bg-white p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {abas.length > 1 && <label className="text-xs text-concreto-600">Aba<select value={abaSel} onChange={(e) => trocarAba(e.target.value)} className="entrada block">{abas.map((a) => <option key={a.nome}>{a.nome}</option>)}</select></label>}
            <label className="text-xs text-concreto-600">Linha do cabeçalho<input type="number" min={1} value={mapa.linha + 1} onChange={(e) => setMapa({ ...mapa, linha: Math.max(0, Number(e.target.value) - 1) })} className="entrada block" /></label>
            <label className="text-xs text-concreto-600">Responsável (da obra) *<select value={respPadrao} onChange={(e) => setRespPadrao(e.target.value)} className="entrada block"><option value="">Escolha…</option>{encarregados.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
            <label className="text-xs text-concreto-600">Início quando vazio<input type="date" value={iniPadrao} onChange={(e) => setIniPadrao(e.target.value)} className="entrada block" /></label>
            <label className="text-xs text-concreto-600">Prazo quando sem fim (dias)<input type="number" min={0} value={diasPadrao} onChange={(e) => setDiasPadrao(e.target.value)} className="entrada block" /></label>
          </div>
          <details className="rounded-lg border border-concreto-200 bg-white p-3 text-sm" open={!mapa.colunas.titulo && mapa.colunas.titulo !== 0}>
            <summary className="cursor-pointer font-semibold">Colunas reconhecidas ({Object.keys(mapa.colunas).length}) — ajustar</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((c) => (
                <label key={c} className="text-xs text-concreto-600">{ROTULOS_TAREFA[c]}
                  <select value={mapa.colunas[c] ?? ''} onChange={(e) => { const cols = { ...mapa.colunas }; if (e.target.value === '') delete cols[c]; else cols[c] = Number(e.target.value); setMapa({ ...mapa, colunas: cols }); }} className="entrada block">
                    <option value="">— não usar —</option>
                    {Array.from({ length: nCol }, (_, i) => <option key={i} value={i}>{letra(i)}{cab[i] ? ` — ${String(cab[i]).slice(0, 30)}` : ''}</option>)}
                  </select></label>))}
            </div>
          </details>
          {!encarregados.length && <p className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">Não há usuário que possa ser responsável (encarregado, engenheiro ou diretoria).</p>}
          <div className="rounded-lg border border-concreto-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-concreto-100 px-3 py-2 text-sm">
              <b>{linhas.length} tarefa(s) encontrada(s)</b>
              {bloqueadas.length > 0 && <span className="text-atraso-700">{bloqueadas.length} sem responsável ou com prazo inválido</span>}
            </div>
            <div className="max-h-[460px] overflow-auto"><table className="tabela text-xs">
              <thead className="sticky top-0 bg-white"><tr><th>Linha</th><th>Serviço</th><th>Local</th><th className="text-right">Qtd.</th><th>Início</th><th>Fim</th><th>Responsável</th><th>Etapa</th><th>Prior.</th></tr></thead>
              <tbody>{linhas.slice(0, 300).map((l) => (
                <tr key={l.n} className={!l.encarregado_id || l.fim_previsto < l.inicio_previsto ? 'bg-atraso-50' : ''}>
                  <td className="text-concreto-500">{l.n}</td>
                  <td className="min-w-[200px]"><b>{l.titulo}</b>{l.descricao && <div className="text-concreto-500">{l.descricao}</div>}{l.avisos.length > 0 && <div className="text-atencao-700">⚠ {l.avisos.join('; ')}</div>}</td>
                  <td>{l.local ?? '—'}</td><td className="whitespace-nowrap text-right">{l.quantidade_prevista?.toLocaleString('pt-BR') ?? '—'} {l.unidade ?? ''}</td>
                  <td className="whitespace-nowrap">{br(l.inicio_previsto)}</td><td className="whitespace-nowrap">{br(l.fim_previsto)}</td>
                  <td className="whitespace-nowrap">{l.resp || <span className="text-atraso-700">falta</span>}</td>
                  <td>{etapas.find((e) => e.id === l.etapa_id)?.nome ?? '—'}</td><td>{l.prioridade}</td>
                </tr>))}</tbody>
            </table></div>
          </div>
          <button type="button" onClick={enviar} disabled={!linhas.length || bloqueadas.length > 0 || estado !== 'livre'}
            className="min-h-[48px] w-full rounded-md bg-sinal-500 px-4 font-bold text-white disabled:opacity-50">
            {estado === 'enviando' ? 'Importando…' : `Importar ${linhas.length} tarefa(s) para a obra`}
          </button>
        </>)}
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-ok-50 px-3 py-2 text-sm font-semibold text-ok-700">{msg.ok}</p>}
    </div>
  );
}
