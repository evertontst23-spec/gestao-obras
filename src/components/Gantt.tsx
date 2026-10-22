import Link from 'next/link';
import { SITUACAO_PRAZO, codTarefa, type SituacaoPrazo } from '@/lib/dominio';
import { hojeISO } from '@/lib/formato';

/* eslint-disable @typescript-eslint/no-explicit-any */
const dia = (iso: string) => Math.floor(new Date(iso + 'T12:00:00Z').getTime() / 86400000);

/** Cronograma de Gantt simples: barra planejada + preenchimento do % executado */
export function Gantt({ tarefas }: { tarefas: any[] }) {
  if (!tarefas.length) return null;
  const hoje = dia(hojeISO());
  const ini = Math.min(...tarefas.map((t) => dia(t.inicio_previsto)), hoje);
  const fim = Math.max(...tarefas.map((t) => dia(t.fim_previsto)), hoje);
  const total = Math.max(1, fim - ini + 1);
  const pos = (d: number) => ((d - ini) / total) * 100;
  const marcas: { p: number; r: string }[] = [];
  const passo = total > 120 ? 30 : total > 45 ? 7 : total > 14 ? 3 : 1;
  for (let d = ini; d <= fim; d += passo) {
    const dt = new Date(d * 86400000);
    marcas.push({ p: pos(d), r: `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}` });
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="relative ml-56 h-5 border-b border-concreto-200 text-[10px] text-concreto-500">
          {marcas.map((m) => <span key={m.p} className="absolute -translate-x-1/2" style={{ left: `${m.p}%` }}>{m.r}</span>)}
        </div>
        {tarefas.map((t) => {
          const e = pos(dia(t.inicio_previsto));
          const w = Math.max(((dia(t.fim_previsto) - dia(t.inicio_previsto) + 1) / total) * 100, 1);
          const s = SITUACAO_PRAZO[t.situacao_prazo as SituacaoPrazo];
          const pct = t.status === 'aprovado' ? 100 : t.percentual;
          return (
            <div key={t.id} className="flex items-center border-b border-concreto-100 py-1.5">
              <Link href={`/tarefas/${t.id}`} className="w-56 shrink-0 truncate pr-2 text-xs hover:underline">
                <span className="font-mono text-concreto-500">{codTarefa(t.numero)}</span> {t.titulo}
              </Link>
              <div className="relative h-5 flex-1">
                <div className="absolute inset-y-0 w-px bg-sinal-500" style={{ left: `${pos(hoje)}%` }} title="Hoje" />
                <div className="absolute top-0.5 h-4 overflow-hidden rounded bg-concreto-200" style={{ left: `${e}%`, width: `${w}%` }}
                     title={`${t.inicio_previsto} → ${t.fim_previsto} • ${pct}%`}>
                  <div className={`h-full ${s?.barra ?? 'bg-concreto-400'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-concreto-500">
          {Object.entries(SITUACAO_PRAZO).map(([k, v]) => <span key={k} className="flex items-center gap-1"><i className={`inline-block h-2 w-3 rounded ${v.barra}`} />{v.rotulo}</span>)}
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-px bg-sinal-500" />Hoje</span>
        </div>
      </div>
    </div>
  );
}
