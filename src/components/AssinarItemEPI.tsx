'use client';
import { textoFalha } from '@/lib/falha';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Assinatura, enviarAssinatura, type AssinaturaRef } from './Assinatura';
import { CapturaRosto } from './CapturaRosto';
import { CadastroBiometria } from './CadastroBiometria';
import { assinarItemEPI } from '@/app/(app)/sst/acoes';

/** Botão "Assinar" de uma linha da ficha de EPI: o funcionário confirma aquele EPI pela assinatura ou pelo rosto. */
export function AssinarItemEPI({ pendente, insumo, epi, funcionario, nome, temRosto, podeCadastrarRosto }:
  { pendente: string; insumo: string; epi: string; funcionario: string; nome: string; temRosto: boolean; podeCadastrarRosto: boolean }) {
  const router = useRouter();
  const ass = useRef<AssinaturaRef>(null);
  const [aberto, setAberto] = useState(false);
  const [rosto, setRosto] = useState(temRosto);
  const [conf, setConf] = useState<'facial' | 'assinatura'>(temRosto ? 'facial' : 'assinatura');
  const [descritor, setDescritor] = useState<number[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setErro(null);
    if (conf === 'assinatura' && ass.current?.vazia()) return setErro('Colete a assinatura do funcionário.');
    if (conf === 'facial' && !descritor) return setErro('Capture o rosto do funcionário.');
    setEnviando(true);
    try {
      const caminho = conf === 'assinatura' ? await enviarAssinatura((await ass.current!.blob())!, `sst/epi/${funcionario}`) : null;
      const r = await assinarItemEPI({ pendente, insumo, confirmacao: conf, assinatura: caminho, descritor });
      if (r?.erro) setErro(r.erro); else { setAberto(false); router.refresh(); }
    } catch (e) { setErro(textoFalha(e)); } finally { setEnviando(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="nao-imprimir rounded bg-sinal-500 px-3 py-1.5 text-xs font-semibold text-white">✍ Assinar</button>
      <span className="hidden text-[10px] print:inline">aguardando assinatura</span>
      {aberto && (
        <div className="nao-imprimir fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => !enviando && setAberto(false)}>
          <div className="max-h-[95vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="text-xs uppercase tracking-wide text-concreto-500">Recebimento de EPI — {nome}</div>
              <div className="text-lg font-bold">{epi}</div>
              <p className="mt-1 text-xs text-concreto-600">Declaro ter recebido este EPI gratuitamente, em perfeito estado, e ter sido orientado sobre uso, guarda e conservação (NR-06).</p>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-concreto-100 p-1 text-sm font-semibold">
              <button type="button" onClick={() => setConf('facial')} disabled={!rosto && !podeCadastrarRosto}
                className={`min-h-[40px] rounded disabled:opacity-40 ${conf === 'facial' ? 'bg-white shadow' : 'text-concreto-600'}`}>🙂 Rosto</button>
              <button type="button" onClick={() => setConf('assinatura')} className={`min-h-[40px] rounded ${conf === 'assinatura' ? 'bg-white shadow' : 'text-concreto-600'}`}>✍ Assinatura</button>
            </div>
            {conf === 'assinatura' ? <Assinatura ref={ass} />
              : rosto ? <><CapturaRosto onCaptura={(d) => setDescritor(d)} rotulo={`Confirmar pelo rosto de ${nome}`} />
                  {descritor && <p className="text-sm font-semibold text-ok-700">✓ Rosto capturado.</p>}</>
              : <CadastroBiometria funcionario={funcionario} nome={nome} aoConcluir={() => setRosto(true)} />}
            {erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setAberto(false)} disabled={enviando} className="min-h-[48px] flex-1 rounded-md border border-concreto-300 font-semibold">Cancelar</button>
              <button type="button" onClick={confirmar} disabled={enviando} className="min-h-[48px] flex-[2] rounded-md bg-sinal-500 font-semibold text-white disabled:opacity-60">{enviando ? 'Confirmando…' : 'Confirmar recebimento'}</button>
            </div>
          </div>
        </div>)}
    </>
  );
}
