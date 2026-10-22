import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Selo } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { Botao, FormAcao } from '@/components/formulario';
import { STATUS_BM, codBM, codLanc, reais, situacaoLanc, CATEGORIAS_FIN } from '@/lib/dominio';
import { data, dataHora, hojeISO, num } from '@/lib/formato';
import { aprovarBM, cancelarBM } from '../../acoes';

export const metadata = { title: 'Boletim de medição' };
const pct = (v: number) => `${num(v, 1)}%`;

export default async function BM({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: b } = await supabase.from('boletins_medicao').select('*, obras(id, codigo, nome, cliente, endereco, valor_contrato), criador:criado_por(nome), aprovador:aprovado_por(nome)').eq('id', id).maybeSingle();
  if (!b) notFound();
  const [{ data: itens }, { data: lancs }, { data: plan }] = await Promise.all([
    supabase.from('bm_itens').select('*, planilha_itens(ordem, codigo, descricao, unidade)').eq('bm_id', id),
    supabase.from('lancamentos').select('id, numero, tipo, categoria, valor, vencimento, status').eq('bm_id', id).order('numero'),
    supabase.from('planilhas').select('valor_total').eq('obra_id', b.obra_id).eq('ativa', true).maybeSingle(),
  ]);
  const o = b.obras as unknown as { id: string; codigo: string; nome: string; cliente: string | null; endereco: string | null; valor_contrato: number | null };
  type It = { planilha_item_id: string; quantidade: number; quantidade_anterior: number; quantidade_contratada: number | null; preco_unitario: number; valor: number; planilha_itens: { ordem: number; codigo: string | null; descricao: string; unidade: string | null } };
  const its = ((itens ?? []) as unknown as It[]).sort((a, z) => a.planilha_itens.ordem - z.planilha_itens.ordem);
  const hoje = hojeISO();
  const contrato = Number(o.valor_contrato ?? plan?.valor_total ?? 0);
  const { data: anteriores } = await supabase.from('boletins_medicao').select('valor_bruto').eq('obra_id', b.obra_id).eq('status', 'aprovado').lt('numero', b.numero);
  const acumAnterior = (anteriores ?? []).reduce((s, x) => s + Number(x.valor_bruto), 0);
  const finGestor = ['admin', 'financeiro'].includes(perfil.papel);

  return (
    <>
      <Cabecalho titulo={`${codBM(b.numero)} — ${o.codigo}`} sub={<Selo cor={STATUS_BM[b.status].cor}>{STATUS_BM[b.status].rotulo}</Selo>} acoes={<BotaoImprimir />} />
      {finGestor && <AbasFinanceiro atual="bm" />}
      <div className="mb-4 rounded-lg border border-concreto-200 bg-white p-4 text-sm">
        <div className="mb-2 text-base font-bold">BOLETIM DE MEDIÇÃO Nº {String(b.numero).padStart(2, '0')}</div>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><span className="text-concreto-500">Obra:</span> <b>{o.codigo} — {o.nome}</b></div>
          <div><span className="text-concreto-500">Contratante:</span> {o.cliente ?? '—'}</div>
          <div><span className="text-concreto-500">Endereço:</span> {o.endereco ?? '—'}</div>
          <div><span className="text-concreto-500">Período:</span> {data(b.periodo_inicio)} a {data(b.periodo_fim)}</div>
          <div><span className="text-concreto-500">Valor do contrato:</span> {contrato ? reais(contrato) : '—'}</div>
          <div><span className="text-concreto-500">Emitido:</span> {dataHora(b.criado_em)} por {(b.criador as unknown as { nome: string })?.nome}</div>
          {b.nf_numero && <div><span className="text-concreto-500">Nota fiscal:</span> {b.nf_numero}</div>}
          {b.aprovado_em && <div><span className="text-concreto-500">Aprovado em:</span> {data(b.aprovado_em)} por {(b.aprovador as unknown as { nome: string })?.nome}</div>}
        </div>
        {b.observacoes && <p className="mt-2 text-concreto-600">{b.observacoes}</p>}
        {b.status === 'cancelado' && <p className="mt-2 font-semibold text-atraso-700">Cancelado: {b.cancelado_motivo}</p>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela whitespace-nowrap text-xs sm:text-sm">
        <thead><tr><th>Item</th><th>Descrição</th><th>Un</th><th className="text-right">Contratado</th><th className="text-right">Acum. anterior</th><th className="text-right">Este período</th><th className="text-right">Acumulado</th><th className="text-right">% exec.</th><th className="text-right">Preço unit.</th><th className="text-right">Valor do período</th></tr></thead>
        <tbody>{its.map((i) => {
          const acum = Number(i.quantidade_anterior) + Number(i.quantidade);
          const p = i.quantidade_contratada ? (acum / Number(i.quantidade_contratada)) * 100 : 0;
          return (
            <tr key={i.planilha_item_id}>
              <td className="font-mono">{i.planilha_itens.codigo}</td>
              <td className="max-w-[320px] whitespace-normal">{i.planilha_itens.descricao}</td>
              <td>{i.planilha_itens.unidade}</td>
              <td className="text-right font-mono">{num(i.quantidade_contratada)}</td>
              <td className="text-right font-mono">{num(i.quantidade_anterior)}</td>
              <td className="text-right font-mono font-semibold">{num(i.quantidade)}</td>
              <td className="text-right font-mono">{num(acum)}</td>
              <td className={`text-right font-mono ${p > 100 ? 'font-bold text-atraso-700' : ''}`} title={p > 100 ? 'Acima do contratado — verificar aditivo' : ''}>{pct(p)}</td>
              <td className="text-right font-mono">{reais(i.preco_unitario)}</td>
              <td className="text-right font-mono font-semibold">{reais(i.valor)}</td>
            </tr>);
        })}</tbody>
      </table></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Resumo financeiro">
          <table className="w-full text-sm"><tbody>
            <tr><td className="py-1">Valor bruto da medição</td><td className="text-right font-mono font-bold">{reais(b.valor_bruto)}</td></tr>
            <tr className="text-atraso-700"><td className="py-1">(−) ISS retido ({pct(Number(b.iss_pct))})</td><td className="text-right font-mono">{reais(b.iss_valor)}</td></tr>
            <tr className="text-atraso-700"><td className="py-1">(−) INSS retido ({pct(Number(b.inss_pct))} sobre {pct(Number(b.base_mao_obra_pct))} de mão de obra)</td><td className="text-right font-mono">{reais(b.inss_valor)}</td></tr>
            <tr className="text-atraso-700"><td className="py-1">(−) Retenção técnica / caução ({pct(Number(b.retencao_tecnica_pct))})</td><td className="text-right font-mono">{reais(b.retencao_tecnica_valor)}</td></tr>
            {Number(b.outras_retencoes) > 0 && <tr className="text-atraso-700"><td className="py-1">(−) Outras retenções</td><td className="text-right font-mono">{reais(b.outras_retencoes)}</td></tr>}
            <tr className="border-t border-concreto-300 text-base"><td className="py-2 font-bold">Valor líquido a receber</td><td className="text-right font-mono font-bold text-ok-700">{reais(b.valor_liquido)}</td></tr>
            <tr className="text-concreto-500"><td className="py-1">Medido acumulado (com este BM)</td><td className="text-right font-mono">{reais(acumAnterior + Number(b.valor_bruto))}{contrato > 0 && ` • ${pct(((acumAnterior + Number(b.valor_bruto)) / contrato) * 100)} do contrato`}</td></tr>
          </tbody></table>
          {!!lancs?.length && (
            <div className="nao-imprimir mt-4 border-t border-concreto-200 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase text-concreto-500">Lançamentos gerados</div>
              {lancs.map((l) => { const s = situacaoLanc(l, hoje); return (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  {finGestor ? <Link className="link" href={`/financeiro/lancamentos/${l.id}`}>{codLanc(l.numero)} {CATEGORIAS_FIN[l.categoria]}</Link> : <span>{CATEGORIAS_FIN[l.categoria]}</span>}
                  <span className="font-mono">{reais(l.valor)} • {data(l.vencimento)} <Selo cor={s.cor}>{s.rotulo}</Selo></span></div>); })}
            </div>)}
        </Cartao>
        <div className="nao-imprimir space-y-5">
          {b.status === 'aberto' && finGestor && (
            <Cartao titulo="Aprovar medição">
              <FormAcao acao={aprovarBM} className="space-y-3"><input type="hidden" name="id" value={b.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Data da aprovação"><input type="date" name="data" required defaultValue={hoje} max={hoje} className="entrada" /></Campo>
                  <Campo rotulo="Nº da nota fiscal"><input name="nf" className="entrada" /></Campo>
                </div>
                <Campo rotulo="Outras retenções (R$)" dica="Multas, descontos acordados — opcional"><input name="outras" inputMode="decimal" className="entrada" /></Campo>
                <Botao variante="sucesso">Aprovar e gerar contas a receber</Botao>
              </FormAcao>
            </Cartao>)}
          {b.status !== 'cancelado' && (b.status === 'aberto' || perfil.papel === 'admin') && (
            <Cartao titulo="Cancelar boletim">
              <FormAcao acao={cancelarBM} className="space-y-3"><input type="hidden" name="id" value={b.id} />
                <Campo rotulo="Motivo"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                <Botao variante="perigo">Cancelar</Botao>
              </FormAcao>
              <p className="mt-2 text-xs text-concreto-500">As execuções voltam a ficar disponíveis para uma nova medição.</p>
            </Cartao>)}
        </div>
      </div>
      <div className="so-imprimir mt-20 grid grid-cols-2 gap-16 text-center text-sm">
        <div className="border-t border-concreto-800 pt-1">Contratada<br />Responsável técnico</div>
        <div className="border-t border-concreto-800 pt-1">Contratante<br />Fiscal da obra</div>
      </div>
    </>
  );
}
