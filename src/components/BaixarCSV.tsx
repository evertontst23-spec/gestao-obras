'use client';
/** Exporta uma tabela para CSV (abre no Excel em português: separador ";" e BOM UTF-8). */
export function BaixarCSV({ nome, cabecalho, linhas, rotulo = '⬇ Excel (CSV)' }: { nome: string; cabecalho: string[]; linhas: (string | number | null)[][]; rotulo?: string }) {
  function baixar() {
    const esc = (v: string | number | null) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'number' ? v.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 4 }) : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${nome}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }
  return <button type="button" onClick={baixar} className="nao-imprimir inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold text-concreto-800 hover:bg-concreto-50">{rotulo}</button>;
}
