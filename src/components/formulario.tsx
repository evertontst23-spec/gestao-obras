'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { EstadoAcao } from '@/lib/acoes';

type Acao = (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;

/** Formulário ligado a uma Server Action, com mensagem de erro/sucesso. */
export function FormAcao({ acao, children, className = '', limparAoConcluir = false }:
  { acao: Acao; children: ReactNode; className?: string; limparAoConcluir?: boolean }) {
  const [estado, despachar] = useActionState(acao, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (estado?.ok && limparAoConcluir) ref.current?.reset(); }, [estado, limparAoConcluir]);
  return (
    <form ref={ref} action={despachar} className={className}>
      {children}
      {estado?.erro && <p role="alert" className="mt-3 rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{estado.erro}</p>}
      {estado?.ok && <p className="mt-3 rounded-md bg-ok-50 px-3 py-2 text-sm font-medium text-ok-700">{estado.ok}</p>}
    </form>
  );
}

const VARIANTES = {
  primario: 'bg-sinal-500 text-white hover:bg-sinal-600',
  secundario: 'border border-concreto-300 bg-white text-concreto-800 hover:bg-concreto-50',
  perigo: 'bg-atraso-500 text-white hover:bg-atraso-700',
  sucesso: 'bg-ok-500 text-white hover:bg-ok-700',
  escuro: 'bg-concreto-800 text-white hover:bg-concreto-900',
};

export function Botao({ children, variante = 'primario', grande = false, className = '', ...resto }:
  { children: ReactNode; variante?: keyof typeof VARIANTES; grande?: boolean; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || resto.disabled}
      {...resto}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-wait disabled:opacity-60
        ${grande ? 'min-h-[52px] w-full px-4 text-base' : 'px-3 py-2 text-sm'} ${VARIANTES[variante]} ${className}`}
    >
      {pending ? 'Enviando…' : children}
    </button>
  );
}
