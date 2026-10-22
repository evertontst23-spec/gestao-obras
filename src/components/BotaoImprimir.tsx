'use client';
export function BotaoImprimir({ rotulo = '🖨 Imprimir' }: { rotulo?: string }) {
  return <button type="button" onClick={() => window.print()} className="nao-imprimir inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold text-concreto-800 hover:bg-concreto-50">{rotulo}</button>;
}
