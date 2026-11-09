import { SeloLocacao } from '@/components/Locacao';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, Selo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { UploadArquivo } from '@/components/UploadArquivo';
import { CamposDocumentoOC } from '@/components/CamposDocumentoOC';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { anexarDocumentoOC, anularDocumentoOC, cancelarOC, desfazerColetaOC, desfazerOC, registrarColetaOC, estornarRecebimentoOC, liberarColeta, receberOC, voltarPagamentoOC } from '../../acoes';
import { FORMA_PAGAMENTO, STATUS_OC, codOC, codSM, reais } from '@/lib/dominio';
import { data, dataHora, hojeISO, num } from '@/lib/formato';

const DOC: Record<string, string> = { nf: 'Nota fiscal', boleto: 'Boleto', comprovante: 'Comprovante de pagamento (PIX/transferência)', outro: 'Outro' };

export default async function DetalheOC({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: o } = await supabase.from('v_ordens_compra').select('*').eq('id', id).maybeSingle();
  if (!o) notFound();
  const [{ data: itens }, { data: docs }, { data: evs }, { data: empresa }] = await Promise.all([
    supabase.from('oc_itens').select('*, solicitacao_itens(solicitacao_id, status, modalidade, locacao_inicio, locacao_fim, solicitacoes(numero))').eq('oc_id', id).order('descricao'),
    supabase.from('oc_documentos').select('*, perfis!oc_documentos_enviado_por_fkey(nome)').eq('oc_id', id).order('criado_em'),
    supabase.from('oc_eventos').select('*, perfis(nome)').eq('oc_id', id).order('criado_em', { ascending: false }),
    supabase.from('obras').select('nome, endereco, cliente').eq('id', o.obra_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
  ]);
  const { data: col } = await supabase.from('ordens_compra').select('coletado_em, coletado_por, coleta_obs, coleta_foto, forma_pagamento').eq('id', id).maybeSingle();
  const forma: string | null = col?.forma_pagamento ?? null;
  const urlColeta = col?.coleta_foto ? (await supabase.storage.from('anexos').createSignedUrl(col.coleta_foto, 3600)).data?.signedUrl : null;
  const caminhos = (docs ?? []).map((d) => d.caminho).filter(Boolean) as string[];
  const { data: urls } = caminhos.length ? await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600) : { data: [] };
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  const p = perfil.papel;
  const podeDoc = ['compras', 'financeiro', 'almoxarifado', 'admin', 'engenheiro', 'encarregado'].includes(p) && o.status !== 'cancelada';
  const aReceber = ['emitida', 'pronta_coleta', 'recebida_parcial'].includes(o.status);
  const docsAtivos = (docs ?? []).filter((d) => !d.anulado_em), docsExcluidos = (docs ?? []).filter((d) => d.anulado_em);
  const recebeuAlgo = (itens ?? []).some((i) => Number(i.quantidade_recebida) > 0);
  const retirada = o.modalidade === 'retirada';
  const sis = (itens ?? []).map((i) => i.solicitacao_itens as unknown as { status?: string } | null).filter((x) => x?.status);
  const entregue = sis.length > 0 && sis.every((x) => x!.status === 'entregue');
  const etapas: { t: string; feito: boolean; det?: string }[] = [
    { t: 'OC emitida (compra aprovada)', feito: true, det: dataHora(o.emitida_em) },
    { t: 'Pago / faturado', feito: !!o.pagamento, det: o.pagamento ? `${(o.pagamento === 'pago' ? 'Pago' : o.pagamento === 'cartao' ? 'Pago no cartão de crédito' : 'Faturado')} ${dataHora(o.pago_em)}` : undefined },
    { t: retirada ? 'Coletado no fornecedor' : 'Saiu para entrega', feito: !!col?.coletado_em || ['recebida', 'recebida_parcial'].includes(o.status),
      det: col?.coletado_em ? `${dataHora(col.coletado_em)}${col.coletado_por ? ` • ${col.coletado_por}` : ''}` : undefined },
    { t: 'Entrada no estoque', feito: o.status === 'recebida', det: o.status === 'recebida_parcial' ? 'parcial' : undefined },
    { t: 'Entregue na obra', feito: entregue, det: sis.length ? undefined : 'reposição do estoque' },
  ];
  const atual = etapas.findIndex((e) => !e.feito);
  const smsEnviar = [...new Map((itens ?? []).map((i) => i.solicitacao_itens as unknown as { solicitacao_id?: string; status?: string; solicitacoes?: { numero: number } } | null)
    .filter((x) => x?.solicitacao_id && x.status !== 'entregue').map((x) => [x!.solicitacao_id!, x!.solicitacoes?.numero ?? 0])).entries()];
  const podeColeta = ['compras', 'almoxarifado', 'financeiro', 'admin', 'engenheiro', 'encarregado'].includes(p) && ['emitida', 'pronta_coleta'].includes(o.status) && !col?.coletado_em;
  const podeEntrada = ['almoxarifado', 'admin', 'compras'].includes(p);
  const podeExcluirDoc = ['compras', 'financeiro', 'almoxarifado', 'admin'].includes(p);
  const Desfazer = ({ titulo, texto, acao, botao, ph }: { titulo: string; texto: string; acao: typeof desfazerOC; botao: string; ph: string }) => (
    <details className="rounded-lg border border-atraso-200 bg-superficie text-sm">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-atraso-700">↩ {titulo}</summary>
      <p className="px-4 text-xs text-concreto-600">{texto}</p>
      <FormAcao acao={acao} className="flex flex-wrap gap-2 border-t border-concreto-100 p-4">
        <input type="hidden" name="oc_id" value={id} />
        <input name="motivo" required minLength={5} placeholder={ph} className="entrada min-w-0 flex-1" />
        <Botao variante="perigo">{botao}</Botao>
      </FormAcao>
    </details>);

  return (
    <>
      <div className="nao-imprimir">
        <Cabecalho titulo={`Ordem de compra ${codOC(o.numero)}`}
          sub={<span className="flex flex-wrap items-center gap-2">{o.obra_codigo ? `${o.obra_codigo} — ${o.obra_nome}` : 'Depósito central'}
            <Selo cor={STATUS_OC[o.status].cor}>{STATUS_OC[o.status].rotulo}</Selo>
            {o.nf_divergente && <Selo cor="bg-atraso-500 text-white">NF divergente</Selo>}
            {o.entrega_atrasada && <Selo cor="bg-atraso-50 text-atraso-700">Entrega atrasada</Selo>}</span>}
          acoes={<><BotaoImprimir rotulo="Imprimir OC (vai com o retirante)" />
            {['compras', 'admin', 'financeiro'].includes(p) && <Link href={`/suprimentos/cotacoes/${o.cotacao_id}`} className="inline-flex items-center rounded-md border border-concreto-300 bg-superficie px-3 py-2 text-sm font-semibold">Cotação {o.cotacao_codigo}</Link>}</>} />
      </div>

      {o.status === 'cancelada'
        ? <p className="nao-imprimir mb-5 rounded-md border-2 border-atraso-500 bg-atraso-50 px-4 py-2 text-sm font-semibold text-atraso-700">OC cancelada.</p>
        : (
        <ol className="nao-imprimir mb-5 grid gap-2 sm:grid-cols-5">
          {etapas.map((e, k) => (
            <li key={k} className={`relative rounded-lg border-2 px-3 py-2 text-sm ${e.feito ? 'border-ok-500 bg-ok-50' : k === atual ? 'border-sinal-500 bg-sinal-50' : 'border-concreto-200 bg-superficie text-concreto-400'}`}>
              <div className="flex items-center gap-2 font-bold">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white ${e.feito ? 'bg-ok-600' : k === atual ? 'bg-sinal-500' : 'bg-concreto-300'}`}>{e.feito ? '✓' : k + 1}</span>
                <span className={e.feito ? 'text-ok-800' : k === atual ? 'text-sinal-800' : ''}>{e.t}</span></div>
              {e.det && <div className="mt-0.5 pl-8 text-[11px] text-concreto-600">{e.det}</div>}
              {k === atual && <div className="mt-0.5 pl-8 text-[11px] font-semibold text-sinal-700">← próxima etapa</div>}
            </li>))}
        </ol>)}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Documento da OC (também é o que sai na impressão) */}
          <section className="rounded-lg border border-concreto-200 bg-superficie p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-concreto-200 pb-3">
              <div><div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-700">Ordem de compra</div>
                <div className="font-mono text-2xl font-black">{codOC(o.numero)}</div>
                <div className="text-xs text-concreto-500">Emitida em {dataHora(o.emitida_em)} • aprovada • {o.cotacao_codigo}</div></div>
              <div className="text-right text-sm"><b>{o.obra_nome}</b><div className="text-xs text-concreto-500">{empresa?.endereco ?? ''}</div></div>
            </div>
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info rotulo="Fornecedor">{o.fornecedor_nome}<div className="text-xs text-concreto-500">{o.fornecedor_documento} {o.fornecedor_telefone}</div></Info>
              <Info rotulo="Pagamento">{forma ? <b>{FORMA_PAGAMENTO[forma]}</b> : null}{forma && o.condicao_pagamento ? ' • ' : ''}{o.condicao_pagamento ?? (forma ? '' : '—')}{o.pagamento && <div className="text-xs font-semibold text-ok-700">{(o.pagamento === 'pago' ? 'Pago' : o.pagamento === 'cartao' ? 'Pago no cartão de crédito' : 'Faturado')} {dataHora(o.pago_em)}</div>}</Info>
              <Info rotulo={o.modalidade === 'retirada' ? 'Retirada por' : 'Entrega'}>{o.modalidade === 'retirada' ? (o.retirante ?? '— a definir') : 'Fornecedor entrega na obra'}</Info>
              <Info rotulo="Previsão">{data(o.previsao_entrega)}</Info>
            </dl>
            <div className="overflow-x-auto"><table className="tabela">
              <thead><tr><th>Item</th><th className="text-right">Qtd.</th><th className="text-right">Unit.</th><th className="text-right">Total</th><th className="text-right">Recebido</th></tr></thead>
              <tbody>{(itens ?? []).map((i) => {
                const sm = (i.solicitacao_itens as unknown as { solicitacao_id: string; solicitacoes: { numero: number } } | null);
                return (
                  <tr key={i.id}>
                    <td>{i.descricao}<SeloLocacao i={(i.solicitacao_itens ?? {}) as { modalidade?: string }} />{sm && <Link href={`/materiais/${sm.solicitacao_id}`} className="nao-imprimir ml-1 text-xs text-sinal-700">({codSM(sm.solicitacoes.numero)})</Link>}</td>
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

          <Cartao titulo={`Documentos (${docsAtivos.length})`} className="nao-imprimir">
            {!docsAtivos.length ? <p className="text-sm text-concreto-500">Nenhum documento. Anexe NF, boleto e comprovante pela câmera do celular.</p> : (
              <ul className="divide-y divide-concreto-100 text-sm">{docsAtivos.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{DOC[d.tipo]}</b> {d.numero && `nº ${d.numero}`} {d.valor && `• ${reais(d.valor)}`} {d.vencimento && `• vence ${data(d.vencimento)}`}
                      <span className="block text-xs text-concreto-500">{(d.perfis as unknown as { nome: string })?.nome} • {dataHora(d.criado_em)}</span></span>
                    {d.caminho && url.get(d.caminho) && <a href={url.get(d.caminho) ?? undefined} target="_blank" rel="noreferrer" className="link">abrir</a>}
                  </div>
                  {podeExcluirDoc && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-atraso-700">🗑 excluir (lançado errado)</summary>
                      <FormAcao acao={anularDocumentoOC} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="doc_id" value={d.id} />
                        <input name="motivo" required minLength={5} placeholder="Motivo (ex.: valor digitado errado)" className="entrada min-w-0 flex-1 py-1" />
                        <Botao variante="perigo" className="px-3 py-1 text-xs">Excluir documento</Botao>
                      </FormAcao>
                    </details>)}
                </li>))}
              </ul>)}
            {docsExcluidos.length > 0 && (
              <details className="mt-3 text-xs text-concreto-500"><summary className="cursor-pointer">Documentos excluídos ({docsExcluidos.length})</summary>
                <ul className="mt-1 space-y-1">{docsExcluidos.map((d) => (
                  <li key={d.id}><s>{DOC[d.tipo]} {d.numero && `nº ${d.numero}`} {d.valor && `• ${reais(d.valor)}`}</s> — excluído em {dataHora(d.anulado_em)}: {d.anulado_motivo}</li>))}</ul>
              </details>)}
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
                <Campo rotulo="Situação"><select name="pagamento" className="entrada" defaultValue={forma === 'cartao_credito' ? 'cartao' : forma === 'boleto' ? 'faturado' : 'pago'}><option value="pago">Pago</option><option value="faturado">Faturado (boleto)</option><option value="cartao">Cartão de crédito</option></select></Campo>
                <Campo rotulo="Vencimento da fatura do cartão" dica="Só se for no cartão — a despesa fica em aberto no financeiro até essa data"><input type="date" name="fatura" min={hojeISO()} className="entrada" /></Campo>
                {o.modalidade === 'retirada' && <Campo rotulo="Quem vai retirar *"><input name="retirante" defaultValue={o.retirante ?? ''} className="entrada" /></Campo>}
                <Campo rotulo="Nova previsão (opcional)"><input type="date" name="previsao" className="entrada" /></Campo>
                <Botao grande>{o.modalidade === 'retirada' ? 'Liberar para coleta' : 'Confirmar pagamento'}</Botao>
                <p className="text-xs text-concreto-500">Todos são avisados: almoxarifado, compras, financeiro e engenheiro da obra.</p>
              </FormAcao>
            </Cartao>)}

          {['recebida', 'recebida_parcial'].includes(o.status) && smsEnviar.length > 0 && (
            <Cartao titulo="➡ Próximo passo: entregar na obra" className="border-2 border-sinal-500">
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
                <li>O <b>almoxarifado</b> abre o pedido de material e clica em <b>“Registrar saída para a obra”</b> (quantidade enviada, nota/motorista).</li>
                <li>O <b>encarregado/engenheiro da obra</b> abre o mesmo pedido e <b>confirma o que chegou</b> — aí a etapa fica verde.</li>
              </ol>
              <div className="flex flex-wrap gap-2">{smsEnviar.map(([sid, n]) => (
                <Link key={sid} href={`/materiais/${sid}`} className="rounded bg-sinal-600 px-3 py-1.5 text-sm font-semibold text-white">Abrir {codSM(n)} →</Link>))}</div>
            </Cartao>)}

          {podeColeta && (
            <Cartao titulo={retirada ? '🚚 Registrar coleta do material' : '🚚 Registrar saída para entrega'} className={`border-2 ${o.pagamento ? 'border-sinal-500' : 'border-concreto-200'}`}>
              {!o.pagamento && <p className="mb-2 rounded bg-atencao-50 px-2 py-1 text-xs text-atencao-800">A OC ainda não foi marcada como paga/faturada.</p>}
              <UploadArquivo pasta={`sup/oc/${id}`} acao={registrarColetaOC} exigirArquivo={false} rotuloBotao={retirada ? '✔ Material coletado' : '✔ Saiu para entrega'}>
                <input type="hidden" name="oc_id" value={id} />
                <Campo rotulo={retirada ? 'Quem coletou *' : 'Motorista / transportadora'}><input name="quem" defaultValue={o.retirante ?? ''} className="entrada" /></Campo>
                <Campo rotulo="Data e hora"><input type="datetime-local" name="quando" max={`${hojeISO()}T23:59`} className="entrada" /></Campo>
                <Campo rotulo="Observação"><input name="obs" placeholder="Ex.: faltou 1 item, nº do canhoto…" className="entrada" /></Campo>
                <p className="text-xs text-concreto-500">Foto do canhoto ou da nota (opcional). Sem data = agora.</p>
              </UploadArquivo>
            </Cartao>)}

          {col?.coletado_em && (
            <Cartao titulo={retirada ? 'Coleta' : 'Saída para entrega'}>
              <p className="text-sm"><b>{dataHora(col.coletado_em)}</b>{col.coletado_por ? ` • ${col.coletado_por}` : ''}</p>
              {col.coleta_obs && <p className="text-sm text-concreto-600">{col.coleta_obs}</p>}
              {urlColeta && <a href={urlColeta} target="_blank" rel="noreferrer" className="link text-sm">📎 foto do canhoto / nota</a>}
              {['compras', 'almoxarifado', 'admin'].includes(p) && ['emitida', 'pronta_coleta'].includes(o.status) && (
                <details className="mt-2 text-xs"><summary className="cursor-pointer text-atraso-700">↩ desfazer coleta</summary>
                  <FormAcao acao={desfazerColetaOC} className="mt-2 flex gap-2"><input type="hidden" name="oc_id" value={id} />
                    <input name="motivo" required minLength={5} placeholder="Motivo" className="entrada flex-1 py-1" /><Botao variante="perigo" className="px-2 py-1 text-xs">Desfazer</Botao></FormAcao>
                </details>)}
            </Cartao>)}

          {aReceber && podeEntrada && (
            <Cartao titulo="📦 Dar entrada no estoque (recebimento)" className={`border-2 ${col?.coletado_em || o.status === 'recebida_parcial' ? 'border-ok-500' : 'border-concreto-200'}`}>
              {!col?.coletado_em && o.status !== 'recebida_parcial' && <p className="mb-2 text-xs text-concreto-500">Normalmente depois da coleta/entrega. Se o material já chegou, pode lançar direto.</p>}
              <FormAcao acao={receberOC} className="space-y-3">
                <input type="hidden" name="oc_id" value={id} />
                {(itens ?? []).filter((i) => Number(i.quantidade_recebida) < Number(i.quantidade)).map((i) => (
                  <div key={i.id} className="flex items-center gap-2">
                    <input type="hidden" name="oc_item_id" value={i.id} />
                    <span className="flex-1 text-sm">{i.descricao}<span className="block text-xs text-concreto-500">faltam {num(Number(i.quantidade) - Number(i.quantidade_recebida), 3)} {i.unidade}</span></span>
                    <input name="qtd" inputMode="decimal" defaultValue={Number(i.quantidade) - Number(i.quantidade_recebida)} className="entrada w-24" />
                  </div>))}
                <Campo rotulo="Observação"><input name="observacao" className="entrada" placeholder="Avarias, falta, nº do romaneio…" /></Campo>
                <Botao grande variante="sucesso">Dar entrada no estoque</Botao>
                <p className="text-xs text-concreto-500">Entra no estoque da obra (ou do depósito central) e libera os itens para o almoxarifado enviar ao encarregado.</p>
              </FormAcao>
            </Cartao>)}

          {podeDoc && (
            <Cartao titulo={forma && forma !== 'boleto' ? 'Anexar NF / comprovante' : 'Anexar NF / boleto / comprovante'}>
              <UploadArquivo pasta={`sup/oc/${id}`} acao={anexarDocumentoOC} rotuloBotao="Anexar à OC">
                <input type="hidden" name="oc_id" value={id} />
                <CamposDocumentoOC forma={forma} />
              </UploadArquivo>
              <p className="mt-2 text-xs text-concreto-500">A NF é conferida automaticamente com o valor da OC.</p>
            </Cartao>)}

          {['compras', 'admin'].includes(p) && ['emitida', 'pronta_coleta'].includes(o.status) && !recebeuAlgo && (
            <Desfazer titulo="Desfazer OC (voltar para a cotação)" acao={desfazerOC} botao="Desfazer OC" ph="O que estava errado (ex.: preço do item 2)"
              texto="Errou preço, fornecedor ou quantidade? A OC é cancelada (e a conta a pagar dela também) e a cotação volta como uma nova cotação, com os itens e as propostas já digitados, para você corrigir e mandar aprovar de novo." />)}

          {['compras', 'financeiro', 'admin'].includes(p) && o.status === 'pronta_coleta' && (
            <Desfazer titulo="Desfazer pago / faturado" acao={voltarPagamentoOC} botao="Desfazer pagamento" ph="Motivo (ex.: marquei pago por engano)"
              texto="A OC volta a aguardar pagamento/faturamento e a conta a pagar volta a ficar em aberto." />)}

          {['almoxarifado', 'compras', 'admin'].includes(p) && ['recebida', 'recebida_parcial'].includes(o.status) && (
            <Desfazer titulo="Estornar entrada da nota (recebimento)" acao={estornarRecebimentoOC} botao="Estornar recebimento" ph="Motivo (ex.: lancei a quantidade errada)"
              texto="Tudo o que foi recebido nesta OC sai do estoque e a OC volta a aguardar entrega; depois é só lançar o recebimento certo. Não funciona se o material já foi enviado ao encarregado ou usado." />)}

          {p === 'admin' && ['emitida', 'pronta_coleta'].includes(o.status) && (
            <details className="rounded-lg border border-concreto-200 bg-superficie text-sm">
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
