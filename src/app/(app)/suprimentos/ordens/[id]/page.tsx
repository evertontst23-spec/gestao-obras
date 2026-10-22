import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, Selo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { UploadArquivo } from '@/components/UploadArquivo';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { anexarDocumentoOC, cancelarOC, liberarColeta, receberOC } from '../../acoes';
import { STATUS_OC, codOC, codSM, reais } from '@/lib/dominio';
import { data, dataHora, num } from '@/lib/formato';

const DOC: Record<string, string> = { nf: 'Nota fiscal', boleto: 'Boleto', comprovante: 'Comprovante de pagamento', outro: 'Outro' };

export default async function DetalheOC({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: o } = await supabase.from('v_ordens_compra').select('*').eq('id', id).maybeSingle();
  if (!o) notFound();
  const [{ data: itens }, { data: docs }, { data: evs }, { data: empresa }] = await Promise.all([
    supabase.from('oc_itens').select('*, solicitacao_itens(solicitacao_id, solicitacoes(numero))').eq('oc_id', id).order('descricao'),
    supabase.from('oc_documentos').select('*, perfis(nome)').eq('oc_id', id).order('criado_em'),
    supabase.from('oc_eventos').select('*, perfis(nome)').eq('oc_id', id).order('criado_em', { ascending: false }),
    supabase.from('obras').select('nome, endereco, cliente').eq('id', o.obra_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
  ]);
  const caminhos = (docs ?? []).map((d) => d.caminho).filter(Boolean) as string[];
  const { data: urls } = caminhos.length ? await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600) : { data: [] };
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  const p = perfil.papel;
  const podeDoc = ['compras', 'financeiro', 'almoxarifado', 'admin', 'engenheiro', 'encarregado'].includes(p) && o.status !== 'cancelada';
  const aReceber = ['emitida', 'pronta_coleta', 'recebida_parcial'].includes(o.status);

  return (
    <>
      <div className="nao-imprimir">
        <Cabecalho titulo={`Ordem de compra ${codOC(o.numero)}`}
          sub={<span className="flex flex-wrap items-center gap-2">{o.obra_codigo ? `${o.obra_codigo} — ${o.obra_nome}` : 'Depósito central'}
            <Selo cor={STATUS_OC[o.status].cor}>{STATUS_OC[o.status].rotulo}</Selo>
            {o.nf_divergente && <Selo cor="bg-atraso-500 text-white">NF divergente</Selo>}
            {o.entrega_atrasada && <Selo cor="bg-atraso-50 text-atraso-700">Entrega atrasada</Selo>}</span>}
          acoes={<><BotaoImprimir rotulo="🖨 Imprimir OC (vai com o retirante)" />
            {['compras', 'admin', 'financeiro'].includes(p) && <Link href={`/suprimentos/cotacoes/${o.cotacao_id}`} className="inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">Cotação {o.cotacao_codigo}</Link>}</>} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Documento da OC (também é o que sai na impressão) */}
          <section className="rounded-lg border border-concreto-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-concreto-200 pb-3">
              <div><div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-700">Ordem de compra</div>
                <div className="font-mono text-2xl font-black">{codOC(o.numero)}</div>
                <div className="text-xs text-concreto-500">Emitida em {dataHora(o.emitida_em)} • aprovada pela diretoria • {o.cotacao_codigo}</div></div>
              <div className="text-right text-sm"><b>{o.obra_nome}</b><div className="text-xs text-concreto-500">{empresa?.endereco ?? ''}</div></div>
            </div>
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info rotulo="Fornecedor">{o.fornecedor_nome}<div className="text-xs text-concreto-500">{o.fornecedor_documento} {o.fornecedor_telefone}</div></Info>
              <Info rotulo="Pagamento">{o.condicao_pagamento ?? '—'}{o.pagamento && <div className="text-xs font-semibold text-ok-700">{o.pagamento === 'pago' ? 'Pago' : 'Faturado'} {dataHora(o.pago_em)}</div>}</Info>
              <Info rotulo={o.modalidade === 'retirada' ? 'Retirada por' : 'Entrega'}>{o.modalidade === 'retirada' ? (o.retirante ?? '— a definir') : 'Fornecedor entrega na obra'}</Info>
              <Info rotulo="Previsão">{data(o.previsao_entrega)}</Info>
            </dl>
            <div className="overflow-x-auto"><table className="tabela">
              <thead><tr><th>Item</th><th className="text-right">Qtd.</th><th className="text-right">Unit.</th><th className="text-right">Total</th><th className="text-right">Recebido</th></tr></thead>
              <tbody>{(itens ?? []).map((i) => {
                const sm = (i.solicitacao_itens as unknown as { solicitacao_id: string; solicitacoes: { numero: number } } | null);
                return (
                  <tr key={i.id}>
                    <td>{i.descricao}{sm && <Link href={`/materiais/${sm.solicitacao_id}`} className="nao-imprimir ml-1 text-xs text-sinal-700">({codSM(sm.solicitacoes.numero)})</Link>}</td>
                    <td className="whitespace-nowrap text-right font-mono">{num(i.quantidade, 3)} {i.unidade}</td>
                    <td className="text-right font-mono">{reais(i.preco_unitario)}</td>
                    <td className="text-right font-mono">{reais(Number(i.preco_unitario) * Number(i.quantidade))}</td>
                    <td className={`text-right font-mono ${Number(i.quantidade_recebida) >= Number(i.quantidade) ? 'text-ok-700' : ''}`}>{num(i.quantidade_recebida, 3)}</td>
                  </tr>);
              })}
                <tr><td colSpan={3} className="text-right">Frete</td><td className="text-right font-mono">{reais(o.frete)}</td><td></td></tr>
                <tr className="font-bold"><td colSpan={3} className="text-right">TOTAL DA OC</td><td className="text-right font-mono text-lg">{reais(o.valor_total)}</td><td></td></tr>
              </tbody>
            </table></div>
            {o.nf_numero && <p className={`mt-3 rounded px-3 py-2 text-sm ${o.nf_divergente ? 'bg-atraso-50 font-semibold text-atraso-700' : 'bg-ok-50 text-ok-700'}`}>
              NF {o.nf_numero}: {reais(o.nf_valor)} {o.nf_divergente ? `— diverge da OC (${reais(o.valor_total)}). Confirmar com o fornecedor antes de pagar.` : '— confere com a OC.'}</p>}
            <div className="so-imprimir mt-10 grid grid-cols-2 gap-10 text-center text-xs">
              <div className="border-t border-concreto-800 pt-1">Retirante: {o.retirante ?? ''}</div>
              <div className="border-t border-concreto-800 pt-1">Fornecedor (carimbo e assinatura)</div>
            </div>
          </section>

          <Cartao titulo={`Documentos (${docs?.length ?? 0})`} className="nao-imprimir">
            {!docs?.length ? <p className="text-sm text-concreto-500">Nenhum documento. Anexe NF, boleto e comprovante pela câmera do celular.</p> : (
              <ul className="divide-y divide-concreto-100 text-sm">{docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><b>{DOC[d.tipo]}</b> {d.numero && `nº ${d.numero}`} {d.valor && `• ${reais(d.valor)}`} {d.vencimento && `• vence ${data(d.vencimento)}`}
                    <span className="block text-xs text-concreto-500">{(d.perfis as unknown as { nome: string })?.nome} • {dataHora(d.criado_em)}</span></span>
                  {d.caminho && url.get(d.caminho) && <a href={url.get(d.caminho) ?? undefined} target="_blank" rel="noreferrer" className="link">abrir</a>}
                </li>))}
              </ul>)}
          </Cartao>

          <Cartao titulo="Histórico" className="nao-imprimir">
            <ol className="space-y-2 border-l-2 border-concreto-200 pl-4 text-sm">{(evs ?? []).map((e) => (
              <li key={e.id}><b>{(e.perfis as unknown as { nome: string })?.nome ?? 'Sistema'}</b> — {e.descricao}<div className="text-xs text-concreto-500">{dataHora(e.criado_em)}</div></li>))}</ol>
          </Cartao>
        </div>

        <div className="nao-imprimir space-y-5">
          {o.status === 'emitida' && ['compras', 'financeiro', 'admin'].includes(p) && (
            <Cartao titulo="Pagamento / faturamento">
              <FormAcao acao={liberarColeta} className="space-y-3">
                <input type="hidden" name="oc_id" value={id} />
                <Campo rotulo="Situação"><select name="pagamento" className="entrada"><option value="pago">Pago</option><option value="faturado">Faturado (boleto)</option></select></Campo>
                {o.modalidade === 'retirada' && <Campo rotulo="Quem vai retirar *"><input name="retirante" defaultValue={o.retirante ?? ''} className="entrada" /></Campo>}
                <Campo rotulo="Nova previsão (opcional)"><input type="date" name="previsao" className="entrada" /></Campo>
                <Botao grande>{o.modalidade === 'retirada' ? 'Liberar para coleta' : 'Confirmar pagamento'}</Botao>
                <p className="text-xs text-concreto-500">Todos são avisados: almoxarifado, compras, financeiro e engenheiro da obra.</p>
              </FormAcao>
            </Cartao>)}

          {aReceber && ['almoxarifado', 'admin'].includes(p) && (
            <Cartao titulo="Recebimento na obra" className="border-2 border-ok-500">
              <FormAcao acao={receberOC} className="space-y-3">
                <input type="hidden" name="oc_id" value={id} />
                {(itens ?? []).filter((i) => Number(i.quantidade_recebida) < Number(i.quantidade)).map((i) => (
                  <div key={i.id} className="flex items-center gap-2">
                    <input type="hidden" name="oc_item_id" value={i.id} />
                    <span className="flex-1 text-sm">{i.descricao}<span className="block text-xs text-concreto-500">faltam {num(Number(i.quantidade) - Number(i.quantidade_recebida), 3)} {i.unidade}</span></span>
                    <input name="qtd" inputMode="decimal" defaultValue={Number(i.quantidade) - Number(i.quantidade_recebida)} className="entrada w-24" />
                  </div>))}
                <Campo rotulo="Observação"><input name="observacao" className="entrada" placeholder="Avarias, falta, nº do romaneio…" /></Campo>
                <Botao grande variante="sucesso">Lançar recebimento</Botao>
                <p className="text-xs text-concreto-500">Entra no estoque da obra e libera os itens para o encarregado.</p>
              </FormAcao>
            </Cartao>)}

          {podeDoc && (
            <Cartao titulo="Anexar NF / boleto / comprovante">
              <UploadArquivo pasta={`sup/oc/${id}`} acao={anexarDocumentoOC} rotuloBotao="Anexar à OC">
                <input type="hidden" name="oc_id" value={id} />
                <Campo rotulo="Tipo"><select name="tipo" className="entrada">{Object.entries(DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Número"><input name="numero" className="entrada" /></Campo>
                  <Campo rotulo="Valor (R$)"><input name="valor" inputMode="decimal" className="entrada" /></Campo>
                </div>
                <Campo rotulo="Vencimento (boleto)"><input type="date" name="vencimento" className="entrada" /></Campo>
              </UploadArquivo>
              <p className="mt-2 text-xs text-concreto-500">A NF é conferida automaticamente com o valor da OC.</p>
            </Cartao>)}

          {p === 'admin' && ['emitida', 'pronta_coleta'].includes(o.status) && (
            <details className="rounded-lg border border-concreto-200 bg-white text-sm">
              <summary className="cursor-pointer px-4 py-3 text-atraso-700">Cancelar OC</summary>
              <FormAcao acao={cancelarOC} className="flex gap-2 border-t border-concreto-100 p-4">
                <input type="hidden" name="oc_id" value={id} />
                <input name="motivo" required minLength={5} placeholder="Motivo" className="entrada flex-1" />
                <Botao variante="perigo">Cancelar</Botao>
              </FormAcao>
            </details>)}
        </div>
      </div>
    </>
  );
}
