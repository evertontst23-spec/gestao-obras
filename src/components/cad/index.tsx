/**
 * Design system CAD (identidade nova). Componentes de apresentação — sem regra de negócio.
 * Usam só os tokens de tema (concreto/sinal/ok/atencao/atraso/info/superficie/elevada), então
 * funcionam em qualquer tema; o tema oficial é data-tema="cad".
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export type Tom = 'neutro' | 'marca' | 'ok' | 'aviso' | 'erro' | 'info';

const TOM_BADGE: Record<Tom, string> = {
  neutro: 'bg-concreto-200/40 text-concreto-600 ring-concreto-200',
  marca: 'bg-sinal-50 text-sinal-700 ring-sinal-500/30',
  ok: 'bg-ok-50 text-ok-700 ring-ok-500/30',
  aviso: 'bg-atencao-50 text-atencao-700 ring-atencao-500/30',
  erro: 'bg-atraso-50 text-atraso-700 ring-atraso-500/30',
  info: 'bg-info-50 text-info-700 ring-info-500/30',
};
const TOM_PONTO: Record<Tom, string> = {
  neutro: 'bg-concreto-400', marca: 'bg-sinal-500', ok: 'bg-ok-500', aviso: 'bg-atencao-500', erro: 'bg-atraso-500', info: 'bg-info-500',
};

/** Etiqueta de status: ponto + texto, cor semântica */
export function Badge({ tom = 'neutro', children, ponto = true }: { tom?: Tom; children: ReactNode; ponto?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TOM_BADGE[tom]}`}>
      {ponto && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TOM_PONTO[tom]}`} />}{children}
    </span>
  );
}

/** Cabeçalho de página: trilha, título, descrição e ações */
export function CabecalhoPagina({ trilha, titulo, descricao, acoes }: { trilha?: string[]; titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {trilha && <p className="mb-2 text-xs font-medium text-concreto-400">{trilha.join('  /  ')}</p>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-concreto-900">{titulo}</h1>
        {descricao && <div className="mt-2 text-sm leading-relaxed text-concreto-500">{descricao}</div>}
      </div>
      {acoes && <div className="nao-imprimir flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}

/** Card de indicador financeiro */
export function CardIndicador({ icone, rotulo, valor, detalhe, tom = 'neutro', href, rodape }:
  { icone?: ReactNode; rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: Tom; href?: string; rodape?: ReactNode }) {
  const corIcone: Record<Tom, string> = {
    neutro: 'bg-elevada text-concreto-500', marca: 'bg-sinal-50 text-sinal-700', ok: 'bg-ok-50 text-ok-700',
    aviso: 'bg-atencao-50 text-atencao-700', erro: 'bg-atraso-50 text-atraso-700', info: 'bg-info-50 text-info-700',
  };
  const corpo = (
    <div className={`group flex h-full flex-col rounded-xl border border-concreto-200 bg-superficie p-5 ${href ? 'transition-colors hover:border-concreto-300 hover:bg-elevada' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-concreto-500">{rotulo}</span>
        {icone && <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-lg ${corIcone[tom]}`}>{icone}</span>}
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-concreto-900 tabular-nums">{valor}</div>
      {detalhe && <div className="mt-2 text-xs text-concreto-500">{detalhe}</div>}
      {(rodape || href) && <div className="mt-auto flex items-center justify-between pt-4 text-xs font-medium text-concreto-400">
        <span>{rodape}</span>{href && <ChevronRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}</div>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">{corpo}</Link> : corpo;
}

/** Painel (seção com título) */
export function Painel({ titulo, descricao, acoes, children, className = '', id, semPadding = false }:
  { titulo?: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; id?: string; semPadding?: boolean }) {
  return (
    <section id={id} className={`min-w-0 rounded-xl border border-concreto-200 bg-superficie ${className}`}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-concreto-200 px-5 py-4">
          <div><h2 className="text-[15px] font-semibold text-concreto-900">{titulo}</h2>{descricao && <p className="mt-0.5 text-xs text-concreto-500">{descricao}</p>}</div>
          {acoes}
        </header>)}
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** Campo de formulário: rótulo, controle e dica */
export function CampoCad({ rotulo, dica, children, className = '' }: { rotulo: string; dica?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-concreto-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1.5 block text-xs leading-relaxed text-concreto-400">{dica}</span>}
    </label>
  );
}

/** Estado vazio */
export function VazioCad({ icone, titulo, children }: { icone?: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-concreto-200 px-6 py-12 text-center">
      {icone && <span aria-hidden className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-elevada text-concreto-400">{icone}</span>}
      <p className="text-sm font-medium text-concreto-800">{titulo}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-concreto-500">{children}</p>}
    </div>
  );
}

/** Abas internas de um módulo: pílulas; no computador quebram linha (todas visíveis), no celular rolam de lado */
export function AbasCad({ itens }: { itens: { chave: string; rotulo: ReactNode; href: string; ativo: boolean; alerta?: boolean }[] }) {
  return (
    <nav aria-label="Seções" className="nao-imprimir -mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex min-w-max gap-1 md:min-w-0 md:flex-wrap">
        {itens.map((a) => (
          <li key={a.chave}>
            <Link href={a.href} aria-current={a.ativo ? 'page' : undefined}
              className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500
                ${a.ativo ? 'bg-elevada text-concreto-900 ring-1 ring-inset ring-concreto-200' : 'text-concreto-500 hover:bg-superficie hover:text-concreto-800'}`}>
              {a.rotulo}{a.alerta && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-atraso-500" />}
            </Link>
          </li>))}
      </ul>
    </nav>
  );
}

/** Classes padrão de controles (para inputs/selects nativos dentro de formulários) */
export const controle = 'block h-10 w-full rounded-lg border border-concreto-200 bg-concreto-50 px-3 text-sm text-concreto-900 placeholder:text-concreto-400 transition-colors hover:border-concreto-300 focus:border-sinal-500 focus:outline-none focus:ring-2 focus:ring-sinal-500/25 [color-scheme:inherit]';
export const botaoSecundario = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-concreto-200 bg-superficie px-4 text-sm font-medium text-concreto-800 transition-colors hover:bg-elevada focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500';
export const botaoPrimario = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sinal-500 px-4 text-sm font-semibold text-concreto-50 transition-colors hover:bg-sinal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-concreto-50';
