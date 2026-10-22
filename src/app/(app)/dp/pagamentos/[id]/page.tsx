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
import { cancelarPagamento, fecharPagamento, gerarLinhas, quitarPagamento, reabrirPagamento, removerItem, salvarItem } from '../acoes';
import { BENEFICIO, CAT_PAG, STATUS_PAG, TIPO_PAG } from '../comum';

export const metadata = { title: 'Pagamento' };

type Item = {
  id: number; categoria: string; destino: 'empresa' | 'funcionario'; descricao: string; valor: number; funcionario_id: string | null;
  empregador_id: string | null; funcionarios: { nome: string; matricula: string; ativo: boolean; funcoes: { nome: string } | null } | null;
  empregadores: { nome: string; tipo: string } | null; obras: { codigo: string } | null;
};
const n = (v: unknown) => Number(v ?? 0);

export default async function Pagamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const [{ data: p }, { data: itensBrutos }, { data: lancs }, { data: funcs }, { data: obras }] = await Promise.all([
    supabase.from('v_pagamentos').select('*').eq('id', id).maybeSingle(),
    supabase.from('pagamento_itens').select('id, categoria, destino, descricao, valor, funcionario_id, empregador_id, funcionarios(nome, matricula, ativo, funcoes(nome)), empregadores(nome, tipo), obras(codigo)')
      .eq('pagamento_id', id).eq('removido', false).order('id'),
    supabase.from('lancamentos').select('id, numero, descricao, valor, status, favorecido, obras(codigo)').eq('pagamento_id', id).order('numero'),
    supabase.from('funcionarios').select('id, nome, ativo, empregadores(nome)').order('nome'),
    supabase.from('obras').select('id, codigo').order('codigo'),
  ]);
  if (!p) notFound();
  const itens = (itensBrutos ?? []) as unknown as Item[];
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
      <Cabecalho titulo={p.titulo}
        sub={<><Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo> <span className="ml-1">{TIPO_PAG[p.tipo]} • pagamento em {data(p.data_pagamento)}{p.periodo_inicio && p.periodo_fim && ` • passagens/alimentação de ${data(p.periodo_inicio)} a ${data(p.periodo_fim)}`}</span></>}
        acoes={<div className="flex gap-2"><BaixarCSV nome={`pagamento-${p.data_pagamento}`} cabecalho={['Empresa', 'Funcionário', 'Item', 'Pagar a', 'Obra', 'Descrição', 'Valor']} linhas={csv} /><BotaoImprimir /></div>} />
      <AbasDP atual="pag" />
      <p className="nao-imprimir mb-3 text-sm"><Link className="link" href="/dp/pagamentos">← Todos os pagamentos</Link></p>

      <div className="mb-5 rounded-lg border border-sinal-400 bg-sinal-50 p-4">
        <div className="text-sm font-semibold text-sinal-700">Total {p.status === 'pago' ? `pago em ${data(p.pago_em)}` : `a pagar em ${data(p.data_pagamento)}`}</div>
        <div className="font-mono text-3xl font-bold text-sinal-700">{reais(p.total)}</div>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Pagar às empresas" valor={reais(p.total_empresas)} detalhe="folha + taxa (e o valor da Mundial/A2)" />
        <Indicador rotulo="Passagens e alimentação" valor={reais(p.total_beneficios)} detalhe="transferir aos funcionários" />
        <Indicador rotulo="Pagar a pessoas" valor={reais(p.total_pessoas)} detalhe="equipe direta (CAD)" />
      </div>
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
        <div className="space-y-5">
          {lista.map((g) => {
            const empresa = g.itens.filter((i) => i.destino === 'empresa').reduce((t, i) => t + n(i.valor), 0);
            const benef = g.itens.filter((i) => i.destino === 'funcionario' && BENEFICIO.includes(i.categoria)).reduce((t, i) => t + n(i.valor), 0);
            const pessoas = g.itens.filter((i) => i.destino === 'funcionario' && !BENEFICIO.includes(i.categoria)).reduce((t, i) => t + n(i.valor), 0);
            const porFunc = new Map<string, { nome: string; sub: string; pag: number; pass: number; alim: number; desc: string[] }>();
            for (const i of g.itens.filter((x) => x.funcionario_id)) {
              const f = porFunc.get(i.funcionario_id!) ?? { nome: i.funcionarios?.nome ?? '—', sub: [i.funcionarios?.funcoes?.nome, i.obras?.codigo, i.funcionarios && !i.funcionarios.ativo ? 'desligado' : null].filter(Boolean).join(' • '), pag: 0, pass: 0, alim: 0, desc: [] };
              if (i.categoria === 'passagem') f.pass += n(i.valor); else if (i.categoria === 'alimentacao') f.alim += n(i.valor); else { f.pag += n(i.valor); f.desc.push(i.descricao); }
              porFunc.set(i.funcionario_id!, f);
            }
            const semFunc = g.itens.filter((i) => !i.funcionario_id);
            return (
              <Cartao key={g.nome} titulo={<span>{g.nome} <span className="font-mono text-sinal-700">{reais(empresa + benef + pessoas)}</span></span>}>
                <div className="mb-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  {empresa !== 0 && <div className="rounded-md bg-concreto-50 p-2">1 · Pagar à empresa<div className="font-mono font-bold">{reais(empresa)}</div></div>}
                  {pessoas !== 0 && <div className="rounded-md bg-concreto-50 p-2">Pagar ao funcionário<div className="font-mono font-bold">{reais(pessoas)}</div></div>}
                  {benef !== 0 && <div className="rounded-md bg-concreto-50 p-2">{empresa !== 0 ? '2 · ' : ''}Passagens e alimentação<div className="font-mono font-bold">{reais(benef)}</div></div>}
                </div>
                <div className="overflow-x-auto"><table className="tabela">
                  <thead><tr><th>Funcionário</th><th className="text-right">Salário</th><th className="text-right">Passagens</th><th className="text-right">Alimentação</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {[...porFunc.values()].map((f) => (
                      <tr key={f.nome}><td><b>{f.nome}</b><div className="text-xs text-concreto-500">{f.sub}</div>{f.desc.map((d, k) => <div key={k} className="text-xs text-concreto-500">{d}</div>)}</td>
                        <td className="whitespace-nowrap text-right font-mono">{f.pag ? reais(f.pag) : '—'}</td><td className="whitespace-nowrap text-right font-mono">{f.pass ? reais(f.pass) : '—'}</td>
                        <td className="whitespace-nowrap text-right font-mono">{f.alim ? reais(f.alim) : '—'}</td><td className="whitespace-nowrap text-right font-mono font-semibold">{reais(f.pag + f.pass + f.alim)}</td></tr>))}
                    {semFunc.map((i) => (
                      <tr key={i.id}><td><b>{CAT_PAG[i.categoria]}</b><div className="text-xs text-concreto-500">{i.descricao}</div></td><td className="whitespace-nowrap text-right font-mono">{reais(i.valor)}</td><td /><td /><td className="whitespace-nowrap text-right font-mono font-semibold">{reais(i.valor)}</td></tr>))}
                  </tbody>
                </table></div>
                {editavel && rh && (
                  <details className="nao-imprimir mt-3"><summary className="cursor-pointer text-sm font-semibold text-concreto-600">Ajustar linhas ({g.itens.length})</summary>
                    <ul className="mt-2 divide-y divide-concreto-100 text-sm">
                      {g.itens.map((i) => (
                        <li key={i.id} className="flex items-center gap-2 py-1.5">
                          <span className="min-w-0 flex-1">{i.funcionarios?.nome ?? CAT_PAG[i.categoria]} — <span className="text-concreto-500">{CAT_PAG[i.categoria]} • {i.destino === 'empresa' ? 'empresa' : 'funcionário'} • {i.descricao}</span></span>
                          <span className="font-mono">{reais(i.valor)}</span>
                          <FormAcao acao={removerItem}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="item" value={i.id} /><Botao variante="secundario" className="!px-2 !py-1 text-xs">Retirar</Botao></FormAcao>
                        </li>))}
                    </ul>
                  </details>)}
              </Cartao>);
          })}
        </div>)}

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
