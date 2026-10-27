'use client';
import { textoFalha } from '@/lib/falha';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Assinatura, enviarAssinatura, type AssinaturaRef } from './Assinatura';
import { cienciaOS } from '@/app/(app)/sst/acoes';

export function CienciaOS({ os }: { os: string }) {
  const ref = useRef<AssinaturaRef>(null);
  const router = useRouter();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [env, setEnv] = useState(false);
  return (
    <div className="nao-imprimir space-y-3">
      <Assinatura ref={ref} rotulo="Assinatura de ciência do funcionário" />
      <button type="button" disabled={env} onClick={async () => {
        if (ref.current?.vazia()) return setMsg({ erro: 'Colete a assinatura.' });
        setEnv(true);
        try { const c = await enviarAssinatura((await ref.current!.blob())!, `sst/os/${os}`); const r = await cienciaOS(os, c); setMsg(r); if (r?.ok) router.refresh(); }
        catch (e) { setMsg({ erro: textoFalha(e) }); } finally { setEnv(false); }
      }} className="min-h-[48px] w-full rounded-md bg-ok-500 font-semibold text-white disabled:opacity-60">{env ? 'Registrando…' : 'Registrar ciência'}</button>
      {msg?.erro && <p className="text-sm text-atraso-700">{msg.erro}</p>}
    </div>
  );
}
