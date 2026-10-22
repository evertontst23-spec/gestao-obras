import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Selo, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { FormLancamento } from '@/components/FormLancamento';
import { BaixarCSV } from '@/components/BaixarCSV';
import { CATEGORIAS_FIN, ORIGEM_LANC, codLanc, reais, situacaoLanc } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';

export const metadata = { title: 'Contas a pagar e receber' };
type F = { tipo?: string; situacao?: string; obra?: string; mes?: string };

export default async function Lancamentos({ searchParams }: { searchParams: Promise<F> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'financeiro');
  const hoje = hojeISO();
  const situacao = sp.situacao ?? 'abertos';
  let q = supabase.from('lancamentos').select('*, obras(codigo), fornecedores(nome)').order('vencimento').limit(1000);
  if (sp.tipo) q = q.eq('tipo', sp.tipo);
  if (sp.obra === 'adm') q = q.is('obra_id', null); else if (sp.obra) q = q.eq('obra_id', sp.obra);
  if (situacao === 'abertos') q = q.eq('status', 'aberto');
  if (situacao === 'vencidos') q = q.eq('status', 'aberto').lt('vencimento', hoje);
  if (situacao === 'liquidados') q = q.eq('status', 'liquidado');
  if (situacao === 'cancelados') q = q.eq('status', 'cancelado');
  if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
    const [a, m] = sp.mes.split('-').map(Number);
    q = q.gte('vencimento', `${sp.mes}-01`).lte('vencimento', new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10));
  }
  const [{ data: lista }, { data: obras }, { data: forn }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('codigo'), supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome'),
  ]);
  const ls = lista ?? [];
  const tot = (t: string) => ls.filter((l) => l.tipo === t && l.status !== 'cancelado').reduce((s, l) => s + Number(l.status === 'liquidado' ? l.valor_liquidado : l.valor), 0);
  const nomeObra = (l: (typeof ls)[number]) => (l.obras as unknown as { codigo: string } | null)?.codigo ?? 'Administração';

  return (
    <>
      <Cabecalho titulo="Contas a pagar e receber"
        acoes={<BaixarCSV nome={`lancamentos-${hoje}`} cabecalho={['Nº', 'Tipo', 'Categoria', 'Descrição', 'Obra', 'Fornecedor/Pagador', 'Competência', 'Vencimento', 'Valor', 'Situação', 'Baixa em', 'Valor baixado', 'Origem']}
          linhas={ls.map((l) => [codLanc(l.numero), l.tipo, CATEGORIAS_FIN[l.categoria], l.descricao, nomeObra(l), (l.fornecedores as unknown as { nome: string } | null)?.nome ?? l.favorecido, data(l.competencia), data(l.vencimento), Number(l.valor), situacaoLanc(l, hoje).rotulo, l.liquidado_em ? data(l.liquidado_em) : '', l.valor_liquidado ? Number(l.valor_liquidado) : null, ORIGEM_LANC[l.origem]])} />} />
      <AbasFinanceiro atual="lanc" />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="tipo" defaultValue={sp.tipo ?? ''} className="entrada w-auto"><option value="">Pagar e receber</option><option value="despesa">A pagar</option><option value="receita">A receber</option></select>
        <select name="situacao" defaultValue={situacao} className="entrada w-auto"><option value="abertos">Em aberto</option><option value="vencidos">Vencidos</option><option value="liquidados">Pagos/recebidos</option><option value="cancelados">Cancelados</option><option value="todos">Todos</option></select>
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option><option value="adm">Administração central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select>
        <input type="month" name="mes" defaultValue={sp.mes ?? ''} className="entrada w-auto" title="Mês de vencimento" />
        <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {!ls.length ? <Vazio>Nenhum lançamento com esses filtros.</Vazio> : (
            <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th>Obra</th><th className="text-right">Valor</th><th>Situação</th></tr></thead>
              <tbody>{ls.map((l) => {
                const s = situacaoLanc(l, hoje);
                return (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap font-mono text-sm">{data(l.vencimento)}</td>
                    <td><Link href={`/financeiro/lancamentos/${l.id}`} className="link">{l.descricao}</Link>
                      <div className="text-xs text-concreto-500">{codLanc(l.numero)} • {CATEGORIAS_FIN[l.categoria]}{(l.fornecedores as unknown as { nome: string } | null)?.nome ? ` • ${(l.fornecedores as unknown as { nome: string }).nome}` : l.favorecido ? ` • ${l.favorecido}` : ''}{l.origem !== 'manual' && ` • via ${ORIGEM_LANC[l.origem]}`}</div></td>
                    <td className="whitespace-nowrap text-xs">{nomeObra(l)}</td>
                    <td className={`whitespace-nowrap text-right font-mono font-semibold ${l.tipo === 'receita' ? 'text-ok-700' : 'text-atraso-700'}`}>{l.tipo === 'receita' ? '+' : '−'}{reais(l.valor)}</td>
                    <td><Selo cor={s.cor}>{s.rotulo}</Selo></td>
                  </tr>);
              })}
                <tr className="bg-concreto-50 font-semibold"><td colSpan={3}>Totais da lista</td><td className="whitespace-nowrap text-right font-mono"><div className="text-ok-700">+{reais(tot('receita'))}</div><div className="text-atraso-700">−{reais(tot('despesa'))}</div></td><td /></tr>
              </tbody>
            </table></div>)}
        </div>
        <Cartao titulo="Novo lançamento">
          <FormLancamento obras={obras ?? []} fornecedores={forn ?? []} hoje={hoje} />
          <p className="mt-3 text-xs text-concreto-500">Compras (OC), folha e medições entram automaticamente — lance aqui o restante (aluguéis, terceirizados, contas da administração).</p>
        </Cartao>
      </div>
    </>
  );
}
