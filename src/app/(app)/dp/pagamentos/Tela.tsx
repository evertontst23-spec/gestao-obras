import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Filter, Plus, Wallet } from 'lucide-react';
import { Badge, CabecalhoPagina, CampoCad, CardIndicador, Painel, VazioCad, botaoPrimario, botaoSecundario, controle } from '@/components/cad';
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

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Tela de Pagamentos da equipe — só apresentação; os dados e regras vêm de page.tsx */
export function TelaPagamentos({ abas, lista, obras, obraPag, obraFiltro, verCancelados, nCancel, pode, sugestao, proximo, totalPagoMes, emConferencia }: {
  abas: ReactNode; lista: PagLinha[]; obras: Obra[]; obraPag: Record<string, string>; obraFiltro?: string; verCancelados: boolean; nCancel: number;
  pode: boolean; sugestao: { data: string; tipo: string; ini: string; fim: string }; proximo?: PagLinha; totalPagoMes: number; emConferencia: number;
}) {
  const sufixoObra = (id: string) => (obraFiltro && !(id in obraPag) ? `?obra=${obraFiltro}` : '');
  return (
    <div className="pb-6">
      <CabecalhoPagina
        trilha={['Departamento pessoal', 'Pagamentos']}
        titulo="Pagamentos da equipe"
        descricao="Dia 20 (adiantamento) e dia 05 (saldo com faltas e horas extras), separando o que vai para cada empresa (folha + taxa) e o que vai direto ao funcionário (passagens e alimentação)."
        acoes={pode ? <a href="#novo" className={botaoPrimario}><Plus aria-hidden className="h-4 w-4" />Novo pagamento</a> : undefined} />
      {abas}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardIndicador icone={<CalendarClock className="h-4 w-4" />} tom="aviso" rotulo="Próximo pagamento"
          valor={proximo ? reais(proximo.total) : '—'}
          detalhe={proximo ? <span className="flex flex-wrap items-center gap-2">{data(proximo.data_pagamento)}<Badge tom={STATUS_PAG[proximo.status].tom}>{STATUS_PAG[proximo.status].rotulo}</Badge></span> : 'nenhum em aberto'}
          href={proximo ? `/dp/pagamentos/${proximo.id}` : undefined} rodape={proximo ? 'Abrir pagamento' : undefined} />
        <CardIndicador icone={<CheckCircle2 className="h-4 w-4" />} tom="ok" rotulo="Pago neste mês" valor={reais(totalPagoMes)} detalhe="Pagamentos com baixa no mês atual" />
        <CardIndicador icone={<ClipboardList className="h-4 w-4" />} tom="info" rotulo="Em conferência" valor={emConferencia} detalhe={emConferencia === 1 ? 'pagamento aguardando fechamento' : 'pagamentos aguardando fechamento'} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Painel semPadding titulo="Pagamentos" descricao={`${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}${obraFiltro ? ' nesta obra' : ''}`}
          acoes={
            <form className="nao-imprimir flex w-full flex-wrap items-center gap-2 sm:w-auto" role="search">
              <label className="sr-only" htmlFor="filtro-obra">Obra</label>
              <select id="filtro-obra" name="obra" defaultValue={obraFiltro ?? ''} className={`${controle} !h-9 !w-full sm:!w-64`}>
                <option value="">Todas as obras</option>
                {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
              </select>
              {verCancelados && <input type="hidden" name="cancelados" value="1" />}
              <button className={`${botaoSecundario} h-9`}><Filter aria-hidden className="h-4 w-4" />Filtrar</button>
            </form>}>
          {nCancel > 0 && (
            <div className="nao-imprimir flex items-center justify-between gap-3 border-b border-concreto-200 bg-concreto-50/60 px-5 py-2.5 text-xs text-concreto-500">
              <span>{verCancelados ? `Mostrando ${nCancel} cancelado(s).` : `${nCancel} pagamento(s) cancelado(s) escondido(s).`}</span>
              <a className="font-medium text-sinal-700 hover:underline" href={verCancelados ? `/dp/pagamentos${obraFiltro ? `?obra=${obraFiltro}` : ''}` : `/dp/pagamentos?cancelados=1${obraFiltro ? `&obra=${obraFiltro}` : ''}`}>
                {verCancelados ? 'Esconder cancelados' : 'Mostrar cancelados'}</a>
            </div>)}
          {!lista.length ? <div className="p-5"><VazioCad icone={<Wallet className="h-5 w-5" />} titulo="Nenhum pagamento ainda">Crie o próximo em “Novo pagamento”.</VazioCad></div> : (
            <ul className="divide-y divide-concreto-200">
              {lista.map((p) => {
                const st = STATUS_PAG[p.status];
                const cancel = p.status === 'cancelado';
                return (
                  <li key={p.id}>
                    <Link href={`/dp/pagamentos/${p.id}${sufixoObra(p.id)}`}
                      className="group grid grid-cols-[auto_minmax(0,1fr)] items-start sm:items-center gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 transition-colors hover:bg-elevada focus-visible:bg-elevada focus-visible:outline-none">
                      <div aria-hidden className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-concreto-200 bg-concreto-50 leading-none ${cancel ? 'opacity-50' : ''}`}>
                        <span className="text-[17px] font-semibold text-concreto-900">{p.data_pagamento.slice(8, 10)}</span>
                        <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-concreto-400">{MES[Number(p.data_pagamento.slice(5, 7)) - 1]}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`min-w-0 break-words text-sm font-semibold sm:truncate ${cancel ? 'text-concreto-400' : 'text-concreto-900'}`}>{p.titulo}</span>
                          {p.id in obraPag ? <Badge tom="marca" ponto={false}>só {obraPag[p.id]}</Badge> : <Badge tom="neutro" ponto={false}>todas as obras</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-concreto-500">
                          {data(p.data_pagamento)} · {TIPO_PAG[p.tipo]} · {p.funcionarios} funcionário(s){p.status === 'pago' && p.pago_em && ` · pago em ${data(p.pago_em)}`}
                        </p>
                        <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <div className="flex gap-1.5"><dt className="text-concreto-400">Empresas</dt><dd className="font-medium text-concreto-700 tabular-nums">{reais(p.total_empresas)}</dd></div>
                          <div className="flex gap-1.5"><dt className="text-concreto-400">Passagens e alimentação</dt><dd className="font-medium text-concreto-700 tabular-nums">{reais(p.total_beneficios)}</dd></div>
                          <div className="flex gap-1.5"><dt className="text-concreto-400">Pessoas</dt><dd className="font-medium text-concreto-700 tabular-nums">{reais(p.total_pessoas)}</dd></div>
                        </dl>
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-concreto-200 pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
                        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end sm:gap-1.5">
                          <span className={`text-base font-semibold tabular-nums ${cancel ? 'text-concreto-400 line-through' : 'text-concreto-900'}`}>{reais(p.total)}</span>
                          <Badge tom={st.tom}>{st.rotulo}</Badge>
                        </div>
                        <ChevronRight aria-hidden className="hidden h-4 w-4 text-concreto-400 transition-transform group-hover:translate-x-0.5 sm:block" />
                      </div>
                    </Link>
                  </li>);
              })}
            </ul>)}
        </Painel>

        {pode && (
          <Painel id="novo" titulo="Novo pagamento" descricao="Cria o fechamento para conferência" className="scroll-mt-6 xl:sticky xl:top-6">
            <FormAcao acao={criarPagamento} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                <CampoCad rotulo="Data do pagamento"><input type="date" name="data_pagamento" required defaultValue={sugestao.data} className={controle} /></CampoCad>
                <CampoCad rotulo="Tipo"><select name="tipo" defaultValue={sugestao.tipo} className={controle}>{Object.entries(TIPO_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CampoCad>
              </div>
              <CampoCad rotulo="Título" dica="Ex.: Quinzena de 15/10 — pagamento dia 20"><input name="titulo" className={controle} placeholder="(automático)" /></CampoCad>
              <CampoCad rotulo="Obra (fechamento por obra)" dica="Vazio = todas as obras num pagamento só. Escolha uma obra para fechar só a equipe dela.">
                <select name="obra_id" defaultValue={obraFiltro ?? ''} className={controle}><option value="">Todas as obras</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></CampoCad>
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium text-concreto-700">Período de passagens e alimentação</legend>
                <div className="grid grid-cols-2 gap-3">
                  <CampoCad rotulo="De"><input type="date" name="periodo_inicio" defaultValue={sugestao.ini} className={controle} /></CampoCad>
                  <CampoCad rotulo="Até"><input type="date" name="periodo_fim" defaultValue={sugestao.fim} className={controle} /></CampoCad>
                </div>
              </fieldset>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-concreto-200 bg-concreto-50 p-3 text-sm transition-colors hover:border-concreto-300">
                <input type="checkbox" name="gerar" defaultChecked className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--sinal-500))]" />
                <span className="leading-relaxed text-concreto-600"><span className="font-medium text-concreto-900">Calcular as linhas automaticamente:</span> adiantamento (50% empresas, 40% CAD), saldo do mês, rescisões, taxa das empresas, passagens e alimentação por dia útil.</span>
              </label>
              <Botao className="h-10 w-full rounded-lg !bg-sinal-500 !text-concreto-50 hover:!bg-sinal-600">Criar e conferir</Botao>
              <p className="text-xs leading-relaxed text-concreto-400">Nada vai para o financeiro até você fechar. Depois de conferir, feche e, quando pagar, dê baixa.</p>
            </FormAcao>
          </Painel>)}
      </div>
    </div>
  );
}
