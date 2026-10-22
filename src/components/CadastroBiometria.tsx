'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CapturaRosto } from './CapturaRosto';
import { cadastrarBiometria } from '@/app/(app)/sst/acoes';

export function CadastroBiometria({ funcionario, nome }: { funcionario: string; nome: string }) {
  const router = useRouter();
  const termo = `Eu, ${nome}, autorizo a coleta e o tratamento da minha biometria facial, exclusivamente para registro de ponto e confirmação de recebimento de EPI, nos termos do art. 11 da LGPD. Sei que posso revogar este consentimento a qualquer momento junto ao RH.`;
  const [aceito, setAceito] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-concreto-50 p-3 text-xs leading-relaxed">{termo}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-0.5 h-5 w-5 accent-sinal-500" />
        O funcionário leu e concorda com o termo acima.</label>
      {aceito && <CapturaRosto rotulo="Capturar rosto do funcionário" onCaptura={async (d) => { const r = await cadastrarBiometria(funcionario, d, termo); setMsg(r); if (r?.ok) router.refresh(); }} />}
      {msg?.erro && <p className="text-sm text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="text-sm font-semibold text-ok-700">{msg.ok}</p>}
    </div>
  );
}
