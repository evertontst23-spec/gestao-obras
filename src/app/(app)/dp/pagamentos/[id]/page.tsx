import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { BaixarCSV } from '@/components/BaixarCSV';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data, dataHora, hojeISO } from '@/lib/formato';
import { cancelarPagamento, editarItem, fecharPagamento, gerarLinhas, quitarPagamento, reabrirPagamento, removerItem, salvarItem } from '../acoes';
import { BENEFICIO, CAT_PAG, STATUS_PAG, TIPO_PAG } from '../comum';
import { Fechamentos, type PagResumo } from '../../folha/Fechamentos';

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
  return (
    <>
      <Cabecalho titulo={nomeFiltro ? `${p.titulo} — obra ${nomeFiltro}` : p.titulo}
        sub={<><Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo> {obraDoPag && <Selo cor="bg-sinal-50 text-sinal-700">só a obra {obraDoPag.codigo}</Selo>} <span className="ml-1">{TIPO_PAG[p.tipo]} • pagamento em {data(p.data_pagamento)}{p.periodo_inicio && p.periodo_fim && ` • passagens/alimentação de ${data(p.periodo_inicio)} a ${data(p.periodo_fim)}`}</span></>}
        acoes={<div className="flex gap-2"><BaixarCSV nome={`pagamento-${p.data_pagamento}${nomeFiltro ? `-${nomeFiltro}` : ''}`} cabecalho={['Empresa', 'Funcionário', 'Item', 'Pagar a', 'Obra', 'Descrição', 'Valor']} linhas={csv} /><BotaoImprimir /></div>} />
      <AbasDP atual="pag" />
      <p className="nao-imprimir mb-3 text-sm"><Link className="link" href="/dp/pagamentos">← Todos os pagamentos</Link></p>

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

      <div className="nao-imprimir mt-5 grid gap-5 lg:grid-cols-2">
        {editavel && rh && (
          <Cartao titulo="Incluir linha">
            <FormAcao acao={salvarItem} limparAoConcluir className="space-y-3"><input type="hidden" name="id" value={p.id} />
              <Campo rotulo="Funcionário" dica="Deixe em branco para taxa ou outro valor da empresa">
                <select name="funcionario_id" className="entrada"><option value="">—</option>
                  {funcs?.map((f) => <option key={f.id} value={f.id}>{f.nome}{(f.empregadores as unknown as { nome: string } | null)?.nome ? ` (${(f.empregadores as unknown as { nome: string }).nome})` : ''}{f.ativo ? '' : ' — desligado'}</option>)}</select></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Item"><select name="categoria" className="entrada">{Object.entries(CAT_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                <Campo rotulo="Valor (R$)"><input name="valor" required inputMode="decimal" className="entrada" placeholder="0,00" /></Campo>
                <Campo rotulo="Pagar a"><select name="destino" className="entrada"><option value="">Automático</option><option value="empresa">Empresa</option><option value="funcionario">Funcionário</option></select></Campo>
                <Campo rotulo="Obra"><select name="obra_id" className="entrada"><option value="">Do funcionário</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select></Campo>
              </div>
              <Campo rotulo="Descrição"><input name="descricao" className="entrada" placeholder="Ex.: 1 falta descontada" /></Campo>
              <Botao variante="secundario">Incluir</Botao>
            </FormAcao>
          </Cartao>)}
        <Cartao titulo="Andamento">
          <div className="space-y-4 text-sm">
            <p className="text-concreto-600">Criado {dataHora(p.criado_em)}{p.criado_nome && ` por ${p.criado_nome}`}.{p.fechado_em && ` Fechado em ${dataHora(p.fechado_em)}.`}{p.motivo_cancelamento && ` Cancelado: ${p.motivo_cancelamento}`}</p>
            {editavel && rh && itens.length > 0 && (
              <FormAcao acao={fecharPagamento}><input type="hidden" name="id" value={p.id} />
                <Botao>Fechar e lançar no financeiro</Botao>
                <p className="mt-1 text-xs text-concreto-500">Cria as contas a pagar: uma por empresa (folha + taxa) e uma por obra para os pagamentos aos funcionários.</p></FormAcao>)}
            {p.status === 'fechado' && (
              <FormAcao acao={quitarPagamento} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
                <Campo rotulo="Pago em"><input type="date" name="data" required defaultValue={p.data_pagamento <= hojeISO() ? p.data_pagamento : hojeISO()} max={hojeISO()} className="entrada w-auto" /></Campo>
                <Botao variante="sucesso">Marcar como pago</Botao></FormAcao>)}
            {p.status === 'fechado' && rh && (
              <FormAcao acao={reabrirPagamento} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
                <Campo rotulo="Reabrir para ajuste — motivo"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                <Botao variante="secundario">Reabrir</Botao></FormAcao>)}
            {(p.status === 'rascunho' || p.status === 'fechado') && rh && (
              <FormAcao acao={cancelarPagamento} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={p.id} />
                <Campo rotulo="Cancelar — motivo"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                <Botao variante="perigo">Cancelar</Botao></FormAcao>)}
            {lancs && lancs.length > 0 && (
              <div><div className="mb-1 font-semibold">No financeiro</div>
                <ul className="space-y-1">{lancs.map((l) => (
                  <li key={l.id}><Link className="link" href={`/financeiro/lancamentos/${l.id}`}>{l.favorecido ?? l.descricao}</Link>{(l.obras as unknown as { codigo: string } | null)?.codigo && ` • ${(l.obras as unknown as { codigo: string }).codigo}`} — <span className="font-mono">{reais(l.valor)}</span> <span className="text-xs text-concreto-500">({l.status === 'liquidado' ? 'pago' : l.status === 'cancelado' ? 'cancelado' : 'a pagar'})</span></li>))}</ul></div>)}
          </div>
        </Cartao>
      </div>
    </>
  );
}
