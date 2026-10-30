import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, LinkBotao, Selo, Vazio } from '@/components/ui';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { STATUS_COTACAO, codCot, reais } from '@/lib/dominio';
import { dataHora } from '@/lib/formato';

export const metadata = { title: 'Cotações' };

export default async function Cotacoes({ searchParams }: { searchParams: Promise<{ status?: string; excluidas?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'compras', 'financeiro', 'almoxarifado', 'engenheiro');
  let q = supabase.from('v_cotacoes').select('*').order('criado_em', { ascending: false }).limit(200);
  if (sp.status) q = q.eq('status', sp.status);
  const [{ data: lista }, { count: pendentes }, { data: excl }] = await Promise.all([
    q, supabase.from('solicitacao_itens').select('id', { count: 'exact', head: true }).eq('status', 'em_cotacao').is('cotacao_id', null),
    supabase.from('cotacoes_excluidas').select('cotacao_id'),
  ]);
  const excluidas = new Set((excl ?? []).map((e) => e.cotacao_id));
  const verExcluidas = sp.excluidas === '1';
  const todas = (lista ?? []).filter((c) => verExcluidas ? excluidas.has(c.id) : !excluidas.has(c.id));
  return (
    <>
      <Cabecalho titulo="Cotações" sub="Comprador cota com fornecedores → diretoria aprova → ordem de compra é gerada."
        acoes={(perfil.papel === 'compras' || perfil.papel === 'admin') && <LinkBotao href="/suprimentos/cotacoes/nova">+ Nova cotação</LinkBotao>} />
      <AbasSuprimentos atual="cotacoes" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Itens aguardando cotação" valor={pendentes ?? 0} tom={pendentes ? 'sinal' : 'ok'} href="/suprimentos/cotacoes/nova" />
        <Indicador rotulo="Em cotação" valor={todas.filter((c) => c.status === 'em_cotacao').length} href="/suprimentos/cotacoes?status=em_cotacao" />
        <Indicador rotulo="Aguardando diretoria" valor={todas.filter((c) => c.status === 'aguardando_aprovacao').length} tom="sinal" href="/suprimentos/cotacoes?status=aguardando_aprovacao" />
        <Indicador rotulo="Aprovadas" valor={todas.filter((c) => c.status === 'aprovada').length} tom="ok" href="/suprimentos/cotacoes?status=aprovada" />
      </div>
      <p className="mb-2 text-right text-xs">{verExcluidas
        ? <Link href="/suprimentos/cotacoes" className="link">← voltar às cotações</Link>
        : excluidas.size > 0 && <Link href="/suprimentos/cotacoes?excluidas=1" className="link">ver excluídas ({excluidas.size})</Link>}</p>
      {!todas.length ? <Vazio>{verExcluidas ? 'Nenhuma cotação excluída.' : 'Nenhuma cotação.'}</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Obra</th><th>Itens</th><th>Propostas</th><th>Escolhida</th><th className="text-right">Valor</th><th>Status</th><th>Criada</th></tr></thead>
            <tbody>{todas.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/suprimentos/cotacoes/${c.id}`} className="link font-mono">{codCot(c.numero)}</Link></td>
                <td className="text-xs">{c.obra_codigo ?? 'Depósito central'}</td>
                <td className="font-mono">{c.total_itens}</td>
                <td className="font-mono">{c.total_propostas}</td>
                <td className="text-xs">{c.fornecedor_escolhido ?? '—'}</td>
                <td className="text-right font-mono">{reais(c.valor_escolhido ?? c.menor_valor)}</td>
                <td>{excluidas.has(c.id) ? <Selo cor="bg-atraso-50 text-atraso-700">Excluída</Selo> : <Selo cor={STATUS_COTACAO[c.status].cor}>{STATUS_COTACAO[c.status].rotulo}</Selo>}</td>
                <td className="whitespace-nowrap text-xs">{dataHora(c.criado_em)} • {c.comprador_nome}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
