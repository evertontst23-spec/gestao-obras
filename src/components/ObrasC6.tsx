'use client';
import { useState } from 'react';

type Obra = { k: string; nome: string; valor: number; pix: number; sem: number };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Caixinhas das obras com o total somado na hora */
export function ObrasC6({ obras }: { obras: Obra[] }) {
  const [marcadas, setMarcadas] = useState<string[]>(obras.map((o) => o.k));
  const sel = obras.filter((o) => marcadas.includes(o.k));
  const total = sel.reduce((t, o) => t + o.valor, 0);
  const pix = sel.reduce((t, o) => t + o.pix, 0);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">Obras que entram nesta planilha <span className="font-normal text-concreto-500">(desmarque as que vão esperar)</span></p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{obras.map((o) => (
        <label key={o.k} className={`flex items-start gap-2 rounded-md border p-2 text-sm ${marcadas.includes(o.k) ? 'border-teal-600 bg-teal-50' : 'border-concreto-200'}`}>
          <input type="checkbox" name="obra" value={o.k} checked={marcadas.includes(o.k)} className="mt-1"
            onChange={(e) => setMarcadas((m) => e.target.checked ? [...m, o.k] : m.filter((x) => x !== o.k))} />
          <span><b>{o.nome}</b><span className="block text-xs text-concreto-500">{o.pix} Pix • {brl(o.valor)}{o.sem ? ` • ${o.sem} sem chave` : ''}</span></span>
        </label>))}</div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 rounded-md bg-teal-700 px-4 py-2 text-white">
        <span className="text-sm">Total das obras marcadas ({sel.length}):</span>
        <b className="font-mono text-xl">{brl(total)}</b>
        <span className="text-sm opacity-90">{pix} Pix na planilha</span>
      </div>
    </div>
  );
}
