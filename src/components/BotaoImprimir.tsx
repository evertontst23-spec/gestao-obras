'use client';
import { Printer } from 'lucide-react';
export function BotaoImprimir({ rotulo = 'Imprimir' }: { rotulo?: string }) {
  return <button type="button" onClick={() => window.print()} className="nao-imprimir inline-flex items-center gap-1.5 rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold text-concreto-800 hover:bg-concreto-50"><Printer aria-hidden className="h-4 w-4" strokeWidth={1.75} />{rotulo.replace(/^🖨\uFE0F?\s*/, '')}</button>;
}
