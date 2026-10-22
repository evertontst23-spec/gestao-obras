import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { GraficoFluxo } from '@/components/GraficoFluxo';
import { CATEGORIAS_DESPESA, reais } from '@/lib/dominio';
import { fluxoMensal, type Lanc } from '@/lib/fluxo';
import { hojeISO, somarDias } from '@/lib/formato';

export const metadata = { title: 'Financeiro' };

export default async function PainelFinanceiro() {
  const { supabase } = await exigirPapel('admin', 'financeiro');
  const hoje = hojeISO();
  const [{ data: lancs }, { data: obras }, { count: bmAbertos }] = await Promise.all([
    supabase.from('lancamentos').select('tipo, status, valor, valor_liquidado, vencimento, liquidado_em, categoria').neq('status', 'cancelado').limit(10000),
    supabase.from('v_financeiro_obras').select('*').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
    supabase.from('boletins_medicao').select('id', { count: 'exact', head: true }).eq('status', 'aberto'),
  ]);
  const l = (lancs ?? []) as Lanc[];
  const abertos = l.filter((x) => x.status === 'aberto');
  const soma = (a: Lanc[]) => a.reduce((s, x) => s + Number(x.valor), 0);
  const aPagar = abertos.filter((x) => x.tipo === 'despesa'), aReceber = abertos.filter((x) => x.tipo === 'receita');
  const vencidos = aPagar.filter((x) => x.vencimento < hoje);
  const prox7 = aPagar.filter((x) => x.vencimento >= hoje && x.vencimento <= somarDias(hoje, 7));
  const mes = hoje.slice(0, 7);
  const ano = hoje.slice(0, 4);
  const doMes = l.filter((x) => x.status === 'liquidado' && x.liquidado_em?.startsWith(mes));
  const saldoMes = doMes.reduce((s, x) => s + (x.tipo === 'receita' ? 1 : -1) * Number(x.valor_liquidado ?? x.valor), 0);
  const porCat = new Map<string, number>();
  l.filter((x) => x.tipo === 'despesa' && (x.liquidado_em ?? x.vencimento).startsWith(ano)).forEach((x) => porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + Number(x.valor_liquidado ?? x.valor)));
  const totalCat = [...porCat.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <Cabecalho titulo="Financeiro" sub="Contas a pagar e a receber de todas as obras. Compras (OC), folha e medições entram sozinhas." />
      <AbasFinanceiro atual="painel" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador rotulo="Saldo do mês (realizado)" valor={reais(saldoMes)} tom={saldoMes < 0 ? 'atraso' : 'ok'} />
        <Indicador rotulo="A receber" valor={reais(soma(aReceber))} detalhe={`${aReceber.length} título(s)`} href="/financeiro/lancamentos?tipo=receita&situacao=abertos" />
        <Indicador rotulo="A pagar" valor={reais(soma(aPagar))} detalhe={`${aPagar.length} título(s)`} href="/financeiro/lancamentos?tipo=despesa&situacao=abertos" />
        <Indicador rotulo="Pagar nos próximos 7 dias" valor={reais(soma(prox7))} tom="atencao" detalhe={`${prox7.length} título(s)`} href="/financeiro/lancamentos?tipo=despesa&situacao=abertos" />
        <Indicador rotulo="Vencidos a pagar" valor={reais(soma(vencidos))} tom={vencidos.length ? 'atraso' : 'neutro'} detalhe={`${vencidos.length} título(s)`} href="/financeiro/lancamentos?situacao=vencidos" />
      </div>
      {(bmAbertos ?? 0) > 0 && <p className="mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">⚑ {bmAbertos} medição(ões) aguardando aprovação. <Link className="link" href="/financeiro/medicoes">Ver medições</Link></p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Fluxo de caixa — últimos 6 meses e próximos 3" className="lg:col-span-2">
          {!l.length ? <Vazio>Nenhum lançamento ainda.</Vazio> : <GraficoFluxo meses={fluxoMensal(l, hoje)} hoje={hoje} />}
          <p className="mt-2 text-xs text-concreto-500">Saldo acumulado a partir do primeiro mês exibido (não considera o saldo bancário inicial). Títulos vencidos em aberto aparecem no mês atual.</p>
        </Cartao>
        <Cartao titulo={`Despesas de ${ano} por categoria`}>
          {!porCat.size ? <Vazio>Sem despesas no ano.</Vazio> : (
            <div className="space-y-2">{[...porCat].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
              <div key={c}><div className="flex justify-between text-sm"><span>{CATEGORIAS_DESPESA[c] ?? c}</span><span className="font-mono">{reais(v)}</span></div>
                <div className="mt-0.5 h-2 rounded bg-concreto-100"><div className="h-2 rounded bg-sinal-500" style={{ width: `${(v / totalCat) * 100}%` }} /></div></div>))}
            </div>)}
        </Cartao>
      </div>
      <Cartao titulo="Obras em andamento" className="mt-5">
        {!obras?.length ? <Vazio>Nenhuma obra ativa.</Vazio> : (
          <div className="overflow-x-auto"><table className="tabela whitespace-nowrap">
            <thead><tr><th>Obra</th><th className="text-right">Contrato</th><th className="text-right">Medido</th><th className="text-right">Recebido</th><th className="text-right">A receber</th><th className="text-right">Custo pago</th><th className="text-right">A pagar</th><th className="text-right">Caixa da obra</th></tr></thead>
            <tbody>{obras.map((o) => {
              const contrato = Number(o.valor_contrato ?? o.valor_planilha ?? 0);
              const caixa = Number(o.recebido) - Number(o.pago);
              return (
                <tr key={o.id}>
                  <td><Link className="link" href={`/obras/${o.id}/financeiro`}>{o.codigo}</Link><div className="text-xs text-concreto-500">{o.nome}{!o.contrato_conferido_em && ' • contrato não configurado'}</div></td>
                  <td className="text-right font-mono">{contrato ? reais(contrato) : '—'}</td>
                  <td className="text-right font-mono">{reais(o.medido_aprovado)}{contrato > 0 && <div className="text-xs text-concreto-500">{((Number(o.medido_aprovado) / contrato) * 100).toFixed(1).replace('.', ',')}%</div>}</td>
                  <td className="text-right font-mono">{reais(o.recebido)}</td><td className="text-right font-mono">{reais(o.a_receber)}</td>
                  <td className="text-right font-mono">{reais(o.pago)}</td><td className="text-right font-mono">{reais(o.a_pagar)}</td>
                  <td className={`text-right font-mono font-semibold ${caixa < 0 ? 'text-atraso-700' : 'text-ok-700'}`}>{reais(caixa)}</td>
                </tr>);
            })}</tbody>
          </table></div>)}
      </Cartao>
    </>
  );
}
