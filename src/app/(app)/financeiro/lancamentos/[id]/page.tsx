import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Info, Selo } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { FormBaixa } from '@/components/FormLancamento';
import { Botao, FormAcao } from '@/components/formulario';
import { CATEGORIAS_FIN, ORIGEM_LANC, codBM, codLanc, codOC, reais, situacaoLanc } from '@/lib/dominio';
import { data, dataHora, hojeISO } from '@/lib/formato';
import { cancelarLancamento, reprogramarLancamento } from '../../acoes';

export const metadata = { title: 'Lançamento' };

export default async function Lancamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirPapel('admin', 'financeiro');
  const { data: l } = await supabase.from('lancamentos').select('*, obras(id, codigo, nome), fornecedores(nome), ordens_compra(numero), boletins_medicao(numero), folhas(competencia), criador:criado_por(nome)').eq('id', id).maybeSingle();
  if (!l) notFound();
  const hoje = hojeISO();
  const s = situacaoLanc(l, hoje);
  const obra = l.obras as unknown as { id: string; codigo: string; nome: string } | null;
  const url = l.caminho ? (await supabase.storage.from('anexos').createSignedUrl(l.caminho, 3600)).data?.signedUrl : null;
  const oc = l.ordens_compra as unknown as { numero: number } | null, bm = l.boletins_medicao as unknown as { numero: number } | null, fol = l.folhas as unknown as { competencia: string } | null;

  return (
    <>
      <Cabecalho titulo={`${codLanc(l.numero)} — ${l.descricao}`} sub={<Selo cor={s.cor}>{s.rotulo}</Selo>} />
      <AbasFinanceiro atual="lanc" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Dados" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Info rotulo="Tipo">{l.tipo === 'receita' ? 'A receber' : 'A pagar'}</Info>
            <Info rotulo="Categoria">{CATEGORIAS_FIN[l.categoria]}</Info>
            <Info rotulo="Valor"><span className={`font-mono text-lg font-bold ${l.tipo === 'receita' ? 'text-ok-700' : 'text-atraso-700'}`}>{reais(l.valor)}</span></Info>
            <Info rotulo="Obra">{obra ? <Link className="link" href={`/obras/${obra.id}/financeiro`}>{obra.codigo} — {obra.nome}</Link> : 'Administração central'}</Info>
            <Info rotulo={l.tipo === 'receita' ? 'Pagador' : 'Fornecedor'}>{(l.fornecedores as unknown as { nome: string } | null)?.nome ?? l.favorecido ?? '—'}</Info>
            <Info rotulo="Documento">{l.documento_numero ?? '—'}</Info>
            <Info rotulo="Competência">{data(l.competencia)}</Info>
            <Info rotulo="Vencimento">{data(l.vencimento)}</Info>
            <Info rotulo="Origem">{ORIGEM_LANC[l.origem]}{oc && <> — <Link className="link" href={`/suprimentos/ordens/${l.oc_id}`}>{codOC(oc.numero)}</Link></>}{bm && <> — <Link className="link" href={`/financeiro/medicoes/${l.bm_id}`}>{codBM(bm.numero)}</Link></>}{fol && <> — <Link className="link" href={`/dp/folha?mes=${fol.competencia.slice(0, 7)}`}>folha {fol.competencia.slice(5, 7)}/{fol.competencia.slice(0, 4)}</Link></>}</Info>
            {l.status === 'liquidado' && <>
              <Info rotulo={l.tipo === 'receita' ? 'Recebido em' : 'Pago em'}>{data(l.liquidado_em)}</Info>
              <Info rotulo="Valor baixado"><span className="font-mono">{reais(l.valor_liquidado)}</span></Info>
              <Info rotulo="Forma">{l.forma_pagamento ?? '—'}</Info></>}
            {l.status === 'cancelado' && <Info rotulo="Motivo do cancelamento">{l.motivo_cancelamento}</Info>}
            <Info rotulo="Lançado">{dataHora(l.criado_em)}{(l.criador as unknown as { nome: string } | null)?.nome ? ` por ${(l.criador as unknown as { nome: string }).nome}` : ' automaticamente'}</Info>
            {url && <Info rotulo="Documento / comprovante"><a className="link" href={url} target="_blank">Abrir arquivo</a></Info>}
          </div>
        </Cartao>
        {l.status === 'aberto' && (
          <div className="space-y-5">
            <Cartao titulo={l.tipo === 'receita' ? 'Registrar recebimento' : 'Registrar pagamento'}><FormBaixa id={l.id} tipo={l.tipo} valor={Number(l.valor)} hoje={hoje} /></Cartao>
            <Cartao titulo="Alterar vencimento">
              <FormAcao acao={reprogramarLancamento} className="space-y-3"><input type="hidden" name="id" value={l.id} />
                <Campo rotulo="Novo vencimento"><input type="date" name="vencimento" required className="entrada" /></Campo>
                <Campo rotulo="Motivo"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                <Botao variante="secundario">Alterar</Botao></FormAcao>
            </Cartao>
            {l.origem !== 'oc' && l.origem !== 'bm' && (
              <Cartao titulo="Cancelar">
                <FormAcao acao={cancelarLancamento} className="space-y-3"><input type="hidden" name="id" value={l.id} />
                  <Campo rotulo="Motivo"><input name="motivo" required minLength={5} className="entrada" /></Campo>
                  <Botao variante="perigo">Cancelar lançamento</Botao></FormAcao>
              </Cartao>)}
          </div>)}
      </div>
    </>
  );
}
