'use client';
/**
 * Tela de Pagamentos da equipe — visual da Proposta A com a praticidade da Proposta B.
 * Só apresentação: dados, contas e regras vêm de page.tsx; o formulário usa a mesma ação (criarPagamento)
 * com os mesmos campos (data_pagamento, tipo, titulo, obra_id, periodo_inicio, periodo_fim, gerar).
 */
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Filter, Info, Plus, Wallet } from 'lucide-react';
import { Badge, VazioCad, controle } from '@/components/cad';
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
const COR = { empresas: 'bg-sinal-500', pessoas: 'bg-info-500', beneficios: 'bg-concreto-500' };

/** Barra da divisão (só proporções dos valores que já existem) */
function Divisao({ p, legenda = true }: { p: PagLinha; legenda?: boolean }) {
  const partes = [
    { k: 'empresas' as const, rot: 'Empresas', v: Number(p.total_empresas) },
    { k: 'pessoas' as const, rot: 'Pessoas', v: Number(p.total_pessoas) },
    { k: 'beneficios' as const, rot: 'Passagens e alimentação', v: Number(p.total_beneficios) },
  ];
  const soma = partes.reduce((s, x) => s + Math.max(0, x.v), 0);
  return (
    <div className="space-y-3">
      {soma > 0 && (
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-elevada" aria-hidden>
          {partes.filter((x) => x.v > 0).map((x) => <div key={x.k} className={COR[x.k]} style={{ width: `${(x.v / soma) * 100}%` }} />)}
        </div>)}
      {legenda && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {partes.map((x) => (
            <div key={x.k} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-sm ${COR[x.k]}`} />
              <dt className="text-concreto-500">{x.rot}</dt>
              <dd className="font-medium text-concreto-900 tabular-nums">{reais(x.v)}</dd>
            </div>))}
        </dl>)}
    </div>
  );
}

function Situacao({ status }: { status: string }) {
  const st = STATUS_PAG[status];
  return <Badge tom={st?.tom ?? 'neutro'}>{st?.rotulo ?? status}</Badge>;
}

export function TelaPagamentos({ abas, lista, obras, obraPag, obraFiltro, verCancelados, nCancel, pode, sugestao, proximo, totalPagoMes, emConferencia }: {
  abas: ReactNode; lista: PagLinha[]; obras: Obra[]; obraPag: Record<string, string>; obraFiltro?: string; verCancelados: boolean; nCancel: number;
  pode: boolean; sugestao: { data: string; tipo: string; ini: string; fim: string }; proximo?: PagLinha; totalPagoMes: number; emConferencia: number;
}) {
  const [selId, setSelId] = useState<string | undefined>(proximo?.id ?? lista[0]?.id);
  const [aba, setAba] = useState<'detalhe' | 'novo'>('detalhe');
  const [aberto, setAberto] = useState<string | undefined>();
  const painel = useRef<HTMLDivElement>(null);
  const sel = lista.find((p) => p.id === selId);
  const hrefAbrir = (id: string) => `/dp/pagamentos/${id}${obraFiltro && !(id in obraPag) ? `?obra=${obraFiltro}` : ''}`;
  const obraDe = (id: string) => (id in obraPag ? `só ${obraPag[id]}` : 'todas as obras');
  const abrirNovo = () => { setAba('novo'); setTimeout(() => painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };

  // agrupa por mês (mesma ordem da consulta: mais recentes primeiro)
  const grupos: { mes: string; itens: PagLinha[] }[] = [];
  for (const p of lista) {
    const m = p.data_pagamento.slice(0, 7);
    const g = grupos[grupos.length - 1];
    if (g?.mes === m) g.itens.push(p); else grupos.push({ mes: m, itens: [p] });
  }

  return (
    <div className="pb-6">
      {/* Cabeçalho compacto */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-concreto-400">Departamento pessoal <span className="px-1 text-concreto-300">/</span> <span className="text-concreto-500">Pagamentos</span></p>
          <h1 className="text-2xl font-semibold tracking-tight text-concreto-900">Pagamentos da equipe</h1>
          <details className="group mt-1.5 max-w-2xl text-[13px] text-concreto-500">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 hover:text-concreto-700 [&::-webkit-details-marker]:hidden">
              Adiantamento no dia 20 e saldo no dia 05 — empresas e funcionários separados.
              <span className="inline-flex items-center gap-1 font-medium text-sinal-700"><Info aria-hidden className="h-3.5 w-3.5" />Como funciona</span>
            </summary>
            <p className="mt-2 rounded-lg bg-superficie p-3 leading-relaxed text-concreto-600">{DESCRICAO}</p>
          </details>
        </div>
        {pode && (
          <button type="button" onClick={abrirNovo}
            className="nao-imprimir inline-flex h-9 items-center gap-2 rounded-lg bg-sinal-500 px-4 text-[13px] font-semibold text-concreto-50 transition-colors hover:bg-sinal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-concreto-50">
            <Plus aria-hidden className="h-4 w-4" strokeWidth={2.4} />Novo pagamento
          </button>)}
      </header>

      {abas}

      {/* Indicadores: faixa única */}
      <section aria-label="Indicadores" className="mb-7 grid overflow-hidden rounded-xl bg-superficie lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-concreto-200 p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-concreto-500">Próximo pagamento</span>
            {proximo && <Situacao status={proximo.status} />}
          </div>
          {proximo ? (
            <Link href={`/dp/pagamentos/${proximo.id}`} className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[26px] font-semibold leading-none tracking-tight text-concreto-900 tabular-nums lg:text-[32px]">{reais(proximo.total)}</span>
                <span className="text-[13px] text-concreto-500">{data(proximo.data_pagamento)}</span>
                <ChevronRight aria-hidden className="h-4 w-4 text-concreto-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4"><Divisao p={proximo} /></div>
            </Link>
          ) : <span className="text-[28px] font-semibold text-concreto-400">—<span className="ml-3 text-[13px] font-normal">nenhum em aberto</span></span>}
        </div>
        <div className="grid grid-cols-2 lg:contents">
          <div className="border-r border-concreto-200 p-4 sm:p-5 lg:p-6">
            <span className="text-[13px] text-concreto-500">Pago neste mês</span>
            <div className="mt-2 text-xl font-semibold tracking-tight text-concreto-900 tabular-nums lg:text-[24px]">{reais(totalPagoMes)}</div>
            <p className="mt-1.5 text-xs text-concreto-400">pagamentos com baixa no mês</p>
          </div>
          <div className="p-4 sm:p-5 lg:p-6">
            <span className="text-[13px] text-concreto-500">Em conferência</span>
            <div className="mt-2 text-xl font-semibold tracking-tight text-concreto-900 tabular-nums lg:text-[24px]">{emConferencia}</div>
            <p className="mt-1.5 text-xs text-concreto-400">aguardando fechamento</p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Lista */}
        <section aria-label="Pagamentos" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-concreto-900">Histórico <span className="ml-1 text-[13px] font-normal text-concreto-400">{lista.length}</span></h2>
            <div className="nao-imprimir flex flex-wrap items-center gap-2">
              <form className="flex items-center gap-2" role="search">
                <label className="sr-only" htmlFor="filtro-obra">Obra</label>
                <select id="filtro-obra" name="obra" defaultValue={obraFiltro ?? ''} className={`${controle} !h-8 !w-auto max-w-[220px] !py-0 text-[13px]`}>
                  <option value="">Todas as obras</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
                </select>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-concreto-200 px-3 text-[13px] font-medium text-concreto-800 hover:bg-elevada focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">
                  <Filter aria-hidden className="h-3.5 w-3.5" />Filtrar</button>
              </form>
              {nCancel > 0 && (
                <a href={verCancelados ? '/dp/pagamentos' : '/dp/pagamentos?cancelados=1'}
                  className="inline-flex h-8 items-center rounded-lg border border-concreto-200 px-3 text-[13px] text-concreto-600 hover:bg-elevada">
                  {verCancelados ? `Esconder cancelados (${nCancel})` : `Mostrar cancelados (${nCancel})`}</a>)}
            </div>
          </div>

          {!lista.length ? <VazioCad icone={<Wallet className="h-5 w-5" />} titulo="Nenhum pagamento ainda">Crie o próximo em “Novo pagamento”.</VazioCad> : (<>
            {/* Computador: tabela */}
            <div className="hidden overflow-x-auto border-t border-concreto-200 lg:block">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-concreto-400">
                    <th scope="col" className="w-14 py-2.5 pr-2 font-medium">Data</th>
                    <th scope="col" className="px-2 py-2.5 font-medium">Pagamento</th>
                    <th scope="col" className="w-14 px-2 py-2.5 text-right font-medium">Func.</th>
                    <th scope="col" className="w-32 px-2 py-2.5 text-right font-medium">Total</th>
                    <th scope="col" className="w-40 px-2 py-2.5 font-medium">Situação</th>
                    <th scope="col" className="w-9"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                {grupos.map((g) => (
                  <tbody key={g.mes}>
                    <tr><th colSpan={6} scope="colgroup" className="pb-2 pt-5 text-left text-xs font-semibold text-concreto-700">{nomeMes(g.mes)}</th></tr>
                    {g.itens.map((p) => {
                      const cancel = p.status === 'cancelado';
                      const ativo = p.id === selId && aba === 'detalhe';
                      return (
                        <tr key={p.id} onClick={() => { setSelId(p.id); setAba('detalhe'); }}
                          className={`cursor-pointer border-t border-concreto-200 align-top transition-colors hover:bg-superficie ${ativo ? 'bg-superficie shadow-[inset_2px_0_0_rgb(var(--sinal-500))]' : ''}`}>
                          <td className="py-3.5 pl-2 pr-2">
                            <div className="flex flex-col leading-tight"><span className="text-[15px] font-semibold text-concreto-900">{p.data_pagamento.slice(8, 10)}</span>
                              <span className="text-[11px] uppercase text-concreto-400">{MES[Number(p.data_pagamento.slice(5, 7)) - 1]}</span></div>
                          </td>
                          <td className="px-2 py-3.5">
                            <button type="button" aria-pressed={ativo} onClick={(e) => { e.stopPropagation(); setSelId(p.id); setAba('detalhe'); }}
                              className={`text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500 ${cancel ? 'text-concreto-400' : 'text-concreto-900'}`}>{p.titulo}</button>
                            <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-concreto-400">
                              <span>{TIPO_PAG[p.tipo]}</span><span>·</span><span className="text-concreto-500">{obraDe(p.id)}</span>
                              {p.status === 'pago' && p.pago_em && <><span>·</span><span>pago em {data(p.pago_em)}</span></>}
                            </div>
                            <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                              <div className="flex gap-1"><dt className="text-concreto-400">Empresas</dt><dd className="text-concreto-600 tabular-nums">{reais(p.total_empresas)}</dd></div>
                              <div className="flex gap-1"><dt className="text-concreto-400">Pessoas</dt><dd className="text-concreto-600 tabular-nums">{reais(p.total_pessoas)}</dd></div>
                              <div className="flex gap-1"><dt className="text-concreto-400">Passagens e alim.</dt><dd className="text-concreto-600 tabular-nums">{reais(p.total_beneficios)}</dd></div>
                            </dl>
                          </td>
                          <td className="whitespace-nowrap px-2 py-3.5 text-right text-concreto-500 tabular-nums">{p.funcionarios}</td>
                          <td className={`whitespace-nowrap px-2 py-3.5 text-right text-[14px] font-semibold tabular-nums ${cancel ? 'text-concreto-400 line-through' : 'text-concreto-900'}`}>{reais(p.total)}</td>
                          <td className="px-2 py-3.5"><Situacao status={p.status} /></td>
                          <td className="py-2.5 text-right">
                            <Link href={hrefAbrir(p.id)} onClick={(e) => e.stopPropagation()} aria-label={`Abrir ${p.titulo}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-concreto-400 hover:bg-elevada hover:text-concreto-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">
                              <ChevronRight aria-hidden className="h-4 w-4" /></Link>
                          </td>
                        </tr>);
                    })}
                  </tbody>))}
              </table>
            </div>

            {/* Celular: linhas compactas que abrem o detalhamento */}
            <div className="space-y-4 lg:hidden">
              {grupos.map((g) => (
                <div key={g.mes}>
                  <p className="mb-2 text-xs font-semibold text-concreto-600">{nomeMes(g.mes)}</p>
                  <ul className="divide-y divide-concreto-200 overflow-hidden rounded-xl bg-superficie">
                    {g.itens.map((p) => {
                      const cancel = p.status === 'cancelado';
                      const exp = aberto === p.id;
                      return (
                        <li key={p.id}>
                          <button type="button" aria-expanded={exp} onClick={() => setAberto(exp ? undefined : p.id)}
                            className="grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left focus-visible:bg-elevada focus-visible:outline-none">
                            <span className="flex flex-col items-center leading-tight"><b className="text-[15px] font-semibold text-concreto-900">{p.data_pagamento.slice(8, 10)}</b>
                              <span className="text-[10px] uppercase text-concreto-400">{MES[Number(p.data_pagamento.slice(5, 7)) - 1]}</span></span>
                            <span className="min-w-0">
                              <span className={`block text-[13px] font-medium leading-snug ${cancel ? 'text-concreto-400' : 'text-concreto-900'}`}>{p.titulo}</span>
                              <span className="block text-[11px] text-concreto-400">{TIPO_PAG[p.tipo]} · {p.funcionarios} func.</span>
                            </span>
                            <span className="flex flex-col items-end gap-1">
                              <b className={`text-[13px] font-semibold tabular-nums ${cancel ? 'text-concreto-400 line-through' : 'text-concreto-900'}`}>{reais(p.total)}</b>
                              <Situacao status={p.status} />
                            </span>
                          </button>
                          {exp && (
                            <div className="mx-3 mb-3 ml-[56px] space-y-3 rounded-lg bg-elevada p-3">
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                                <div><dt className="text-concreto-400">Obra</dt><dd className="text-xs font-medium text-concreto-900">{obraDe(p.id)}</dd></div>
                                <div><dt className="text-concreto-400">Empresas</dt><dd className="text-xs font-medium text-concreto-900 tabular-nums">{reais(p.total_empresas)}</dd></div>
                                <div><dt className="text-concreto-400">Pessoas</dt><dd className="text-xs font-medium text-concreto-900 tabular-nums">{reais(p.total_pessoas)}</dd></div>
                                <div><dt className="text-concreto-400">Passagens e alim.</dt><dd className="text-xs font-medium text-concreto-900 tabular-nums">{reais(p.total_beneficios)}</dd></div>
                                <div><dt className="text-concreto-400">Data</dt><dd className="text-xs font-medium text-concreto-900">{data(p.data_pagamento)}</dd></div>
                                {p.status === 'pago' && p.pago_em && <div><dt className="text-concreto-400">Pago em</dt><dd className="text-xs font-medium text-concreto-900">{data(p.pago_em)}</dd></div>}
                              </dl>
                              <Link href={hrefAbrir(p.id)} className="flex h-9 items-center justify-center rounded-lg bg-superficie text-xs font-semibold text-concreto-900">Abrir pagamento</Link>
                            </div>)}
                        </li>);
                    })}
                  </ul>
                </div>))}
            </div>
          </>)}
        </section>

        {/* Painel lateral: detalhe do selecionado / novo pagamento */}
        <div ref={painel} className={`scroll-mt-4 lg:sticky lg:top-6 ${aba === 'novo' ? '' : 'hidden lg:block'}`}>
          <div className="overflow-hidden rounded-xl bg-superficie">
            <div role="tablist" aria-label="Painel" className="flex gap-1 border-b border-concreto-200 p-2">
              <button type="button" role="tab" aria-selected={aba === 'detalhe'} onClick={() => setAba('detalhe')}
                className={`h-8 rounded-md px-3 text-[13px] font-medium ${aba === 'detalhe' ? 'bg-elevada text-concreto-900' : 'text-concreto-500 hover:text-concreto-800'} hidden lg:block`}>Detalhe</button>
              {pode && <button type="button" role="tab" aria-selected={aba === 'novo'} onClick={() => setAba('novo')}
                className={`h-8 rounded-md px-3 text-[13px] font-medium ${aba === 'novo' ? 'bg-elevada text-concreto-900' : 'text-concreto-500 hover:text-concreto-800'}`}>Novo pagamento</button>}
            </div>

            {aba === 'detalhe' && (sel ? (
              <div role="tabpanel" className="space-y-5 p-5">
                <div className="space-y-2">
                  <Situacao status={sel.status} />
                  <h3 className="text-base font-semibold leading-snug text-concreto-900">{sel.titulo}</h3>
                  <p className={`text-[26px] font-semibold tracking-tight tabular-nums ${sel.status === 'cancelado' ? 'text-concreto-400 line-through' : 'text-concreto-900'}`}>{reais(sel.total)}</p>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
                  <dt className="text-concreto-400">Data</dt><dd className="text-concreto-900">{data(sel.data_pagamento)}</dd>
                  <dt className="text-concreto-400">Tipo</dt><dd className="text-concreto-900">{TIPO_PAG[sel.tipo]}</dd>
                  <dt className="text-concreto-400">Obra</dt><dd className="text-concreto-900">{obraDe(sel.id)}</dd>
                  <dt className="text-concreto-400">Funcionários</dt><dd className="text-concreto-900">{sel.funcionarios}</dd>
                  {sel.status === 'pago' && sel.pago_em && <><dt className="text-concreto-400">Pago em</dt><dd className="text-concreto-900">{data(sel.pago_em)}</dd></>}
                </dl>
                <div className="rounded-lg bg-elevada p-4">
                  <p className="mb-3 text-xs font-semibold text-concreto-500">Divisão</p>
                  <Divisao p={sel} />
                </div>
                <Link href={hrefAbrir(sel.id)}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg bg-concreto-900 text-[13px] font-semibold text-concreto-50 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">
                  Abrir pagamento<ChevronRight aria-hidden className="h-4 w-4" /></Link>
              </div>
            ) : <div className="p-5"><VazioCad titulo="Selecione um pagamento">Clique numa linha da lista para ver os detalhes aqui.</VazioCad></div>)}

            {aba === 'novo' && pode && (
              <div role="tabpanel" className="p-5">
                <p className="mb-5 text-xs leading-relaxed text-concreto-500">Cria o fechamento para conferência. Nada vai para o financeiro até você fechar.</p>
                <FormAcao acao={criarPagamento} className="space-y-6">
                  <fieldset className="space-y-3">
                    <legend className="mb-3 text-[11px] font-semibold tracking-wider text-concreto-400">1 · QUANDO E QUAL TIPO</legend>
                    <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-concreto-700">Data do pagamento</span>
                      <input type="date" name="data_pagamento" required defaultValue={sugestao.data} className={controle} /></label>
                    <div>
                      <span className="mb-1.5 block text-[13px] font-medium text-concreto-700" id="rot-tipo">Tipo</span>
                      <div role="radiogroup" aria-labelledby="rot-tipo" className="grid grid-cols-2 gap-2">
                        {Object.entries(TIPO_PAG).map(([k, v]) => (
                          <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-concreto-200 px-3 py-2.5 text-[13px] font-medium text-concreto-800 transition-colors hover:border-concreto-300 has-[:checked]:border-sinal-500 has-[:checked]:bg-sinal-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sinal-500">
                            <input type="radio" name="tipo" value={k} defaultChecked={k === sugestao.tipo} className="h-3.5 w-3.5 accent-[rgb(var(--sinal-500))]" />{v}
                          </label>))}
                      </div>
                    </div>
                  </fieldset>
                  <fieldset className="space-y-3">
                    <legend className="mb-3 text-[11px] font-semibold tracking-wider text-concreto-400">2 · IDENTIFICAÇÃO</legend>
                    <label className="block"><span className="mb-1.5 flex justify-between text-[13px] font-medium text-concreto-700">Título <span className="font-normal text-concreto-400">opcional</span></span>
                      <input name="titulo" className={controle} placeholder="(automático)" />
                      <span className="mt-1.5 block text-xs text-concreto-400">Ex.: Quinzena de 15/10 — pagamento dia 20</span></label>
                    <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-concreto-700">Obra (fechamento por obra)</span>
                      <select name="obra_id" defaultValue={obraFiltro ?? ''} className={controle}><option value="">Todas as obras</option>
                        {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
                      <span className="mt-1.5 block text-xs leading-relaxed text-concreto-400">Vazio = todas as obras num pagamento só. Escolha uma obra para fechar só a equipe dela.</span></label>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-3 text-[11px] font-semibold tracking-wider text-concreto-400">3 · PASSAGENS E ALIMENTAÇÃO</legend>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                      <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-concreto-700">De</span><input type="date" name="periodo_inicio" defaultValue={sugestao.ini} className={controle} /></label>
                      <span aria-hidden className="flex h-10 items-center text-concreto-400">→</span>
                      <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-concreto-700">Até</span><input type="date" name="periodo_fim" defaultValue={sugestao.fim} className={controle} /></label>
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-3 text-[11px] font-semibold tracking-wider text-concreto-400">4 · CÁLCULO</legend>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-elevada p-3.5">
                      <input type="checkbox" name="gerar" defaultChecked className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--sinal-500))]" />
                      <span className="space-y-1"><span className="block text-[13px] font-semibold text-concreto-900">Calcular as linhas automaticamente</span>
                        <span className="block text-xs leading-relaxed text-concreto-500">Adiantamento (50% empresas, 40% CAD), saldo do mês, rescisões, taxa das empresas, passagens e alimentação por dia útil.</span></span>
                    </label>
                  </fieldset>
                  <div className="flex gap-2 border-t border-concreto-200 pt-4">
                    <Botao className="h-10 flex-1 rounded-lg !bg-sinal-500 !text-concreto-50 hover:!bg-sinal-600">Criar e conferir</Botao>
                    <button type="button" onClick={() => setAba('detalhe')} className="h-10 rounded-lg border border-concreto-200 px-4 text-[13px] font-medium text-concreto-800 hover:bg-elevada">Cancelar</button>
                  </div>
                  <p className="text-xs leading-relaxed text-concreto-400">Depois de conferir, feche e, quando pagar, dê baixa.</p>
                </FormAcao>
              </div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
