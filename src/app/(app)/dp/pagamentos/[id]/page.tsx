import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Selo, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { BaixarCSV } from '@/components/BaixarCSV';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data, dataHora, hojeISO } from '@/lib/formato';
import { cancelarPagamento, fecharPagamento, gerarLinhas, quitarPagamento, reabrirPagamento, salvarItem } from '../acoes';
import { BENEFICIO, CAT_PAG, STATUS_PAG, TIPO_PAG } from '../comum';
import { Fechamentos, type PagResumo } from '../../folha/Fechamentos';
import { ExportarC6Pagamento } from '@/components/ExportarC6Pagamento';

export const metadata = { title: 'Pagamento' };

type Item = {
  id: number; categoria: string; destino: 'empresa' | 'funcionario'; descricao: string; valor: number; funcionario_id: string | null;
  empregador_id: string | null; obra_id: string | null; funcionarios: { nome: string; matricula: string; ativo: boolean; funcoes: { nome: string } | null } | null;
  empregadores: { nome: string; tipo: string } | null; obras: { codigo: string } | null;
};
const n = (v: unknown) => Number(v ?? 0);

export default async function Pagamento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ obra?: string; ver?: string; g?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const [{ data: p }, { data: itensBrutos }, { data: lancs }, { data: funcs }, { data: obras }, { data: empExt }, { data: pobra }] = await Promise.all([
    supabase.from('v_pagamentos').select('*').eq('id', id).maybeSingle(),
    supabase.from('pagamento_itens').select('id, categoria, destino, descricao, valor, funcionario_id, empregador_id, obra_id, funcionarios(nome, matricula, ativo, funcoes(nome)), empregadores(nome, tipo), obras(codigo)')
      .eq('pagamento_id', id).eq('removido', false).order('id'),
    supabase.from('lancamentos').select('id, numero, descricao, valor, status, favorecido, obras(codigo)').eq('pagamento_id', id).order('numero'),
    supabase.from('funcionarios').select('id, nome, ativo, empregadores(nome)').order('nome'),
    supabase.from('obras').select('id, codigo').order('codigo'),
    supabase.from('empregadores').select('id, nome, ponto_externo_url').eq('ponto_externo', true),
    supabase.from('pagamentos').select('obra_id, obras(codigo, nome)').eq('id', id).maybeSingle(),
  ]);
  if (!p) notFound();
  const todosItens = (itensBrutos ?? []) as unknown as Item[];
  const obraDoPag = (pobra?.obras as unknown as { codigo: string; nome: string } | null) ?? null;
  const codObra = new Map((obras ?? []).map((o) => [o.id, o.codigo]));
  // centro de custo: soma por obra
  const porObra = new Map<string, { codigo: string; empresas: number; benef: number; pessoas: number; pessoasN: Set<string> }>();
  for (const i of todosItens) {
    const k = i.obra_id ?? '';
    const g = porObra.get(k) ?? { codigo: k ? codObra.get(k) ?? '—' : 'Sem obra', empresas: 0, benef: 0, pessoas: 0, pessoasN: new Set<string>() };
    if (i.destino === 'empresa') g.empresas += n(i.valor); else if (BENEFICIO.includes(i.categoria)) g.benef += n(i.valor); else g.pessoas += n(i.valor);
    if (i.funcionario_id) g.pessoasN.add(i.funcionario_id);
    porObra.set(k, g);
  }
  const obrasDoPag = [...porObra.entries()].sort((a, b) => a[1].codigo.localeCompare(b[1].codigo));
  const filtro = sp.obra && porObra.has(sp.obra === 'sem' ? '' : sp.obra) ? (sp.obra === 'sem' ? '' : sp.obra) : null;
  const itens = filtro === null ? todosItens : todosItens.filter((i) => (i.obra_id ?? '') === filtro);
  const somaDe = (f: (i: Item) => boolean) => itens.filter(f).reduce((t, i) => t + n(i.valor), 0);
  const tot = filtro === null ? { total: n(p.total), emp: n(p.total_empresas), ben: n(p.total_beneficios), pes: n(p.total_pessoas) }
    : { total: somaDe(() => true), emp: somaDe((i) => i.destino === 'empresa'), ben: somaDe((i) => i.destino === 'funcionario' && BENEFICIO.includes(i.categoria)),
        pes: somaDe((i) => i.destino === 'funcionario' && !BENEFICIO.includes(i.categoria)) };
  const nomeFiltro = filtro === null ? null : filtro ? codObra.get(filtro) ?? '' : 'Sem obra';
  const rh = ['admin', 'rh'].includes(perfil.papel);
  const editavel = p.status === 'rascunho';

  // agrupa por empresa contratante (na ordem: fornecedoras, parceiras, própria, sem empresa)
  const ordem: Record<string, number> = { fornecedora_mao_obra: 0, parceira: 1, propria: 2 };
  const grupos = new Map<string, { nome: string; tipo: string; itens: Item[] }>();
  for (const i of itens) {
    const k = i.empregador_id ?? 'sem';
    if (!grupos.has(k)) grupos.set(k, { nome: i.empregadores?.nome ?? 'Sem empresa', tipo: i.empregadores?.tipo ?? 'z', itens: [] });
    grupos.get(k)!.itens.push(i);
  }
  const lista = [...grupos.values()].sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9) || a.nome.localeCompare(b.nome));
  const zerados = itens.filter((i) => i.categoria === 'quinzena' && n(i.valor) === 0);

  const csv = itens.map((i) => [i.empregadores?.nome ?? '', i.funcionarios?.nome ?? '', CAT_PAG[i.categoria], i.destino === 'empresa' ? 'Empresa' : 'Funcionário', i.obras?.codigo ?? '', i.descricao, n(i.valor)]);
  const st = p.status as string;
  const passo = st === 'rascunho' ? 0 : st === 'fechado' ? 2 : st === 'pago' ? 4 : -1;
  const PASSOS = ['Conferir os valores', 'Fechar e lançar no financeiro', 'Fazer os Pix (planilha do C6)', 'Dar baixa'];
  const c6 = itens.length ? <ExportarC6Pagamento supabase={supabase} pagamentoId={p.id} /> : null;
  return (
    <>
      <p className="nao-imprimir mb-2 text-sm"><Link className="link" href="/dp/pagamentos">← Todos os pagamentos</Link></p>
      <Cabecalho titulo={nomeFiltro ? `${p.titulo} — obra ${nomeFiltro}` : p.titulo}
        sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-1"><Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo>{obraDoPag && <Selo cor="bg-sinal-50 text-sinal-700">só a obra {obraDoPag.codigo}</Selo>}<span>{TIPO_PAG[p.tipo]}</span><span aria-hidden>•</span><span>pagamento em <b className="font-semibold text-concreto-700">{data(p.data_pagamento)}</b></span>{p.periodo_inicio && p.periodo_fim && <><span aria-hidden>•</span><span>período de {data(p.periodo_inicio)} a {data(p.periodo_fim)}</span></>}</span>}
        acoes={<div className="flex gap-2"><BaixarCSV nome={`pagamento-${p.data_pagamento}${nomeFiltro ? `-${nomeFiltro}` : ''}`} cabecalho={['Empresa', 'Funcionário', 'Item', 'Pagar a', 'Obra', 'Descrição', 'Valor']} linhas={csv} /><BotaoImprimir /></div>} />
      <AbasDP atual="pag" v2 />

      {/* Etapas: onde este pagamento está e o que fazer agora */}
      <section aria-label="Etapas do pagamento" className="nao-imprimir mb-5 overflow-hidden rounded-xl border border-concreto-200 bg-superficie">
        {passo >= 0 && (
          <ol className="grid grid-cols-2 border-b border-concreto-200 text-[13px] md:grid-cols-4">
            {PASSOS.map((r, k) => {
              const feito = k < passo; const atual = k === passo || (passo === 2 && k === 3);
              return (
                <li key={r} className={`flex items-center gap-2.5 px-4 py-3 ${k > 0 ? 'md:border-l md:border-concreto-200' : ''} ${k >= 2 ? 'border-t border-concreto-200 md:border-t-0' : ''} ${k % 2 === 1 ? 'border-l border-concreto-200' : ''}`}>
                  <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${feito ? 'bg-ok-500 text-white' : atual ? 'bg-sinal-500 text-white' : 'bg-elevada text-concreto-400'}`}>{feito ? '✓' : k + 1}</span>
                  <span className={feito ? 'text-concreto-500' : atual ? 'font-semibold text-concreto-900' : 'text-concreto-400'}>{r}</span>
                </li>);
            })}
          </ol>)}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
          {st === 'rascunho' && (<>
            <div className="min-w-0 max-w-2xl text-sm"><p className="font-semibold text-concreto-900">Confira os valores abaixo.</p>
              <p className="mt-0.5 text-concreto-500">Clique numa obra para ver e editar cada funcionário. Quando estiver tudo certo, feche: o sistema cria as contas a pagar (uma por empresa e uma por obra para os funcionários).</p></div>
            {rh && itens.length > 0 && (
              <FormAcao acao={fecharPagamento}><input type="hidden" name="id" value={p.id} />
                <Botao className="h-10 px-4">Fechar e lançar no financeiro</Botao></FormAcao>)}
          </>)}
          {st === 'fechado' && (<>
            <div className="min-w-0 max-w-xl text-sm"><p className="font-semibold text-concreto-900">Fechado — falta pagar {reais(n(p.total))}.</p>
              <p className="mt-0.5 text-concreto-500">Baixe a <a className="link" href="#c6">planilha do C6</a>, faça os Pix no banco e depois dê baixa aqui com a data em que pagou.</p></div>
            <FormAcao acao={quitarPagamento} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
              <Campo rotulo="Pago em"><input type="date" name="data" required defaultValue={p.data_pagamento <= hojeISO() ? p.data_pagamento : hojeISO()} max={hojeISO()} className="entrada w-auto" /></Campo>
              <Botao variante="sucesso" className="h-[42px] px-4">Marcar como pago</Botao></FormAcao>
          </>)}
          {st === 'pago' && <p className="text-sm"><b className="font-semibold text-ok-700">Pago{p.pago_em ? ` em ${data(p.pago_em)}` : ''}.</b> <span className="text-concreto-500">Total de {reais(n(p.total))} — já está como pago no financeiro.</span></p>}
          {st === 'cancelado' && <p className="text-sm"><b className="font-semibold text-concreto-700">Pagamento cancelado.</b> <span className="text-concreto-500">{p.motivo_cancelamento}</span></p>}
        </div>
      </section>

      {editavel && p.tipo === 'saldo' && (empExt ?? []).some((e) => itens.some((i) => i.empregador_id === e.id)) && (
        <p className="mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">⚠ O ponto de {(empExt ?? []).filter((e) => itens.some((i) => i.empregador_id === e.id)).map((e) => e.nome).join(' e ')} é marcado fora do sistema: o saldo foi calculado sem faltas e sem horas extras. Confira no {(empExt ?? []).find((e) => e.ponto_externo_url) ? <a className="link" href={(empExt ?? []).find((e) => e.ponto_externo_url)!.ponto_externo_url!} target="_blank" rel="noreferrer">Ponto Diário</a> : 'Ponto Diário'} e inclua cada falta como <b>Desconto</b> (salário ÷ 30) e as horas extras como <b>Hora extra</b>.</p>)}
      {zerados.length > 0 && editavel && (
        <p className="mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">⚠ Falta informar o valor da quinzena de {zerados.map((i) => i.funcionarios?.nome).join(', ')} (fechamento feito pela empresa). Inclua a linha com o valor e retire a linha zerada.</p>)}

      {!itens.length ? (
        <Cartao titulo="Sem linhas ainda">
          {editavel && rh ? (
            <FormAcao acao={gerarLinhas} className="space-y-3"><input type="hidden" name="id" value={p.id} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="beneficios" defaultChecked={!!(p.periodo_inicio && p.periodo_fim)} disabled={!(p.periodo_inicio && p.periodo_fim)} /> Incluir passagens e alimentação do período</label>
              <Botao>Calcular as linhas</Botao>
            </FormAcao>) : <Vazio>Nenhuma linha.</Vazio>}
        </Cartao>
      ) : (
        <Fechamentos supabase={supabase} mes={p.data_pagamento.slice(0, 7)} pags={[p as unknown as PagResumo]} ver={sp.ver} g={sp.g} rh={rh} base={`/dp/pagamentos/${p.id}`} umPagamento />)}

      {editavel && rh && (
        <details className="nao-imprimir group mt-5 rounded-lg border border-concreto-200/80 bg-superficie shadow-cartao" open={!itens.length}>
          <summary className="cursor-pointer px-5 py-3.5 text-[15px] font-bold text-concreto-900">+ Incluir linha <span className="ml-1 text-sm font-normal text-concreto-500">(desconto, hora extra, taxa, valor da quinzena…)</span></summary>
          <div className="border-t border-concreto-100 p-5">
            <FormAcao acao={salvarItem} limparAoConcluir className="grid gap-3 md:grid-cols-6"><input type="hidden" name="id" value={p.id} />
              <Campo rotulo="Funcionário" dica="Em branco para taxa ou outro valor da empresa" className="md:col-span-3">
                <select name="funcionario_id" className="entrada"><option value="">—</option>
                  {funcs?.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome}{(f.empregadores as unknown as { nome: string } | null)?.nome ? ` (${(f.empregadores as unknown as { nome: string }).nome})` : ''}{f.ativo ? '' : ' — desligado'}</option>)}</select></Campo>
              <Campo rotulo="Item" className="md:col-span-2"><select name="categoria" className="entrada">{Object.entries(CAT_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              <Campo rotulo="Valor (R$)"><input name="valor" required inputMode="decimal" className="entrada" placeholder="0,00" /></Campo>
              <Campo rotulo="Descrição" className="md:col-span-3"><input name="descricao" className="entrada" placeholder="Ex.: 1 falta descontada" /></Campo>
              <Campo rotulo="Pagar a"><select name="destino" className="entrada"><option value="">Automático</option><option value="empresa">Empresa</option><option value="funcionario">Funcionário</option></select></Campo>
              <Campo rotulo="Obra"><select name="obra_id" className="entrada"><option value="">Do funcionário</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select></Campo>
              <div className="flex items-end"><Botao variante="secundario" className="h-[42px] w-full">Incluir</Botao></div>
            </FormAcao>
          </div>
        </details>)}

      {/* Planilha do C6: em destaque quando está fechado (hora de pagar); recolhida nas outras situações */}
      {c6 && (st === 'fechado'
        ? <div id="c6" className="mt-5 scroll-mt-24">{c6}</div>
        : <details id="c6" className="nao-imprimir mt-5 scroll-mt-24 rounded-lg border border-concreto-200/80 bg-superficie shadow-cartao">
            <summary className="cursor-pointer px-5 py-3.5 text-[15px] font-bold text-concreto-900">Planilha do C6 Bank (Pix em massa) <span className="ml-1 text-sm font-normal text-concreto-500">{st === 'rascunho' ? '— prévia; o normal é baixar depois de fechar' : '— baixar de novo'}</span></summary>
            <div className="border-t border-concreto-100 p-3 [&>section]:mb-0 [&>section]:border-0 [&>section]:shadow-none">{c6}</div>
          </details>)}

      <div className="nao-imprimir mt-5 grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Histórico">
          <div className="space-y-3 text-sm">
            <ul className="space-y-1.5 text-concreto-600">
              <li>Criado em {dataHora(p.criado_em)}{p.criado_nome && ` por ${p.criado_nome}`}.</li>
              {p.fechado_em && <li>Fechado em {dataHora(p.fechado_em)}.</li>}
              {st === 'pago' && p.pago_em && <li>Pago em {data(p.pago_em)}.</li>}
              {p.motivo_cancelamento && <li>Cancelado: {p.motivo_cancelamento}</li>}
            </ul>
            {lancs && lancs.length > 0 && (
              <div><div className="mb-1 font-semibold text-concreto-800">No financeiro</div>
                <ul className="divide-y divide-concreto-100">{lancs.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5"><span className="min-w-0"><Link className="link" href={`/financeiro/lancamentos/${l.id}`}>{l.favorecido ?? l.descricao}</Link>{(l.obras as unknown as { codigo: string } | null)?.codigo && <span className="text-concreto-500"> • {(l.obras as unknown as { codigo: string }).codigo}</span>}</span>
                    <span className="whitespace-nowrap"><span className="font-mono">{reais(l.valor)}</span> <span className={`text-xs ${l.status === 'liquidado' ? 'text-ok-700' : 'text-concreto-500'}`}>({l.status === 'liquidado' ? 'pago' : l.status === 'cancelado' ? 'cancelado' : 'a pagar'})</span></span></li>))}</ul></div>)}
          </div>
        </Cartao>
        {(st === 'rascunho' || st === 'fechado') && rh && (
          <Cartao titulo="Outras ações">
            <div className="space-y-4 text-sm">
              {st === 'fechado' && (
                <FormAcao acao={reabrirPagamento} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
                  <Campo rotulo="Reabrir para ajuste — motivo" className="min-w-[12rem] flex-1"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                  <Botao variante="secundario" className="h-[42px]">Reabrir</Botao></FormAcao>)}
              <FormAcao acao={cancelarPagamento} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
                <Campo rotulo="Cancelar o pagamento — motivo" className="min-w-[12rem] flex-1"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                <Botao variante="perigo" className="h-[42px]">Cancelar</Botao></FormAcao>
              <p className="text-xs text-concreto-500">Cancelar não apaga nada: o pagamento fica guardado como cancelado e as contas a pagar dele são canceladas.</p>
            </div>
          </Cartao>)}
      </div>
    </>
  );
}
