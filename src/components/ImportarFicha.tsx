'use client';
import { useState } from 'react';
import { importarDocumentosFicha } from '@/app/(app)/cadastros/acoes';

/** Envia os documentos em lotes pequenos (cada lote baixa e guarda até 6 arquivos) */
export function ImportarFicha() {
  const [texto, setTexto] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [rodando, setRodando] = useState(false);
  async function enviar() {
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) return;
    setRodando(true); setLog([]);
    let ok = 0;
    for (let i = 0; i < linhas.length; i += 4) {
      const r: { ok?: string; erro?: string } | null = await importarDocumentosFicha(linhas.slice(i, i + 4)).catch((e) => ({ erro: (e as Error).message }));
      const m = r?.ok ?? r?.erro ?? '';
      const n = Number(/^(\d+)/.exec(m)?.[1] ?? 0); ok += n;
      setLog((l) => [...l, `Lote ${i / 4 + 1}: ${m}`]);
    }
    setLog((l) => [...l, `Concluído: ${ok} de ${linhas.length} documento(s) guardado(s).`]);
    setRodando(false);
  }
  return (
    <div className="space-y-3">
      <label htmlFor="linhas" className="text-sm text-concreto-600">Uma linha por arquivo: <b>matrícula ; tipo ; link temporário</b> (tipos: Foto, RG (frente), RG (verso), CPF, CTPS, Comprovante de residência)</label>
      <textarea id="linhas" name="linhas" rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} className="entrada font-mono text-xs" placeholder="1023 ; CPF ; https://…/fichas-admissao/…" />
      <button type="button" onClick={enviar} disabled={rodando} className="rounded-md bg-sinal-500 px-4 py-2 font-semibold text-white disabled:opacity-60">{rodando ? 'Guardando…' : 'Guardar nas pastas'}</button>
      {log.length > 0 && <ul id="resultado" className="space-y-1 rounded-md bg-concreto-50 p-3 text-sm">{log.map((l, k) => <li key={k}>{l}</li>)}</ul>}
    </div>
  );
}
