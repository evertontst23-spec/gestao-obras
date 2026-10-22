'use client';
import { useEffect, useRef, useState } from 'react';
import { abrirCamera, carregarModelos, lerDescritor } from '@/lib/rostos';

/**
 * Captura um descritor facial médio (3 amostras boas) para cadastro ou confirmação.
 * onCaptura recebe o descritor (128 números).
 */
export function CapturaRosto({ onCaptura, rotulo = 'Capturar rosto' }: { onCaptura: (d: number[]) => void; rotulo?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const parar = useRef<(() => void) | null>(null);
  const [estado, setEstado] = useState<'parado' | 'carregando' | 'capturando' | 'ok' | 'erro'>('parado');
  const [msg, setMsg] = useState('');

  useEffect(() => () => parar.current?.(), []);

  async function iniciar() {
    setEstado('carregando'); setMsg('Carregando reconhecimento facial…');
    try {
      const fa = await carregarModelos();
      parar.current = await abrirCamera(video.current!);
      setEstado('capturando'); setMsg('Olhe para a câmera…');
      const amostras: number[][] = [];
      for (let t = 0; t < 40 && amostras.length < 3; t++) {
        const r = await lerDescritor(fa, video.current!);
        if (r && r.qualidade > 0.6) { amostras.push(r.descritor); setMsg(`Capturando… ${amostras.length}/3`); }
        await new Promise((ok) => setTimeout(ok, 250));
      }
      parar.current?.(); parar.current = null;
      if (amostras.length < 3) { setEstado('erro'); setMsg('Rosto não detectado com clareza. Melhore a iluminação e tente de novo.'); return; }
      const media = amostras[0].map((_, i) => amostras.reduce((s, a) => s + a[i], 0) / amostras.length);
      setEstado('ok'); setMsg('Rosto capturado ✓');
      onCaptura(media);
    } catch (e) {
      parar.current?.(); parar.current = null;
      setEstado('erro');
      setMsg((e as Error).name === 'NotAllowedError' ? 'Permita o uso da câmera no navegador.' : (e as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      <div className={`relative mx-auto aspect-[4/3] w-full max-w-xs overflow-hidden rounded-lg bg-concreto-900 ${estado === 'capturando' || estado === 'carregando' ? '' : 'hidden'}`}>
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <div className="pointer-events-none absolute inset-6 rounded-full border-4 border-sinal-400/70" />
      </div>
      {estado !== 'capturando' && estado !== 'carregando' && (
        <button type="button" onClick={iniciar} className="min-h-[48px] w-full rounded-md border-2 border-concreto-300 bg-white px-3 text-sm font-semibold hover:border-sinal-400">
          🙂 {estado === 'ok' ? 'Capturar novamente' : rotulo}
        </button>)}
      {msg && <p className={`text-center text-sm ${estado === 'erro' ? 'text-atraso-700' : estado === 'ok' ? 'font-semibold text-ok-700' : 'text-concreto-600'}`}>{msg}</p>}
    </div>
  );
}
