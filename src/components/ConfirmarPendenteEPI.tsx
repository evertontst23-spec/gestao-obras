'use client';
import { textoFalha } from '@/lib/falha';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Assinatura, enviarAssinatura, type AssinaturaRef } from './Assinatura';
import { CapturaRosto } from './CapturaRosto';
import { CadastroBiometria } from './CadastroBiometria';
import { confirmarPendenteEPI } from '@/app/(app)/sst/acoes';

/** O funcionário confirma o recebimento de uma entrega de EPI registrada como pendente. */
export function ConfirmarPendenteEPI({ pendente, funcionario, nome, temRosto, podeCadastrarRosto }:
  { pendente: string; funcionario: string; nome: string; temRosto: boolean; podeCadastrarRosto: boolean }) {
  const router = useRouter();
  const ass = useRef<AssinaturaRef>(null);
  const [rosto, setRosto] = useState(temRosto);
  const [conf, setConf] = useState<'facial' | 'assinatura'>(temRosto || podeCadastrarRosto ? 'facial' : 'assinatura');
  const [descritor, setDescritor] = useState<number[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);

  async function confirmar() {
    setMsg(null);
    if (conf === 'assinatura' && ass.current?.vazia()) return setMsg({ erro: 'Colete a assinatura do funcionário.' });
    if (conf === 'facial' && !descritor) return setMsg({ erro: 'Capture o rosto do funcionário.' });
    setEnviando(true);
    try {
      const caminho = conf === 'assinatura' ? await enviarAssinatura((await ass.current!.blob())!, `sst/epi/${funcionario}`) : null;
      const r = await confirmarPendenteEPI({ pendente, funcionario, confirmacao: conf, assinatura: caminho, descritor });
      setMsg(r); if (r?.ok) router.refresh();
    } catch (e) { setMsg({ erro: textoFalha(e) }); } finally { setEnviando(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-concreto-100 p-1 text-sm font-semibold">
        <button type="button" onClick={() => setConf('facial')} disabled={!rosto && !podeCadastrarRosto}
          className={`min-h-[40px] rounded disabled:opacity-40 ${conf === 'facial' ? 'bg-white shadow' : 'text-concreto-600'}`}>🙂 Reconhecimento facial</button>
        <button type="button" onClick={() => setConf('assinatura')} className={`min-h-[40px] rounded ${conf === 'assinatura' ? 'bg-white shadow' : 'text-concreto-600'}`}>✍ Assinatura</button>
      </div>
      {conf === 'assinatura' ? <Assinatura ref={ass} />
        : rosto ? <><CapturaRosto key={String(rosto)} onCaptura={(d) => setDescritor(d)} rotulo={`Confirmar pelo rosto de ${nome}`} />
            {descritor && <p className="text-sm font-semibold text-ok-700">✓ Rosto capturado — clique em Confirmar recebimento.</p>}</>
        : <div className="space-y-2"><p className="rounded bg-atencao-50 px-3 py-2 text-sm font-semibold text-atencao-800">{nome} ainda não tem o rosto cadastrado. Cadastre agora (uma vez só) e depois confirme.</p>
            <CadastroBiometria funcionario={funcionario} nome={nome} aoConcluir={() => setRosto(true)} /></div>}
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-ok-50 px-3 py-2 text-sm font-medium text-ok-700">{msg.ok}</p>}
      <button type="button" onClick={confirmar} disabled={enviando} className="min-h-[48px] w-full rounded-md bg-sinal-500 font-semibold text-white disabled:opacity-60">{enviando ? 'Confirmando…' : 'Confirmar recebimento'}</button>
    </div>
  );
}
