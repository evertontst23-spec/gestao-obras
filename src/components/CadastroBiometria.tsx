'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CapturaRosto } from './CapturaRosto';
import { cadastrarBiometria } from '@/app/(app)/sst/acoes';
import { salvarFotoFuncionario } from '@/app/(app)/cadastros/acoes';
import { criarClienteNavegador } from '@/lib/supabase/client';

/** Envia a foto do rosto para a pasta do funcionário (dossiê) e grava no cadastro */
export async function enviarFotoRosto(funcionario: string, foto: string) {
  const blob = await (await fetch(foto)).blob();
  const caminho = `rh/${funcionario}/rosto-${crypto.randomUUID()}.jpg`;
  const up = await criarClienteNavegador().storage.from('anexos').upload(caminho, blob, { contentType: 'image/jpeg' });
  if (up.error) return { erro: `Biometria salva, mas a foto não foi enviada: ${up.error.message}` };
  return salvarFotoFuncionario({ funcionario_id: funcionario, caminho });
}

export function CadastroBiometria({ funcionario, nome, aoConcluir }: { funcionario: string; nome: string; aoConcluir?: () => void }) {
  const router = useRouter();
  const termo = `Eu, ${nome}, autorizo a coleta e o tratamento da minha biometria facial, exclusivamente para registro de ponto e confirmação de recebimento de EPI, nos termos do art. 11 da LGPD. Sei que posso revogar este consentimento a qualquer momento junto ao RH.`;
  const [aceito, setAceito] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-concreto-50 p-3 text-xs leading-relaxed">{termo}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-0.5 h-5 w-5 accent-sinal-500" />
        O funcionário leu e concorda com o termo acima.</label>
      {aceito && <CapturaRosto rotulo="Capturar rosto do funcionário" onCaptura={async (d, foto) => {
        const r = await cadastrarBiometria(funcionario, d, termo);
        if (r?.ok && foto) { const rf = await enviarFotoRosto(funcionario, foto); if (rf?.erro) { setMsg(rf); router.refresh(); return; } }
        setMsg(r); if (r?.ok) { if (aoConcluir) aoConcluir(); else router.refresh(); }
      }} />}
      {msg?.erro && <p className="text-sm text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="text-sm font-semibold text-ok-700">{msg.ok}</p>}
    </div>
  );
}
