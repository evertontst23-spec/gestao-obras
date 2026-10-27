'use client';
import { textoFalha } from '@/lib/falha';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { abrirCamera, carregarModelos, lerDescritor } from '@/lib/rostos';
import { pontoFacial, type RespostaPonto } from '@/app/(app)/sst/acoes';

export function PontoFacial({ obras }: { obras: { id: string; codigo: string; nome: string }[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const parar = useRef<(() => void) | null>(null);
  const ativo = useRef(false);
  const router = useRouter();
  const [obra, setObra] = useState(obras.length === 1 ? obras[0].id : '');
  const [estado, setEstado] = useState<'parado' | 'carregando' | 'lendo' | 'erro'>('parado');
  const [msg, setMsg] = useState('');
  const [res, setRes] = useState<RespostaPonto | null>(null);
  const [relogio, setRelogio] = useState('');
  const gps = useRef<{ lat: number | null; lng: number | null; prec: number | null }>({ lat: null, lng: null, prec: null });

  useEffect(() => {
    const t = setInterval(() => setRelogio(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Recife' })), 1000);
    return () => { clearInterval(t); ativo.current = false; parar.current?.(); };
  }, []);

  async function iniciar() {
    setEstado('carregando'); setMsg('Carregando reconhecimento facial…'); setRes(null);
    navigator.geolocation?.getCurrentPosition((p) => { gps.current = { lat: p.coords.latitude, lng: p.coords.longitude, prec: p.coords.accuracy }; }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
    try {
      const fa = await carregarModelos();
      parar.current = await abrirCamera(video.current!);
      ativo.current = true; setEstado('lendo'); setMsg('Posicione o rosto no círculo');
      while (ativo.current) {
        const r = await lerDescritor(fa, video.current!);
        if (r && r.qualidade > 0.6) {
          setMsg('Verificando…');
          const resp = await pontoFacial(r.descritor, obra || null, gps.current.lat, gps.current.lng, gps.current.prec);
          setRes(resp);
          if (resp.reconhecido) { if ('vibrate' in navigator) navigator.vibrate?.(200); router.refresh(); await new Promise((ok) => setTimeout(ok, 3500)); setRes(null); }
          else await new Promise((ok) => setTimeout(ok, 1200));
          setMsg('Posicione o rosto no círculo');
        } else await new Promise((ok) => setTimeout(ok, 350));
      }
    } catch (e) {
      setEstado('erro'); parar.current?.();
      setMsg((e as Error).name === 'NotAllowedError' ? 'Permita o uso da câmera no navegador.' : textoFalha(e));
    }
  }
  function encerrar() { ativo.current = false; parar.current?.(); parar.current = null; setEstado('parado'); setMsg(''); setRes(null); }

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-concreto-900 p-5 text-white shadow-xl">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-sinal-400">Registro de ponto</div>
        <div className="font-mono text-4xl font-bold tabular-nums">{relogio || '--:--:--'}</div>
        <div className="text-xs capitalize text-concreto-400">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Recife' })}</div>
      </div>
      <select value={obra} onChange={(e) => setObra(e.target.value)} disabled={estado === 'lendo'} className="mt-4 w-full rounded-md border-0 bg-concreto-800 px-3 py-2 text-sm text-white">
        <option value="">Obra do cadastro de cada funcionário</option>
        {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
      </select>
      <div className={`relative mx-auto mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl bg-black ${estado === 'parado' ? 'hidden' : ''}`}>
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <div className={`pointer-events-none absolute inset-8 rounded-full border-4 transition ${res?.reconhecido ? 'border-ok-500' : res ? 'border-atraso-500' : 'border-sinal-400/70'}`} />
        {res?.reconhecido && (
          <div className="absolute inset-x-0 bottom-0 bg-ok-700/95 p-4 text-center">
            <div className="text-2xl font-black">{res.duplicado ? 'Já registrado' : res.tipo === 'entrada' ? '✓ ENTRADA' : '✓ SAÍDA'}</div>
            <div className="text-lg font-semibold">{res.nome}</div>
            <div className="font-mono text-sm">{res.hora}{res.confianca ? ` • ${res.confianca}%` : ''}</div>
          </div>)}
        {res && !res.reconhecido && <div className="absolute inset-x-0 bottom-0 bg-atraso-700/95 p-3 text-center text-sm font-semibold">{res.erro ?? `Não reconhecido (${res.confianca ?? 0}%) — procure o RH para cadastrar a biometria`}</div>}
      </div>
      {msg && <p className={`mt-3 text-center text-sm ${estado === 'erro' ? 'text-atraso-500' : 'text-concreto-300'}`}>{msg}</p>}
      {estado === 'lendo'
        ? <button type="button" onClick={encerrar} className="mt-4 min-h-[48px] w-full rounded-md bg-concreto-700 font-semibold">Encerrar</button>
        : <button type="button" onClick={iniciar} disabled={estado === 'carregando'} className="mt-4 min-h-[56px] w-full rounded-md bg-sinal-500 text-lg font-bold disabled:opacity-60">📷 Iniciar câmera</button>}
      <p className="mt-3 text-center text-[11px] text-concreto-500">A foto não é guardada. Só uma assinatura numérica do rosto é comparada (LGPD).</p>
    </div>
  );
}
