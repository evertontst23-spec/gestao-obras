import Link from 'next/link';
import type { ReactNode } from 'react';
import { PRIORIDADES, SITUACAO_PRAZO, STATUS_MATERIAL, STATUS_SOLICITACAO, STATUS_TAREFA,
  type Prioridade, type SituacaoPrazo, type StatusMaterial, type StatusTarefa } from '@/lib/dominio';

export function Selo({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>{children}</span>;
}
export const SeloStatus = ({ s }: { s: StatusTarefa }) => <Selo cor={STATUS_TAREFA[s]?.cor}>{STATUS_TAREFA[s]?.rotulo ?? s}</Selo>;
export const SeloMaterial = ({ s }: { s: StatusMaterial }) => <Selo cor={STATUS_MATERIAL[s]?.cor}>{STATUS_MATERIAL[s]?.rotulo ?? s}</Selo>;
export const SeloSolicitacao = ({ s }: { s: string }) => <Selo cor={STATUS_SOLICITACAO[s]?.cor}>{STATUS_SOLICITACAO[s]?.rotulo ?? s}</Selo>;
export const SeloPrioridade = ({ p }: { p: Prioridade }) => <Selo cor={PRIORIDADES[p]?.cor}>{PRIORIDADES[p]?.rotulo ?? p}</Selo>;
export const SeloPrazo = ({ s }: { s: SituacaoPrazo }) => <Selo cor={SITUACAO_PRAZO[s]?.cor}>{SITUACAO_PRAZO[s]?.rotulo ?? s}</Selo>;

export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-concreto-900 sm:text-[28px]">{titulo}</h1>
        {sub && <div className="mt-1 text-sm text-concreto-500">{sub}</div>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Cartao({ titulo, acoes, children, className = '' }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border border-concreto-200/80 bg-superficie shadow-cartao ${className}`}>
      {titulo && (
        <header className="flex items-center justify-between gap-2 border-b border-concreto-100 px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-concreto-900">{titulo}</h2>
          {acoes}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Indicador({ rotulo, valor, tom = 'neutro', href, detalhe }:
  { rotulo: string; valor: ReactNode; tom?: 'neutro' | 'ok' | 'atencao' | 'atraso' | 'sinal'; href?: string; detalhe?: string }) {
  const ponto = { neutro: 'bg-concreto-300', ok: 'bg-ok-500', atencao: 'bg-atencao-500', atraso: 'bg-atraso-500', sinal: 'bg-sinal-500' };
  const corpo = (
    <div className={`h-full rounded-lg border border-concreto-200/80 bg-superficie px-5 py-4 shadow-cartao ${href ? 'transition hover:border-sinal-300 hover:shadow-md' : ''}`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-concreto-500"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${ponto[tom]}`} />{rotulo}</div>
      <div className={`mt-2 break-words font-extrabold tracking-tight text-concreto-900 tabular-nums ${typeof valor === 'string' && valor.length > 12 ? 'whitespace-nowrap text-lg sm:text-xl xl:text-2xl' : typeof valor === 'string' && valor.length > 10 ? 'whitespace-nowrap text-xl sm:text-2xl' : 'text-[26px] leading-tight'}`}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-concreto-500">{detalhe}</div>}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

export function Progresso({ valor, cor = 'bg-sinal-500' }: { valor: number; cor?: string }) {
  const v = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-concreto-100">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-xs text-concreto-600">{Math.round(v)}%</span>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-concreto-300 p-6 text-center text-sm text-concreto-500">{children}</div>;
}

export function LinkBotao({ href, children, variante = 'primario' }: { href: string; children: ReactNode; variante?: 'primario' | 'secundario' }) {
  const v = variante === 'primario'
    ? 'bg-sinal-500 text-white hover:bg-sinal-600'
    : 'border border-concreto-300 bg-superficie text-concreto-800 hover:bg-concreto-50';
  return <Link href={href} className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-semibold ${v}`}>{children}</Link>;
}

export function Campo({ rotulo, children, dica, className = '' }: { rotulo: string; children: ReactNode; dica?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-semibold text-concreto-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-concreto-500">{dica}</span>}
    </label>
  );
}

export function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-concreto-500">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-concreto-900">{children}</dd>
    </div>
  );
}
