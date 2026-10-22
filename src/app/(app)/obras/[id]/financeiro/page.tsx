import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasObra } from '@/components/AbasObra';
import { GraficoFluxo } from '@/components/GraficoFluxo';
import { FormLancamento } from '@/components/FormLancamento';
import { Botao, FormAcao } from '@/components/formulario';
import { CATEGORIAS_DESPESA, CATEGORIAS_FIN, STATUS_BM, codBM, reais, situacaoLanc } from '@/lib/dominio';
import { fluxoMensal, type Lanc } from '@/lib/fluxo';
import { data, dataHora, hojeISO, num } from '@/lib/formato';
import { salvarContrato } from '@/app/(app)/financeiro/acoes';

export const metadata = { title: 'Financeiro da obra' };

export default async function FinanceiroObra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  if (!['admin', 'financeiro', 'engenheiro'].includes(perfil.papel)) redirect(`/obras/${id}`);
  const hoje = hojeISO();
  const [{ data: obra }, { data: resumo }, { data: lancs }, { data: bms }, { data: forn }] = await Promise.all([
    supabase.from('obras').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_financeiro_obras').select('*').eq('id', id).maybeSingle(),
    supabase.from('lancamentos').select('*').eq('obra_id', id).neq('status', 'cancelado').order('vencimento', { ascending: false }).limit(2000),
    supabase.from('boletins_medicao').select('id, numero, periodo_inicio, periodo_fim, valor_bruto, valor_liquido, status').eq('obra_id', id).order('numero', { ascending: false }),
    supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome'),
  ]);
  if (!obra || !resumo) notFound();
  const edita = ['admin', 'financeiro'].includes(perfil.papel);
  const l = (lancs ?? []) as (Lanc & { id: string; descricao: string; numero: number })[];
  const contrato = Number(obra.valor_contrato ?? resumo.valor_planilha ?? 0);
  const custoTotal = Number(resumo.pago) + Number(resumo.a_pagar);
  const orc = Number(obra.orcamento_custo ?? 0);
  const custoCat = new Map<string, number>();
  l.filter((x) => x.tipo === 'despesa').forEach((x) => custoCat.set(x.categoria, (custoCat.get(x.categoria) ?? 0) + Number(x.status === 'liquidado' ? x.valor_liquidado : x.valor)));
  const medidoPct = contrato ? (Number(resumo.medido_aprovado) / contrato) * 100 : 0;
  const custoPct = orc ? (custoTotal / orc) * 100 : 0;
  const v = (k: string) => String(obra[k] ?? '').replace('.', ',');

  return (
    <>
      <Cabecalho titulo={`${obra.codigo} — ${obra.nome}`} sub="Financeiro da obra" />
      <AbasObra id={id} atual="financeiro" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador rotulo="Contrato" valor={contrato ? reais(contrato) : '—'} detalhe={obra.valor_contrato ? undefined : resumo.valor_planilha ? 'valor da planilha' : 'não informado'} />
        <Indicador rotulo="Medido (aprovado)" valor={reais(resumo.medido_aprovado)} detalhe={contrato ? `${num(medidoPct, 1)}% do contrato` : undefined} tom="sinal" />
        <Indicador rotulo="Recebido" valor={reais(resumo.recebido)} tom="ok" detalhe={`a receber ${reais(resumo.a_receber)}`} />
        <Indicador rotulo="Custo (pago + a pagar)" valor={reais(custoTotal)} detalhe={orc ? `${num(custoPct, 1)}% do orçamento de custo` : `pago ${reais(resumo.pago)}`} tom={orc && custoPct > medidoPct + 10 ? 'atraso' : 'neutro'} />
        <Indicador rotulo="Caixa da obra" valor={reais(Number(resumo.recebido) - Number(resumo.pago))} tom={Number(resumo.recebido) - Number(resumo.pago) < 0 ? 'atraso' : 'ok'} detalhe="recebido − pago" />
      </div>
      {orc > 0 && contrato > 0 && (
        <Cartao titulo="Medido × custo" className="mb-5">
          <div className="space-y-3 text-sm">
            <div><div className="flex justify-between"><span>Faturamento medido</span><span className="font-mono">{num(medidoPct, 1)}%</span></div><div className="mt-1 h-3 rounded bg-concreto-100"><div className="h-3 rounded bg-ok-500" style={{ width: `${Math.min(100, medidoPct)}%` }} /></div></div>
            <div><div className="flex justify-between"><span>Custo consumido do orçamento</span><span className="font-mono">{num(custoPct, 1)}%</span></div><div className="mt-1 h-3 rounded bg-concreto-100"><div className={`h-3 rounded ${custoPct > medidoPct + 10 ? 'bg-atraso-500' : 'bg-sinal-500'}`} style={{ width: `${Math.min(100, custoPct)}%` }} /></div></div>
            {custoPct > medidoPct + 10 && <p className="text-atraso-700">⚠ O custo está avançando mais rápido que o faturamento — verifique a margem da obra.</p>}
          </div>
        </Cartao>)}
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Fluxo de caixa da obra" className="lg:col-span-2">
          {!l.length ? <Vazio>Sem lançamentos nesta obra.</Vazio> : <GraficoFluxo meses={fluxoMensal(l, hoje)} hoje={hoje} />}
        </Cartao>
        <Cartao titulo="Custo por categoria">
          {!custoCat.size ? <Vazio>Sem custos.</Vazio> : <table className="tabela"><tbody>{[...custoCat].sort((a, b) => b[1] - a[1]).map(([c, val]) => <tr key={c}><td>{CATEGORIAS_DESPESA[c]}</td><td className="text-right font-mono">{reais(val)}</td></tr>)}</tbody></table>}
        </Cartao>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Medições" acoes={<Link className="link text-sm" href="/financeiro/medicoes">Gerar BM</Link>}>
          {!bms?.length ? <Vazio>Nenhuma medição.</Vazio> : <table className="tabela"><tbody>{bms.map((b) => <tr key={b.id}><td><Link className="link font-mono" href={`/financeiro/medicoes/${b.id}`}>{codBM(b.numero)}</Link><div className="text-xs text-concreto-500">{data(b.periodo_inicio)} a {data(b.periodo_fim)}</div></td><td className="text-right font-mono">{reais(b.valor_bruto)}<div><Selo cor={STATUS_BM[b.status].cor}>{STATUS_BM[b.status].rotulo}</Selo></div></td></tr>)}</tbody></table>}
        </Cartao>
        <Cartao titulo="Últimos lançamentos" className="lg:col-span-2">
          {!l.length ? <Vazio>Sem lançamentos.</Vazio> : <div className="overflow-x-auto"><table className="tabela"><tbody>{l.slice(0, 15).map((x) => { const s = situacaoLanc(x, hoje); return (
            <tr key={x.id}><td className="whitespace-nowrap font-mono text-sm">{data(x.vencimento)}</td><td>{edita ? <Link className="link" href={`/financeiro/lancamentos/${x.id}`}>{x.descricao}</Link> : x.descricao}<div className="text-xs text-concreto-500">{CATEGORIAS_FIN[x.categoria]}</div></td>
              <td className={`whitespace-nowrap text-right font-mono ${x.tipo === 'receita' ? 'text-ok-700' : 'text-atraso-700'}`}>{x.tipo === 'receita' ? '+' : '−'}{reais(x.valor)}</td><td><Selo cor={s.cor}>{s.rotulo}</Selo></td></tr>); })}</tbody></table></div>}
        </Cartao>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Contrato e retenções">
          {!obra.contrato_conferido_em && <p className="mb-3 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">Confira os percentuais abaixo com o contrato antes de gerar a primeira medição (os valores iniciais são padrões comuns, não do seu contrato).</p>}
          <FormAcao acao={salvarContrato} className="space-y-3">
            <input type="hidden" name="obra_id" value={id} />
            <fieldset disabled={!edita} className="grid grid-cols-2 gap-3">
              <Campo rotulo="Valor do contrato (R$)"><input name="valor_contrato" defaultValue={v('valor_contrato')} inputMode="decimal" className="entrada" /></Campo>
              <Campo rotulo="Orçamento de custo (R$)" dica="Meta de custo da obra"><input name="orcamento_custo" defaultValue={v('orcamento_custo')} inputMode="decimal" className="entrada" /></Campo>
              <Campo rotulo="ISS retido (%)"><input name="iss_pct" defaultValue={v('iss_pct')} className="entrada" /></Campo>
              <Campo rotulo="INSS retido (%)" dica="11% ou 3,5% (desoneração)"><input name="inss_ret_pct" defaultValue={v('inss_ret_pct')} className="entrada" /></Campo>
              <Campo rotulo="Base de mão de obra (%)" dica="Parte da NF sujeita ao INSS"><input name="base_mao_obra_pct" defaultValue={v('base_mao_obra_pct')} className="entrada" /></Campo>
              <Campo rotulo="Retenção técnica (%)"><input name="retencao_tecnica_pct" defaultValue={v('retencao_tecnica_pct')} className="entrada" /></Campo>
              <Campo rotulo="Impostos s/ faturamento (%)" dica="PIS, COFINS, IR, CSLL ou Simples"><input name="impostos_faturamento_pct" defaultValue={v('impostos_faturamento_pct')} className="entrada" /></Campo>
              <Campo rotulo="Prazo de recebimento (dias)"><input name="prazo_recebimento_dias" defaultValue={v('prazo_recebimento_dias')} className="entrada" /></Campo>
            </fieldset>
            {edita && <Botao>Salvar contrato</Botao>}
            {obra.contrato_conferido_em && <p className="text-xs text-concreto-500">Conferido em {dataHora(obra.contrato_conferido_em)}.</p>}
          </FormAcao>
        </Cartao>
        {edita && <Cartao titulo="Lançar despesa ou receita desta obra"><FormLancamento obras={[]} fornecedores={forn ?? []} hoje={hoje} obraFixa={id} /></Cartao>}
      </div>
    </>
  );
}
