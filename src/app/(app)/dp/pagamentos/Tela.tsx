'use client';
/**
 * Tela de Pagamentos da equipe — identidade CAD.
 * Só apresentação: dados, contas e regras vêm de page.tsx; o formulário usa a mesma ação (criarPagamento)
 * com os mesmos campos (data_pagamento, tipo, titulo, obra_id, periodo_inicio, periodo_fim, gerar).
 */
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Building2, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Filter,
  MoreHorizontal, Plus, Receipt, UserMinus, Wallet, X } from 'lucide-react';
import { Badge, VazioCad } from '@/components/cad';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data } from '@/lib/formato';
import { criarPagamento } from './acoes';
import { STATUS_PAG, TIPO_PAG } from './comum';

export type PagLinha = {
  id: string; titulo: string; tipo: string; status: string; data_pagamento: string; pago_em: string | null;
  funcionarios: number; total: number; total_empresas: number; total_beneficios: number; total_pessoas: number;
};
type Obra = { id: string; codigo: string; nome: string };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => { const n = MESES[Number(m.slice(5, 7)) - 1]; return `${n.charAt(0).toUpperCase()}${n.slice(1)} de ${m.slice(0, 4)}`; };
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DESCRICAO = 'Dia 20 (adiantamento) e dia 05 (saldo com faltas e horas extras), separando o que vai para cada empresa (folha + taxa) e o que vai direto ao funcionário (passagens e alimentação).';
const ICONE_TIPO: Record<string, typeof Wallet> = { adiantamento: CalendarClock, saldo: Wallet, rescisao: UserMinus, outro: MoreHorizontal };
const DICA_TIPO: Record<string, string> = { adiantamento: '50% empresas · 40% CAD', saldo: 'faltas e horas extras', rescisao: 'acerto de quem saiu', outro: 'lançamento avulso' };

const campo = 'block h-11 w-full rounded-xl border border-concreto-200 bg-concreto-50 px-3.5 text-sm text-concreto-900 placeholder:text-concreto-400 transition-colors hover:border-concreto-300 focus:border-sinal-500 focus:outline-none focus:ring-4 focus:ring-sinal-500/15';

function Situacao({ status }: { status: string }) {
  const st = STATUS_PAG[status];
  return <Badge tom={st?.tom ?? 'neutro'}>{st?.rotulo ?? status}</Badge>;
}

