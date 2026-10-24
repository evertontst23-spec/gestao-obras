import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { criarPagamento } from './acoes';
import { STATUS_PAG, TIPO_PAG } from './comum';

export const metadata = { title: 'Pagamentos' };

/** Sugere a próxima data (dia 20 ou dia 05) e o período de passagens/alimentação */
function sugestao(hoje: string) {
  const [a, m, d] = hoje.split('-').map(Number);
  const iso = (y: number, mm: number, dd: number) => new Date(Date.UTC(y, mm - 1, dd)).toISOString().slice(0, 10);
  if (d <= 5) return { data: iso(a, m, 5), tipo: 'saldo', ini: iso(a, m, 6), fim: iso(a, m, 19) };
  if (d <= 20) return { data: iso(a, m, 20), tipo: 'adiantamento', ini: iso(a, m, 20), fim: iso(a, m + 1, 0) };
  return { data: iso(a, m + 1, 5), tipo: 'saldo', ini: iso(a, m + 1, 1), fim: iso(a, m + 1, 19) };
}

export default async function Pagamentos({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const [{ data: todos }, { data: obras }, { data: obraDe }] = await Promise.all([
    supabase.from('v_pagamentos').select('*').order('data_pagamento', { ascending: false }).limit(80),
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
    supabase.from('pagamentos').select('id, obra_id, obras(codigo)').not('obra_id', 'is', null),
  ]);
  const obraPag = new Map((obraDe ?? []).map((x) => [x.id, (x.obras as unknown as { codigo: string } | null)?.codigo ?? '']));
  const obraIdPag = new Map((obraDe ?? []).map((x) => [x.id, x.obra_id as string]));
  // filtro por obra: pagamentos daquela obra e os gerais (que têm linhas dela)
  const lista = (todos ?? []).filter((p) => !sp.obra || !obraIdPag.has(p.id) || obraIdPag.get(p.id) === sp.obra);
  const pode = ['admin', 'rh', 'financeiro'].includes(perfil.papel);
  const s = sugestao(hojeISO());
  const abertos = (lista ?? []).filter((p) => p.status === 'fechado' || p.status === 'rascunho');
  const proximo = abertos.sort((x, y) => x.data_pagamento.localeCompare(y.data_pagamento))[0];
  const pagosMes = (lista ?? []).filter((p) => p.status === 'pago' && p.data_pagamento.slice(0, 7) === hojeISO().slice(0, 7));
  return (
    <>
      <Cabecalho titulo="Pagamentos da equipe"
        sub="Dia 20 (adiantamento) e dia 05 (saldo com faltas e horas extras), separando o que vai para cada empresa (folha + taxa) e o que vai direto ao funcionário (passagens e alimentação)." />
      <AbasDP atual="pag" />
      <form className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <button className="rounded-md bg-concreto-800 px-3 py-2 font-semibold text-white">Filtrar</button>
      </form>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Próximo pagamento" valor={proximo ? reais(proximo.total) : '—'} detalhe={proximo ? `${data(proximo.data_pagamento)} • ${STATUS_PAG[proximo.status].rotulo}` : 'nenhum em aberto'} tom={proximo ? 'atencao' : 'neutro'} href={proximo ? `/dp/pagamentos/${proximo.id}` : undefined} />
        <Indicador rotulo="Pago neste mês" valor={reais(pagosMes.reduce((t, p) => t + Number(p.total), 0))} tom="ok" />
        <Indicador rotulo="Em conferência" valor={(lista ?? []).filter((p) => p.status === 'rascunho').length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Pagamentos" className="lg:col-span-2">
          {!lista?.length ? <Vazio>Nenhum pagamento ainda. Crie o próximo ao lado.</Vazio> : (
            <div className="space-y-2">
              {lista.map((p) => (
                <Link key={p.id} href={`/dp/pagamentos/${p.id}${sp.obra && !obraPag.has(p.id) ? `?obra=${sp.obra}` : ''}`} className="flex items-center gap-3 rounded-lg border border-concreto-200 bg-white p-3 hover:border-sinal-400">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.titulo} {obraPag.has(p.id) ? <Selo cor="bg-sinal-50 text-sinal-700">só {obraPag.get(p.id)}</Selo> : <Selo cor="bg-concreto-100 text-concreto-600">todas as obras</Selo>}</div>
                    <div className="text-xs text-concreto-500">{data(p.data_pagamento)} • {TIPO_PAG[p.tipo]} • {p.funcionarios} funcionário(s){p.status === 'pago' && p.pago_em && ` • pago em ${data(p.pago_em)}`}</div>
                    <div className="mt-1 text-xs text-concreto-600">Empresas {reais(p.total_empresas)} • Passagens e alimentação {reais(p.total_beneficios)} • Pessoas {reais(p.total_pessoas)}</div>
                  </div>
                  <div className="text-right"><div className={`font-mono font-bold ${p.status === 'cancelado' ? 'text-concreto-400 line-through' : ''}`}>{reais(p.total)}</div><Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo></div>
                </Link>))}
            </div>)}
        </Cartao>
        {pode && (
          <Cartao titulo="Novo pagamento">
            <FormAcao acao={criarPagamento} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data do pagamento"><input type="date" name="data_pagamento" required defaultValue={s.data} className="entrada" /></Campo>
                <Campo rotulo="Tipo"><select name="tipo" defaultValue={s.tipo} className="entrada">{Object.entries(TIPO_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              </div>
              <Campo rotulo="Título" dica="Ex.: Quinzena de 15/10 — pagamento dia 20"><input name="titulo" className="entrada" placeholder="(automático)" /></Campo>
              <Campo rotulo="Obra (fechamento por obra)" dica="Vazio = todas as obras num pagamento só. Escolha uma obra para fechar só a equipe dela.">
                <select name="obra_id" defaultValue={sp.obra ?? ''} className="entrada"><option value="">Todas as obras</option>
                  {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Passagens/alimentação de"><input type="date" name="periodo_inicio" defaultValue={s.ini} className="entrada" /></Campo>
                <Campo rotulo="até"><input type="date" name="periodo_fim" defaultValue={s.fim} className="entrada" /></Campo>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="gerar" defaultChecked className="mt-1" />
                <span>Calcular as linhas automaticamente: adiantamento (50% empresas, 40% CAD), saldo do mês, rescisões, taxa das empresas, passagens e alimentação por dia útil.</span></label>
              <Botao>Criar e conferir</Botao>
              <p className="text-xs text-concreto-500">Nada vai para o financeiro até você fechar. Depois de conferir, feche e, quando pagar, dê baixa.</p>
            </FormAcao>
          </Cartao>)}
      </div>
    </>
  );
}
