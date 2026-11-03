'use client';
import { useEffect, useRef, useState } from 'react';

type Item = { id: string; descricao: string; quantidade: number; unidade: string };
const num = (s: string) => { const t = s.trim(); if (!t) return null; const v = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(v) ? v : null; };
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Linhas de preço da proposta: preço unitário digitado + total do item (qtd × unitário) e total geral com frete. */
export function PrecosItens({ itens, iniciais = {}, faltando = {} }: { itens: Item[]; iniciais?: Record<string, string>; faltando?: Record<string, boolean> }) {
  const [precos, setPrecos] = useState<Record<string, string>>(iniciais);
  const [frete, setFrete] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const ler = () => { const f = form.querySelector<HTMLInputElement>('input[name="frete"]'); setFrete(num(f?.value ?? '') ?? 0); };
    ler(); form.addEventListener('input', ler); form.addEventListener('reset', () => setTimeout(() => { setPrecos({}); ler(); }, 0));
    return () => form.removeEventListener('input', ler);
  }, []);
  const total = (i: Item) => { const u = num(precos[i.id] ?? ''); return u == null ? null : Math.round(u * i.quantidade * 100) / 100; };
  const subtotal = itens.reduce((s, i) => s + (total(i) ?? 0), 0);
  return (
    <div ref={ref} className="space-y-1">
      <div className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-concreto-400 sm:flex">
        <span className="flex-1">Item</span><span className="w-32">Unitário (R$)</span><span className="w-28 text-right">Total do item</span></div>
      {itens.map((i) => {
        const t = total(i);
        return (
          <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-concreto-100 pb-1 sm:flex-nowrap sm:border-0 sm:pb-0">
            <input type="hidden" name="item_id" value={i.id} />
            <span className="w-full text-sm sm:w-auto sm:flex-1">{i.descricao} <span className="text-xs text-concreto-500">({String(i.quantidade).replace('.', ',')} {i.unidade})</span></span>
            <input name="preco" required inputMode="decimal" value={precos[i.id] ?? ''} onChange={(e) => setPrecos({ ...precos, [i.id]: e.target.value })}
              placeholder="R$ unit." className={`entrada w-32 ${faltando[i.id] && !precos[i.id] ? 'border-atencao-500 bg-atencao-50' : ''}`} />
            <span className="w-28 text-right font-mono text-sm font-semibold">{t == null ? '—' : reais(t)}</span>
          </div>);
      })}
      <div className="flex justify-end gap-4 pt-1 text-sm">
        <span>Itens: <b className="font-mono">{reais(subtotal)}</b></span>
        <span>Frete: <b className="font-mono">{reais(frete)}</b></span>
        <span>Total: <b className="font-mono text-base">{reais(subtotal + frete)}</b></span>
      </div>
    </div>
  );
}