/** Três blocos da divisão (Empresas / Pessoas / Passagens e alimentação), com barra de proporção */
function Divisao({ p, compacto = false }: { p: PagLinha; compacto?: boolean }) {
  const partes = [
    { rot: 'Empresas', sub: 'folha + taxa', v: Number(p.total_empresas), cor: 'bg-sinal-500', icone: Building2 },
    { rot: 'Pessoas', sub: 'direto ao funcionário', v: Number(p.total_pessoas), cor: 'bg-info-500', icone: Wallet },
    { rot: 'Passagens e alimentação', sub: 'benefícios', v: Number(p.total_beneficios), cor: 'bg-concreto-400', icone: Receipt },
  ];
  const soma = partes.reduce((s, x) => s + Math.max(0, x.v), 0);
  return (
    <div className={`grid gap-2 sm:gap-3 ${compacto ? '' : 'grid-cols-3'}`}>
      {partes.map((x) => (
        <div key={x.rot} className="min-w-0 rounded-xl bg-elevada/70 p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-xs text-concreto-500 sm:gap-2 sm:text-[13px]"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${x.cor}`} /><span className="truncate">{compacto ? x.rot : x.rot.replace('Passagens e alimentação', 'Pass. e alim.')}</span></div>
          <div className="mt-1.5 truncate text-sm font-semibold text-concreto-900 tabular-nums sm:mt-2 sm:text-lg">{reais(x.v)}</div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-concreto-200/60 sm:mt-3 sm:h-1.5" aria-hidden>
            <div className={`h-full rounded-full ${x.cor}`} style={{ width: `${soma > 0 ? Math.max(0, (x.v / soma) * 100) : 0}%` }} />
          </div>
          <div className="mt-2 hidden text-xs text-concreto-400 sm:block">{x.sub}</div>
        </div>))}
    </div>
  );
}

export function TelaPagamentos({ abas, lista, obras, obraPag, obraFiltro, verCancelados, nCancel, pode, sugestao, proximo, totalPagoMes, emConferencia }: {
  abas?: ReactNode; lista: PagLinha[]; obras: Obra[]; obraPag: Record<string, string>; obraFiltro?: string; verCancelados: boolean; nCancel: number;
  pode: boolean; sugestao: { data: string; tipo: string; ini: string; fim: string }; proximo?: PagLinha; totalPagoMes: number; emConferencia: number;
}) {
  // gaveta lateral: detalhe de um pagamento ou formulário de novo
  const [gaveta, setGaveta] = useState<{ modo: 'detalhe'; id: string } | { modo: 'novo' } | null>(null);
  const [tipo, setTipo] = useState(sugestao.tipo);
  const [obraNova, setObraNova] = useState(obraFiltro ?? '');
  const [dataNova, setDataNova] = useState(sugestao.data);
  const sel = gaveta?.modo === 'detalhe' ? lista.find((p) => p.id === gaveta.id) : undefined;
  const hrefAbrir = (id: string) => `/dp/pagamentos/${id}${obraFiltro && !(id in obraPag) ? `?obra=${obraFiltro}` : ''}`;
  const obraDe = (id: string) => (id in obraPag ? `Só ${obraPag[id]}` : 'Todas as obras');
  const nomeObraNova = obraNova ? (obras.find((o) => o.id === obraNova)?.nome ?? '') : 'Todas as obras';

  useEffect(() => {
    if (!gaveta) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === 'Escape') setGaveta(null); };
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [gaveta]);

  const grupos: { mes: string; itens: PagLinha[] }[] = [];
  for (const p of lista) {
    const m = p.data_pagamento.slice(0, 7);
    const g = grupos[grupos.length - 1];
    if (g?.mes === m) g.itens.push(p); else grupos.push({ mes: m, itens: [p] });
  }

  const Tile = ({ rot, sub, children, className = '' }: { rot: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string }) => (
    <div className={`flex items-center justify-between gap-4 rounded-lg bg-elevada px-5 py-4 ${className}`}>
      <div className="min-w-0"><div className="text-[15px] leading-snug text-concreto-800">{rot}</div>{sub && <div className="mt-0.5 text-sm leading-snug text-concreto-400">{sub}</div>}</div>
      {children}
    </div>
  );

  return (
    <div className="pb-8">
      {/* Cabeçalho */}
      <header className="-mx-4 mb-8 border-b border-concreto-200 px-4 pb-7 md:-mx-10 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-concreto-200 bg-superficie text-concreto-800"><Wallet className="h-5 w-5" strokeWidth={1.7} /></span>
              <h1 className="text-[28px] font-semibold tracking-tight text-concreto-900 sm:text-[34px]">Pagamentos da equipe</h1>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-concreto-600">
              <span className="inline-flex items-center gap-2"><CalendarClock aria-hidden className="h-4 w-4 text-concreto-400" />Adiantamento dia 20</span>
              <span className="inline-flex items-center gap-2"><Wallet aria-hidden className="h-4 w-4 text-concreto-400" />Saldo dia 05</span>
              <span className="inline-flex items-center gap-2"><Building2 aria-hidden className="h-4 w-4 text-concreto-400" />{obraFiltro ? (obras.find((o) => o.id === obraFiltro)?.nome ?? 'Obra') : 'Todas as obras'}
                <span className="rounded-full border border-concreto-200 bg-superficie px-2 py-0.5 text-xs text-concreto-500">{lista.length} {lista.length === 1 ? 'pagamento' : 'pagamentos'}</span></span>
            </div>
          </div>
          {pode && (
            <button type="button" onClick={() => setGaveta({ modo: 'novo' })}
              className="nao-imprimir inline-flex h-11 items-center gap-2 rounded-lg bg-concreto-900 px-5 text-[15px] font-medium text-concreto-50 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-concreto-50">
              <Plus aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.2} />Novo pagamento
            </button>)}
        </div>
      </header>

      {abas}

      {/* Painel de indicadores (3 colunas) */}
      <section aria-label="Indicadores" className="mb-10 grid overflow-hidden rounded-xl border border-concreto-200 lg:grid-cols-3">
        <div className="space-y-3 border-b border-concreto-200 p-5 sm:p-8 lg:border-b-0 lg:border-r">
          <h2 className="mb-5 text-[15px] text-concreto-600">Próximo pagamento</h2>
          {proximo ? (<>
            <Link href={`/dp/pagamentos/${proximo.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">
              <Tile rot="Valor" sub={data(proximo.data_pagamento)}>
                <span className="flex items-center gap-2 whitespace-nowrap text-[26px] font-semibold tracking-tight text-concreto-900 tabular-nums">{reais(proximo.total)}<ChevronRight aria-hidden className="h-5 w-5 text-concreto-400" /></span>
              </Tile>
            </Link>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-elevada px-4 py-4 text-center"><div className="text-xl font-semibold text-concreto-900 tabular-nums">{proximo.funcionarios}</div><div className="mt-1 text-sm text-concreto-500">Funcionários</div></div>
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-elevada px-4 py-4"><Situacao status={proximo.status} /><div className="text-sm text-concreto-500">Situação</div></div>
            </div>
          </>) : <Tile rot="Nenhum em aberto" sub="Crie o próximo em “Novo pagamento”" />}
        </div>

        <div className="space-y-3 border-b border-concreto-200 p-5 sm:p-8 lg:border-b-0 lg:border-r">
          <h2 className="mb-5 text-[15px] text-concreto-600">Divisão do próximo</h2>
          {proximo ? ([
            ['Empresas', 'folha + taxa', proximo.total_empresas, 'bg-sinal-500'],
            ['Pessoas', 'direto ao funcionário', proximo.total_pessoas, 'bg-info-500'],
            ['Passagens e alim.', 'benefícios', proximo.total_beneficios, 'bg-concreto-400'],
          ] as const).map(([r, sb, v, cor], k) => (
            <Tile key={r} rot={r} sub={sb} className={k === 1 ? '' : ''}>
              <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-xl font-semibold text-concreto-900 tabular-nums">{reais(v)}<span aria-hidden className={`h-2.5 w-2.5 rounded-full ${cor}`} /></span>
            </Tile>)) : <Tile rot="—" />}
        </div>

        <div className="space-y-3 p-5 sm:p-8">
          <h2 className="mb-5 text-[15px] text-concreto-600">Fechamento</h2>
          <Tile rot="Pago neste mês" sub="Com baixa no mês">
            <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-xl font-semibold text-concreto-900 tabular-nums">{reais(totalPagoMes)}<CheckCircle2 aria-hidden className="h-5 w-5 text-ok-600" /></span>
          </Tile>
          <Tile rot="Em conferência" sub="Aguardando fechamento">
            <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-xl font-semibold text-concreto-900 tabular-nums">{emConferencia}<ClipboardList aria-hidden className="h-5 w-5 text-atencao-500" /></span>
          </Tile>
        </div>
      </section>

      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Lista */}
        <section aria-label="Pagamentos" className="min-w-0">
          <div className="nao-imprimir mb-5 flex flex-wrap items-center gap-3">
            {nCancel > 0 && (
              <nav aria-label="Cancelados" className="flex w-full rounded-lg border border-concreto-200 p-1 sm:w-auto">
                <a href="/dp/pagamentos" aria-current={!verCancelados ? 'page' : undefined} className={`flex-1 rounded-md px-3.5 py-1.5 text-center text-[15px] sm:flex-none ${!verCancelados ? 'bg-elevada text-concreto-900' : 'text-concreto-500 hover:text-concreto-800'}`}>Ativos</a>
                <a href="/dp/pagamentos?cancelados=1" aria-current={verCancelados ? 'page' : undefined} className={`flex-1 rounded-md px-3.5 py-1.5 text-center text-[15px] sm:flex-none ${verCancelados ? 'bg-elevada text-concreto-900' : 'text-concreto-500 hover:text-concreto-800'}`}>Com cancelados ({nCancel})</a>
              </nav>)}
            <form className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto" role="search">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Obra</span>
                <Filter aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-concreto-400" />
                <select name="obra" defaultValue={obraFiltro ?? ''} className="h-11 w-full appearance-none rounded-lg border border-concreto-200 bg-concreto-50 pl-10 pr-9 text-[15px] text-concreto-900 hover:border-concreto-300 focus:border-concreto-400 focus:outline-none">
                  <option value="">Todas as obras</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-concreto-400" />
              </label>
              <button className="h-11 rounded-lg border border-concreto-200 px-5 text-[15px] text-concreto-800 hover:bg-elevada focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">Filtrar</button>
            </form>
          </div>

          {!lista.length ? <VazioCad icone={<Wallet className="h-5 w-5" />} titulo="Nenhum pagamento ainda">Crie o próximo em “Novo pagamento”.</VazioCad> : (
            <div className="space-y-8">
              {grupos.map((g) => (
                <div key={g.mes}>
                  <p className="mb-3 text-sm text-concreto-500">{nomeMes(g.mes)}</p>
                  <ul className="divide-y divide-concreto-200 overflow-hidden rounded-xl border border-concreto-200">
                    {g.itens.map((p) => {
                      const cancel = p.status === 'cancelado';
                      const Ic = ICONE_TIPO[p.tipo] ?? Wallet;
                      return (
                        <li key={p.id} className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 px-4 py-4 sm:px-5 sm:py-5 md:items-center transition-colors hover:bg-superficie md:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto]">
                          <span aria-hidden className={`flex h-10 w-10 items-center justify-center rounded-full border border-concreto-200 bg-superficie sm:h-11 sm:w-11 ${cancel ? 'text-concreto-400' : 'text-concreto-800'}`}><Ic className="h-5 w-5" strokeWidth={1.7} /></span>
                          <button type="button" onClick={() => setGaveta({ modo: 'detalhe', id: p.id })}
                            className="min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-sinal-500">
                            <span className={`block text-base font-semibold leading-snug ${cancel ? 'text-concreto-400 line-through' : 'text-concreto-900'}`}>{p.titulo}</span>
                            <span className="mt-0.5 block text-[15px] text-concreto-500">{obraDe(p.id)}</span>
                          </button>
                          <div className="col-start-2 min-w-0 md:col-start-auto">
                            <div className="text-[15px] text-concreto-700">{TIPO_PAG[p.tipo]}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-concreto-500">
                              <CalendarDays aria-hidden className="h-3.5 w-3.5" />{data(p.data_pagamento)}<span className="text-concreto-300">·</span>{p.funcionarios} func.
                              {p.status === 'pago' && p.pago_em && <><span className="text-concreto-300">·</span>pago {data(p.pago_em)}</>}
                            </div>
                          </div>
                          <div className="col-start-2 flex items-center justify-between gap-2 md:col-start-auto md:flex-col md:items-end md:gap-1.5">
                            <span className={`text-[17px] font-semibold tabular-nums ${cancel ? 'text-concreto-400' : 'text-concreto-900'}`}>{reais(p.total)}</span>
                            <Situacao status={p.status} />
                          </div>
                          <Link href={hrefAbrir(p.id)} aria-label={`Abrir ${p.titulo}`}
                            className="relative z-10 hidden h-9 w-9 items-center justify-center rounded-md text-concreto-400 hover:bg-elevada hover:text-concreto-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500 md:flex">
                            <ChevronRight aria-hidden className="h-5 w-5" /></Link>
                        </li>);
                    })}
                  </ul>
                </div>))}
            </div>)}
        </section>

        {/* Lateral: como funciona e atalhos */}
        <aside className="space-y-8 xl:sticky xl:top-24">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-concreto-900">Como funciona</h2>
            <p className="text-[15px] leading-relaxed text-concreto-600">{DESCRICAO}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
              <Link href="/dp/folha" className="inline-flex items-center gap-2 text-concreto-800 hover:text-concreto-900"><Receipt aria-hidden className="h-4 w-4 text-concreto-400" />Folha<ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-concreto-400" /></Link>
              <Link href="/dp/beneficios" className="inline-flex items-center gap-2 text-concreto-800 hover:text-concreto-900"><Receipt aria-hidden className="h-4 w-4 text-concreto-400" />Benefícios<ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-concreto-400" /></Link>
            </div>
          </section>
          <section className="border-t border-concreto-200 pt-8">
            <h2 className="mb-4 text-lg font-semibold text-concreto-900">Cálculo automático</h2>
            <ul className="divide-y divide-concreto-200 text-[15px]">
              {[['Adiantamento', '50% empresas · 40% CAD'], ['Saldo do mês', 'faltas e horas extras'], ['Rescisões', 'acerto de quem saiu'], ['Empresas', 'taxa administrativa'], ['Passagens e alimentação', 'por dia útil']].map(([a, b]) => (
                <li key={a} className="flex items-center justify-between gap-3 py-3"><span className="text-concreto-800">{a}</span><span className="text-right text-sm text-concreto-500">{b}</span></li>))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-concreto-500">Nada vai para o financeiro até você fechar. Depois de conferir, feche e, quando pagar, dê baixa.</p>
          </section>
        </aside>
      </div>

      {/* Gaveta lateral (celular: tela cheia) */}
      {gaveta && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={gaveta.modo === 'novo' ? 'Novo pagamento' : 'Detalhe do pagamento'}>
          <button type="button" aria-label="Fechar" onClick={() => setGaveta(null)} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="relative flex h-full w-full flex-col border-l border-concreto-200 bg-concreto-100 shadow-2xl sm:max-w-[520px]">
            <div className="flex items-start justify-between gap-4 border-b border-concreto-200 px-6 py-5">
              {gaveta.modo === 'novo' ? (
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-sinal-50 text-sinal-700"><Plus className="h-5 w-5" strokeWidth={2.2} /></span>
                  <div><h2 className="text-lg font-semibold text-concreto-900">Novo pagamento</h2><p className="text-sm text-concreto-500">Fechamento para conferência</p></div>
                </div>
              ) : <div className="min-w-0"><p className="text-sm text-concreto-500">Pagamento</p><h2 className="mt-0.5 text-lg font-semibold leading-snug text-concreto-900">{sel?.titulo}</h2></div>}
              <button type="button" onClick={() => setGaveta(null)} aria-label="Fechar" autoFocus
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-concreto-500 hover:bg-elevada hover:text-concreto-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500"><X aria-hidden className="h-5 w-5" /></button>
            </div>

            {gaveta.modo === 'detalhe' && sel && (
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                <div className="rounded-2xl bg-superficie p-5">
                  <Situacao status={sel.status} />
                  <div className={`mt-3 text-[36px] font-semibold leading-none tracking-tight tabular-nums ${sel.status === 'cancelado' ? 'text-concreto-400 line-through' : 'text-concreto-900'}`}>{reais(sel.total)}</div>
                  <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                    <div><dt className="text-concreto-400">Data</dt><dd className="mt-0.5 font-medium text-concreto-900">{data(sel.data_pagamento)}</dd></div>
                    <div><dt className="text-concreto-400">Tipo</dt><dd className="mt-0.5 font-medium text-concreto-900">{TIPO_PAG[sel.tipo]}</dd></div>
                    <div><dt className="text-concreto-400">Obra</dt><dd className="mt-0.5 font-medium text-concreto-900">{obraDe(sel.id)}</dd></div>
                    <div><dt className="text-concreto-400">Funcionários</dt><dd className="mt-0.5 font-medium text-concreto-900">{sel.funcionarios}</dd></div>
                    {sel.status === 'pago' && sel.pago_em && <div><dt className="text-concreto-400">Pago em</dt><dd className="mt-0.5 font-medium text-concreto-900">{data(sel.pago_em)}</dd></div>}
                  </dl>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-concreto-700">Divisão do valor</h3>
                  <Divisao p={sel} compacto />
                </div>
              </div>)}
            {gaveta.modo === 'detalhe' && sel && (
              <div className="border-t border-concreto-200 px-6 py-4">
                <Link href={hrefAbrir(sel.id)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-sinal-500 text-sm font-semibold text-concreto-50 hover:bg-sinal-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sinal-500/30">
                  Abrir pagamento completo<ArrowRight aria-hidden className="h-4 w-4" /></Link>
              </div>)}

            {gaveta.modo === 'novo' && pode && (
              <FormAcao acao={criarPagamento} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
                  <section>
                    <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-concreto-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sinal-500 text-xs font-bold text-concreto-50">1</span>Tipo de pagamento</h3>
                    <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-3">
                      {Object.entries(TIPO_PAG).map(([k, v]) => {
                        const Ic = ICONE_TIPO[k] ?? Wallet;
                        return (
                          <label key={k} className="relative flex cursor-pointer flex-col gap-2 rounded-2xl border border-concreto-200 bg-superficie p-4 transition-colors hover:border-concreto-300 has-[:checked]:border-sinal-500 has-[:checked]:bg-sinal-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-sinal-500/25">
                            <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} className="peer sr-only" />
                            <Ic aria-hidden className="h-5 w-5 text-concreto-400 peer-checked:text-sinal-700" strokeWidth={1.8} />
                            <span className="text-sm font-semibold leading-tight text-concreto-900">{v}</span>
                            <span className="text-xs text-concreto-500">{DICA_TIPO[k]}</span>
                          </label>);
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-concreto-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sinal-500 text-xs font-bold text-concreto-50">2</span>Data e obra</h3>
                    <div className="space-y-4">
                      <label className="block"><span className="mb-2 block text-sm font-medium text-concreto-700">Data do pagamento</span>
                        <input type="date" name="data_pagamento" required value={dataNova} onChange={(e) => setDataNova(e.target.value)} className={campo} /></label>
                      <label className="block"><span className="mb-2 block text-sm font-medium text-concreto-700">Obra</span>
                        <select name="obra_id" value={obraNova} onChange={(e) => setObraNova(e.target.value)} className={campo}><option value="">Todas as obras</option>
                          {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
                        <span className="mt-2 block text-[13px] leading-relaxed text-concreto-500">Vazio = todas as obras num pagamento só. Escolha uma obra para fechar só a equipe dela.</span></label>
                      <label className="block"><span className="mb-2 flex justify-between text-sm font-medium text-concreto-700">Título <span className="font-normal text-concreto-400">opcional</span></span>
                        <input name="titulo" className={campo} placeholder="Automático" />
                        <span className="mt-2 block text-[13px] text-concreto-500">Ex.: Quinzena de 15/10 — pagamento dia 20</span></label>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-concreto-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-sinal-500 text-xs font-bold text-concreto-50">3</span>Passagens e alimentação</h3>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
                      <label className="block"><span className="mb-2 block text-sm font-medium text-concreto-700">De</span><input type="date" name="periodo_inicio" defaultValue={sugestao.ini} className={campo} /></label>
                      <span aria-hidden className="flex h-11 items-center text-concreto-400"><ArrowRight className="h-4 w-4" /></span>
                      <label className="block"><span className="mb-2 block text-sm font-medium text-concreto-700">Até</span><input type="date" name="periodo_fim" defaultValue={sugestao.fim} className={campo} /></label>
                    </div>
                  </section>

                  <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-concreto-200 bg-superficie p-4">
                    <input type="checkbox" name="gerar" defaultChecked className="peer sr-only" />
                    <span aria-hidden className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-concreto-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-concreto-50 after:shadow after:transition-transform peer-checked:bg-sinal-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-sinal-500/25" />
                    <span><span className="block text-sm font-semibold text-concreto-900">Calcular as linhas automaticamente</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-concreto-500">Adiantamento (50% empresas, 40% CAD), saldo do mês, rescisões, taxa das empresas, passagens e alimentação por dia útil.</span></span>
                  </label>

                  <div className="rounded-2xl border border-dashed border-concreto-300 p-4">
                    <p className="mb-2 text-xs font-semibold text-concreto-400">RESUMO</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-concreto-700"><CalendarDays aria-hidden className="h-4 w-4 text-concreto-400" />
                      <b className="font-semibold text-concreto-900">{TIPO_PAG[tipo]}</b><span className="text-concreto-300">·</span>{dataNova ? data(dataNova) : '—'}<span className="text-concreto-300">·</span>{nomeObraNova}</p>
                    <p className="mt-2 text-[13px] text-concreto-500">Nada vai para o financeiro até você fechar. Depois de conferir, feche e, quando pagar, dê baixa.</p>
                  </div>
                </div>
                <div className="flex gap-3 border-t border-concreto-200 bg-concreto-100 px-6 py-4">
                  <button type="button" onClick={() => setGaveta(null)} className="h-11 rounded-xl border border-concreto-200 px-5 text-sm font-medium text-concreto-800 hover:bg-elevada">Cancelar</button>
                  <Botao className="h-11 flex-1 !rounded-xl !bg-sinal-500 !text-sm !text-concreto-50 hover:!bg-sinal-600">Criar e conferir</Botao>
                </div>
              </FormAcao>)}
          </div>
        </div>)}
    </div>
  );
}
