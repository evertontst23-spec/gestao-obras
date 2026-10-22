'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type AssinaturaRef = { vazia: () => boolean; blob: () => Promise<Blob | null>; limpar: () => void };

/** Campo de assinatura com o dedo/caneta (gera PNG). */
export const Assinatura = forwardRef<AssinaturaRef, { rotulo?: string }>(function Assinatura({ rotulo = 'Assinatura do funcionário' }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ajustar = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr;
      const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1d1c1a';
    };
    ajustar();
  }, []);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const inicio = (e: React.PointerEvent) => { desenhando.current = true; canvas.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); const ctx = canvas.current!.getContext('2d')!; ctx.beginPath(); ctx.moveTo(x, y); };
  const mover = (e: React.PointerEvent) => { if (!desenhando.current) return; const [x, y] = pos(e); const ctx = canvas.current!.getContext('2d')!; ctx.lineTo(x, y); ctx.stroke(); setVazia(false); };
  const fim = () => { desenhando.current = false; };

  useImperativeHandle(ref, () => ({
    vazia: () => vazia,
    blob: () => new Promise((ok) => canvas.current!.toBlob((b) => ok(b), 'image/png')),
    limpar: () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVazia(true); },
  }), [vazia]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm font-semibold text-concreto-700">{rotulo}
        {!vazia && <button type="button" className="text-xs text-atraso-700" onClick={() => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVazia(true); }}>limpar</button>}</div>
      <canvas ref={canvas} onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerLeave={fim}
        className="h-36 w-full touch-none rounded-md border-2 border-dashed border-concreto-300 bg-white" />
      {vazia && <p className="mt-1 text-xs text-concreto-500">Assine com o dedo dentro do quadro.</p>}
    </div>
  );
});

/** Envia a assinatura para o Storage e devolve o caminho. */
export async function enviarAssinatura(blob: Blob, pasta: string) {
  const { criarClienteNavegador } = await import('@/lib/supabase/client');
  const caminho = `${pasta}/${crypto.randomUUID()}.png`;
  const up = await criarClienteNavegador().storage.from('anexos').upload(caminho, blob, { contentType: 'image/png' });
  if (up.error) throw up.error;
  return caminho;
}
