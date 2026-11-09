import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { FormNota } from '@/components/FormNota';
import { BaixarCSV } from '@/components/BaixarCSV';
import { FormAcao, Botao } from '@/components/formulario';
import { CATEGORIAS_DESPESA, reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { cancelarNota, novaCategoriaNota } from './acoes';

export const metadata = { title: 'Notas e despesas' };
type F = { mes?: string; obra?: string; cat?: string; canceladas?: string };

export default async function Notas({ searchParams }: { searchParams: Promise<F> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'financeiro', 'compras');
  const hoje = hojeISO();
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const [a, m] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  let q = supabase.from('v_notas_despesa').select('*').gte('data_nota', `${mes}-01`).lte('data_nota', fim)
    .order('data_nota', { ascending: false }).order('numero', { ascending: false });
  if (sp.obra) q = q.eq('obra_id', sp.obra);
  if (sp.cat) q = q.eq('categoria_id', sp.cat);
  if (!sp.canceladas) q = q.eq('status', 'ativa');
  const [{ data: lista }, { data: obras }, { data: cats }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('categorias_nota').select('id, nome, categoria_fin').eq('ativo', true).order('ordem').order('nome'),
  ]);
  const ls = lista ?? [];
  const ativas = ls.filter((n) => n.status === 'ativa');
  const total = ativas.reduce((s, n) => s + Number(n.valor), 0);
  const porCat = new Map<string, number>();
  const porObra = new Map<string, number>();
  for (const n of ativas) {
    porCat.set(n.categoria_nome, (porCat.get(n.categoria_nome) ?? 0) + Number(n.valor));
    const o = n.obra_codigo ?? 'Administração';
    porObra.set(o, (porObra.get(o) ?? 0) + Number(n.valor));
  }
  const fin = perfil.papel === 'admin' || perfil.papel === 'financeiro';

  return (
    <>
      <Cabecalho titulo="Notas e despesas"
        sub="Notas e cupons do dia a dia — materiais diversos das obras, almoços, combustível, frete… Cada nota vira uma despesa no financeiro, na obra escolhida. Não é cadastro de insumo."
        acoes={<BaixarCSV nome={`notas-${mes}`} cabecalho={['Nº', 'Data', 'Tipo', 'Obra', 'Estabelecimento', 'Descrição', 'Nº nota', 'Valor', 'Pago', 'Forma', 'Situação', 'Registrado por']}
          linhas={ls.map((n) => [n.numero, data(n.data_nota), n.categoria_nome, n.obra_codigo ?? 'Administração', n.estabelecimento, n.descricao ?? '', n.documento_numero ?? '', Number(n.valor), n.pago ? 'sim' : 'não', n.forma_pagamento ?? '', n.status, n.criado_por_nome ?? ''])} />} />
      {fin && <AbasFinanceiro atual="notas" />}
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="month" name="mes" defaultValue={mes} className="entrada w-auto" />
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select>
        <select name="cat" defaultValue={sp.cat ?? ''} className="entrada w-auto"><option value="">Todos os tipos</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="canceladas" value="1" defaultChecked={!!sp.canceladas} /> mostrar canceladas</label>
        <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Total do mês" valor={reais(total)} detalhe={`${ativas.length} nota(s)`} />
        {[...porCat.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => <Indicador key={k} rotulo={k} valor={reais(v)} />)}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {!ls.length ? <Vazio>Nenhuma nota neste mês com esses filtros.</Vazio> : (
            <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-superficie"><table className="tabela">
              <thead><tr><th>Data</th><th>Nota</th><th>Obra</th><th className="text-right">Valor</th><th /></tr></thead>
              <tbody>{ls.map((n) => (
                <tr key={n.id} className={n.status === 'cancelada' ? 'opacity-50' : ''}>
                  <td className="whitespace-nowrap font-mono text-sm">{data(n.data_nota)}</td>
                  <td><b>{n.estabelecimento}</b>{n.descricao && <span className="text-concreto-600"> — {n.descricao}</span>}
                    <div className="text-xs text-concreto-500">{n.categoria_nome}{n.documento_numero && ` • NF ${n.documento_numero}`} • {n.pago ? `pago${n.forma_pagamento ? ` (${n.forma_pagamento})` : ''}` : `vence ${data(n.vencimento)}`}{n.criado_por_nome && ` • por ${n.criado_por_nome}`}
                      {n.status === 'cancelada' && <> • <Selo cor="bg-concreto-100 text-concreto-600">cancelada</Selo> {n.motivo_cancelamento}</>}</div></td>
                  <td className="whitespace-nowrap text-xs">{n.obra_codigo ?? 'Administração'}</td>
                  <td className="whitespace-nowrap text-right font-mono font-semibold">{reais(n.valor)}</td>
                  <td className="whitespace-nowrap text-xs">
                    {fin && n.lancamento_id && <Link className="link mr-2" href={`/financeiro/lancamentos/${n.lancamento_id}`}>{n.caminho ? '📎 ' : ''}lançamento</Link>}
                    {n.status === 'ativa' && <details className="inline-block"><summary className="cursor-pointer text-atraso-700">cancelar</summary>
                      <FormAcao acao={cancelarNota} className="mt-1 flex gap-1"><input type="hidden" name="id" value={n.id} />
                        <input name="motivo" required minLength={5} placeholder="motivo" className="entrada w-40 py-1 text-xs" /><Botao variante="perigo">ok</Botao></FormAcao></details>}
                  </td>
                </tr>))}
                <tr className="bg-concreto-50 font-semibold"><td colSpan={3}>Total</td><td className="text-right font-mono">{reais(total)}</td><td /></tr>
              </tbody>
            </table></div>)}

          {porObra.size > 0 && <Cartao titulo="Por obra">
            <ul className="grid gap-1 text-sm sm:grid-cols-2">{[...porObra.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-concreto-100 py-1"><span>{k}</span><b className="font-mono">{reais(v)}</b></li>))}</ul>
          </Cartao>}
        </div>

        <div className="space-y-5">
          <Cartao titulo="Registrar nota">
            <FormNota obras={obras ?? []} categorias={(cats ?? []).map((c) => ({ id: c.id, nome: c.nome }))} hoje={hoje} />
          </Cartao>
          <Cartao titulo="Tipos de nota">
            <ul className="mb-3 space-y-0.5 text-sm">{cats?.map((c) => <li key={c.id}>{c.nome} <span className="text-xs text-concreto-500">→ {CATEGORIAS_DESPESA[c.categoria_fin]}</span></li>)}</ul>
            <details><summary className="cursor-pointer text-sm font-semibold text-sinal-700">+ novo tipo</summary>
              <FormAcao acao={novaCategoriaNota} limparAoConcluir className="mt-2 space-y-2">
                <input name="nome" required minLength={3} placeholder="ex.: Aluguel de banheiro químico" className="entrada" />
                <select name="categoria_fin" className="entrada" defaultValue="outras_despesas">
                  {['material', 'equipamentos', 'servicos_terceiros', 'administrativo', 'outras_despesas'].map((k) => <option key={k} value={k}>Entra no financeiro como: {CATEGORIAS_DESPESA[k]}</option>)}</select>
                <Botao>Criar tipo</Botao>
              </FormAcao></details>
          </Cartao>
        </div>
      </div>
    </>
  );
}
