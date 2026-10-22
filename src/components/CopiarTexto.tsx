'use client';
import { useState } from 'react';
export function CopiarTexto({ texto, rotulo = 'Copiar link' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sem permissão */ } }}
      className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold text-concreto-800 hover:bg-concreto-50">{ok ? '✓ Copiado' : rotulo}</button>
  );
}
