import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, SeloMaterial, SeloPrioridade, SeloSolicitacao } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { FotoUpload } from '@/components/FotoUpload';
import { Galeria } from '@/components/Galeria';
import { SeloLocacao } from '@/components/Locacao';
import { ControleLocacao } from '@/components/ControleLocacao';
import { adicionarItem, cancelarItem, confirmarEntrega, decidirSolicitacao, editarItem, editarSolicitacao, registrarEnvio, verificarEstoque, verificarEstoqueLote } from '../acoes';
import { STATUS_MATERIAL, TAREFA_ABERTA, codSM, codTarefa, type StatusMaterial } from '@/lib/dominio';
import { data, dataHora, hojeISO, num } from '@/lib/formato';


export default async function DetalheSolicitacao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const { id } = await params;
  const { criado } = await searchParams;
  const { supabase, perfil } = await obterSessao();
  const { data: s } = await supabase.from('v_solicitacoes').select('*').eq('id', id).maybeSingle();
  if (!s) notFound();

  const { data: itens } = await supabase.from('v_itens').select('*').eq('solicitacao_id', id).order('criado_em');
  const ids = (itens ?? []).map((i) => i.id);
  const [{ data: entregas }, { data: eventos }, { data: anexos }, { data: pode }] = await Promise.all([
    supabase.from('entregas').select('*, enviou:perfis!entregas_enviado_por_fkey(nome), recebeu:perfis!entregas_recebido_por_fkey(nome)').in('item_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('enviado_em'),
    supabase.from('item_eventos').select('*, perfis(nome)').in('item_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('criado_em'),
    supabase.from('anexos').select('*').eq('solicitacao_id', id).order('criado_em', { ascending: false }),
    supabase.rpc('gere_obra', { p_obra: s.obra_id }),
  ]);
  const gere = Boolean(pode);
  const insIds = [...new Set((itens ?? []).map((i) => i.insumo_id).filter(Boolean))] as string[];
  const { data: saldos } = insIds.length ? await supabase.from('v_estoque').select('insumo_id, obra_id, saldo').in('insumo_id', insIds) : { data: [] };
  const saldoObra = new Map<string, number>(), saldoCentral = new Map<string, number>();
  (saldos ?? []).forEach((r) => { if (r.obra_id === s.obra_id) saldoObra.set(r.insumo_id, Number(r.saldo)); else if (!r.obra_id) saldoCentral.set(r.insumo_id, Number(r.saldo)); });
  const papel = perfil.papel;
  const almox = papel === 'almoxarifado' || papel === 'admin';
  const compras = papel === 'compras' || papel === 'admin';
  const recebe = ['encarregado', 'engenheiro', 'admin'].includes(papel);
  const hoje = hojeISO();
  const podeEditar = !['concluida', 'cancelada', 'rejeitada'].includes(s.status) && (gere || compras || s.solicitante_id === perfil.id);
  const { data: tarefasObra } = podeEditar
    ? await supabase.from('v_tarefas').select('id, numero, titulo').eq('obra_id', s.obra_id).in('status', TAREFA_ABERTA).order('numero')
    : { data: [] };
  const itemEditavel = (i: { status: string; cotacao_id: string | null; oc_id: string | null; quantidade_enviada: number | string; quantidade_recebida: number | string }) =>
    podeEditar && ['solicitado', 'aguardando_aprovacao', 'aprovado', 'em_cotacao'].includes(i.status) && !i.cotacao_id && !i.oc_id
    && Number(i.quantidade_enviada) === 0 && Number(i.quantidade_recebida) === 0;

  return (
    <>
      <Cabecalho titulo={`Solicitação ${codSM(s.numero)}`}
        acoes={<Link href={`/materiais/pedido?sm=${id}`} className="inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold hover:border-sinal-400">🖨 PDF do pedido</Link>}
        sub={<span className="flex flex-wrap items-center gap-2"><Link href={`/obras/${s.obra_id}`} className="link">{s.obra_codigo} — {s.obra_nome}</Link><SeloSolicitacao s={s.status} /><SeloPrioridade p={s.prioridade} /></span>} />
      {criado && <p className="mb-4 rounded-md bg-ok-50 px-4 py-3 text-sm font-semibold text-ok-700">Pedido enviado! Você será avisado a cada etapa. Se quiser, anexe uma foto abaixo.</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info rotulo="Solicitante">{s.solicitante_nome}<div className="text-xs text-concreto-500">{dataHora(s.criado_em)}</div></Info>
              <Info rotulo="Necessário na obra">{data(s.data_necessidade)}</Info>
              <Info rotulo="Serviço">{s.tarefa_id ? <Link href={`/tarefas/${s.tarefa_id}`} className="link">{codTarefa(s.tarefa_numero)} {s.tarefa_titulo}</Link> : 'Uso geral'}</Info>
              <Info rotulo="Aprovação">{s.aprovador_nome ? <>{s.aprovador_nome}<div className="text-xs text-concreto-500">{dataHora(s.aprovado_em)}</div></> : '—'}</Info>
            </dl>
            {s.justificativa && <p className="mt-3 text-sm"><b>Justificativa:</b> {s.justificativa}</p>}
            {s.observacoes && <p className="mt-1 text-sm text-concreto-600"><b>Obs.:</b> {s.observacoes}</p>}
            {s.parecer && <p className="mt-1 text-sm text-concreto-600"><b>Parecer:</b> {s.parecer}</p>}
          </Cartao>

          {podeEditar && (
            <details className="rounded-lg border border-concreto-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-sinal-700">✎ Editar pedido (data, prioridade, serviço, observação)</summary>
              <FormAcao acao={editarSolicitacao} className="grid gap-3 border-t border-concreto-100 p-4 sm:grid-cols-3">
                <input type="hidden" name="solicitacao" value={id} />
                <Campo rotulo="Necessário na obra"><input type="date" name="data_necessidade" required defaultValue={s.data_necessidade ?? ''} className="entrada" /></Campo>
                <Campo rotulo="Prioridade"><select name="prioridade" defaultValue={s.prioridade} className="entrada">
                  <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></Campo>
                <Campo rotulo="Serviço (tarefa)"><select name="tarefa_id" defaultValue={s.tarefa_id ?? 'sem'} className="entrada">
                  <option value="sem">Sem vínculo (explique na observação)</option>
                  {s.tarefa_id && !(tarefasObra ?? []).some((t) => t.id === s.tarefa_id) && <option value={s.tarefa_id}>{codTarefa(s.tarefa_numero)} {s.tarefa_titulo}</option>}
                  {(tarefasObra ?? []).map((t) => <option key={t.id} value={t.id}>{codTarefa(t.numero)} {t.titulo}</option>)}</select></Campo>
                <Campo rotulo="Observação" className="sm:col-span-3"><input name="observacoes" defaultValue={s.observacoes ?? ''} className="entrada" /></Campo>
                <Campo rotulo="Justificativa" className="sm:col-span-3"><input name="justificativa" defaultValue={s.justificativa ?? ''} className="entrada" /></Campo>
                <div className="sm:col-span-3"><Botao>Salvar alterações</Botao>
                  <span className="ml-3 text-xs text-concreto-500">A alteração fica registrada no histórico de cada item.</span></div>
              </FormAcao>
            </details>)}

          {gere && s.status === 'aguardando_aprovacao' && (
            <FormAcao acao={decidirSolicitacao} className="space-y-3 rounded-lg border-2 border-sinal-500 bg-sinal-50 p-4">
              <input type="hidden" name="solicitacao" value={id} />
              <div className="font-bold text-sinal-700">Analisar pedido</div>
              <Campo rotulo="Parecer (obrigatório para rejeitar)"><input name="parecer" className="entrada" /></Campo>
              <div className="flex flex-wrap gap-2">
                <Botao variante="sucesso" name="decisao" value="aprovar">Aprovar pedido</Botao>
                <Botao variante="perigo" name="decisao" value="rejeitar">Rejeitar</Botao>
              </div>
            </FormAcao>
          )}

          <Cartao titulo={`Materiais (${itens?.length ?? 0})`}>
            {(() => {
              const aVerificar = (itens ?? []).filter((i) => i.status === 'aprovado');
              if (!almox || aVerificar.length < 2) return null;
              return (
                <div className="mb-4 rounded-md border-2 border-teal-600 bg-teal-50 p-3">
                  <div className="text-sm font-bold text-teal-900">Verificar todos de uma vez ({aVerificar.length} itens)</div>
                  <p className="mb-2 text-xs text-concreto-600">Se só alguns têm estoque, use o campo de cada item abaixo.</p>
                  <div className="flex flex-wrap gap-2">
                    {(['cotacao', 'estoque'] as const).map((m) => (
                      <FormAcao key={m} acao={verificarEstoqueLote}>
                        <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="modo" value={m} />
                        {aVerificar.map((i) => <input key={i.id} type="hidden" name="itens" value={i.id} />)}
                        <Botao variante={m === 'cotacao' ? 'escuro' : 'sucesso'}>{m === 'cotacao' ? 'Nenhum tem estoque → todos para cotação' : 'Todos disponíveis em estoque'}</Botao>
                      </FormAcao>))}
                  </div>
                </div>);
            })()}
            {(itens?.length ?? 0) > 0 && (
              <div className="mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-concreto-400">
                <span className="w-3" /><span className="flex-1">Material — clique para ver detalhes e ações</span>
                <span className="w-28 text-right">Quantidade</span><span className="hidden w-24 sm:block">Previsão</span><span>Status</span>
              </div>)}
            <div className="space-y-1.5">
              {itens?.map((i) => {
                const st = i.status as StatusMaterial;
                const restante = Number(i.quantidade) - Number(i.quantidade_enviada);
                const minhasEntregas = (entregas ?? []).filter((e) => e.item_id === i.id);
                const pendentes = minhasEntregas.filter((e) => !e.recebido_em);
                const evs = (eventos ?? []).filter((e) => e.item_id === i.id);
                // Abre sozinho só quando há algo a fazer neste item (ou alerta); o resto fica numa linha compacta.
                const temAcao = (almox && st === 'aprovado')
                  || (almox && (i.oc_id ? ['disponivel_estoque', 'parcialmente_entregue'] : ['disponivel_estoque', 'comprado', 'em_transporte', 'parcialmente_entregue']).includes(st) && restante > 0)
                  || (recebe && pendentes.length > 0)
                  || Boolean(i.risco_atraso) || Boolean(i.entrega_atrasada);
                return (
                  <details key={i.id} open={temAcao} className={`group rounded-md border ${i.risco_atraso ? 'border-atraso-500' : 'border-concreto-200'}`}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm hover:bg-concreto-50 [&::-webkit-details-marker]:hidden">
                      <span className="w-3 shrink-0 text-xs text-concreto-400 transition-transform group-open:rotate-90">▸</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{i.material}</div>
                        {(i.especificacao || i.modalidade === 'locacao') && <div className="truncate text-xs text-concreto-500">{i.modalidade === 'locacao' ? '🔁 Locação' : ''}{i.modalidade === 'locacao' && i.especificacao ? ' · ' : ''}{i.especificacao}</div>}
                      </div>
                      <span className="w-28 shrink-0 text-right font-mono text-xs"><b>{num(i.quantidade)}</b> {i.unidade}{Number(i.quantidade_recebida) > 0 && <span className="block text-concreto-500">recebido {num(i.quantidade_recebida)}</span>}</span>
                      <span className={`hidden w-24 shrink-0 text-xs sm:block ${i.risco_atraso || i.entrega_atrasada ? 'font-bold text-atraso-700' : 'text-concreto-500'}`}>{i.previsao_entrega ? data(i.previsao_entrega) : '—'}</span>
                      <span className="shrink-0">{(i.risco_atraso || i.entrega_atrasada) && <span className="mr-1 font-bold text-atraso-700">⚠</span>}<SeloMaterial s={st} /></span>
                    </summary>
                    <div className="border-t border-concreto-100 px-3 pb-3 pt-2">
                    {i.item_origem_id && <div className="text-xs text-concreto-500">↳ saldo encaminhado para compra</div>}
                    <SeloLocacao i={i} comSituacao />
                    <div className="mt-1 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div><span className="text-xs text-concreto-500">Pedido</span><div className="font-mono font-semibold">{num(i.quantidade)} {i.unidade}</div></div>
                      <div><span className="text-xs text-concreto-500">Recebido</span><div className="font-mono font-semibold">{num(i.quantidade_recebida)} {i.unidade}</div></div>
                      <div><span className="text-xs text-concreto-500">Fornecedor</span><div>{i.fornecedor ?? '—'}</div></div>
                      <div><span className="text-xs text-concreto-500">Previsão de entrega</span><div className={i.risco_atraso || i.entrega_atrasada ? 'font-bold text-atraso-700' : ''}>{data(i.previsao_entrega)}</div></div>
                    </div>
                    {i.risco_atraso && <p className="mt-2 rounded bg-atraso-50 px-2 py-1 text-xs font-semibold text-atraso-700">⚠ Risco de atraso no serviço: entrega prevista após {data(i.data_necessidade)}</p>}
                    {i.entrega_atrasada && <p className="mt-2 rounded bg-atraso-50 px-2 py-1 text-xs font-semibold text-atraso-700">⚠ Entrega atrasada pelo fornecedor</p>}

                    <div className="mt-3 space-y-2">
                      {almox && st === 'aprovado' && (() => {
                        const saldo = i.insumo_id ? Math.max(saldoObra.get(i.insumo_id) ?? 0, saldoCentral.get(i.insumo_id) ?? 0) : 0;
                        const sugestao = Math.min(saldo, Number(i.quantidade));
                        return (
                          <div className="space-y-2 rounded bg-teal-50 p-2">
                            <div className="text-xs font-bold uppercase tracking-wide text-teal-900">Verificar estoque</div>
                            <p className="text-xs text-concreto-600">{i.insumo_id
                              ? <>Saldo no sistema — <b>esta obra: {num(saldoObra.get(i.insumo_id) ?? 0, 3)}</b> • <b>depósito central: {num(saldoCentral.get(i.insumo_id) ?? 0, 3)}</b> {i.unidade}.</>
                              : 'Item sem estoque controlado no sistema.'}</p>
                            {saldo <= 0 && (
                              <FormAcao acao={verificarEstoque} className="flex flex-wrap items-center gap-2 rounded border-2 border-atraso-500 bg-white p-2">
                                <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="disponivel" value="0" />
                                <span className="flex-1 text-sm font-semibold text-atraso-700">Não há {i.material} em estoque.</span>
                                <Botao variante="escuro">Sem estoque → enviar para cotação</Botao>
                              </FormAcao>)}
                            <FormAcao acao={verificarEstoque} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="item" value={i.id} />
                              <Campo rotulo={`${saldo <= 0 ? 'Mesmo assim tem? Quantidade' : 'Disponível em estoque'} (${i.unidade})`} className="w-48"><input name="disponivel" inputMode="decimal" defaultValue={sugestao > 0 ? sugestao : ''} required className="entrada" /></Campo>
                              <input name="observacao" placeholder="Observação" className="entrada w-auto flex-1" />
                              <Botao variante={saldo > 0 ? 'escuro' : 'secundario'}>Registrar verificação</Botao>
                              <p className="w-full text-xs text-concreto-500">O que faltar vai para cotação.</p>
                            </FormAcao>
                          </div>);
                      })()}
                      {st === 'em_cotacao' && !i.cotacao_id && (compras
                        ? <Link href="/suprimentos/cotacoes/nova" className="block rounded bg-atencao-50 p-2 text-sm font-semibold text-atencao-700">≋ Aguardando cotação — incluir em uma cotação →</Link>
                        : <p className="rounded bg-atencao-50 p-2 text-xs text-atencao-700">Sem estoque — aguardando cotação pelo comprador.</p>)}
                      {i.cotacao_id && !i.oc_id && (compras || papel === 'engenheiro' || papel === 'financeiro') && (
                        <Link href={`/suprimentos/cotacoes/${i.cotacao_id}`} className="block rounded bg-atencao-50 p-2 text-sm font-semibold text-atencao-700">≋ Em cotação com fornecedores — ver mapa de cotação →</Link>)}
                      {i.oc_id && (
                        <Link href={`/suprimentos/ordens/${i.oc_id}`} className="block rounded bg-sky-50 p-2 text-sm font-semibold text-sky-800">⎙ Ordem de compra emitida — acompanhar pagamento e entrega →</Link>)}
                      {almox && (i.oc_id ? ['disponivel_estoque', 'parcialmente_entregue'] : ['disponivel_estoque', 'comprado', 'em_transporte', 'parcialmente_entregue']).includes(st) && restante > 0 && (
                        <FormAcao acao={registrarEnvio} className="flex flex-wrap items-end gap-2 rounded bg-indigo-50 p-2">
                          <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="item" value={i.id} />
                          <Campo rotulo={`Quantidade enviada (restam ${num(restante)})`} className="w-48"><input name="quantidade" inputMode="decimal" defaultValue={restante} required className="entrada" /></Campo>
                          <input name="observacao" placeholder="Nota / romaneio / motorista" className="entrada w-auto flex-1" />
                          <Botao variante="escuro">Registrar saída para a obra</Botao>
                        </FormAcao>
                      )}
                      {recebe && pendentes.map((e) => (
                        <FormAcao key={e.id} acao={confirmarEntrega} className="flex flex-wrap items-end gap-2 rounded-md border-2 border-sinal-500 bg-sinal-50 p-3">
                          <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="entrega" value={e.id} />
                          <div className="w-full text-sm font-semibold">📦 Enviado {num(e.quantidade_enviada)} {i.unidade} em {dataHora(e.enviado_em)} — confirme o que chegou</div>
                          <Campo rotulo="Quantidade recebida" className="w-40"><input name="recebida" inputMode="decimal" defaultValue={e.quantidade_enviada} required className="entrada" /></Campo>
                          <input name="observacao" placeholder="Avarias, faltas…" className="entrada w-auto flex-1" />
                          <Botao>Confirmar recebimento</Botao>
                        </FormAcao>
                      ))}
                      {i.modalidade === 'locacao' && i.devolvido_em && <p className="rounded bg-concreto-100 p-2 text-xs">Devolvido em <b>{data(i.devolvido_em)}</b>{i.devolucao_obs ? ` — ${i.devolucao_obs}` : ''}</p>}
                      {i.modalidade === 'locacao' && !i.devolvido_em && ['entregue', 'parcialmente_entregue'].includes(st) && (gere || almox || compras) && (
                        <ControleLocacao item={i.id} solicitacao={id} fim={i.locacao_fim} hoje={hoje} />)}
                      {itemEditavel(i) && (
                        <details className="text-sm" open={false}><summary className="cursor-pointer text-xs font-semibold text-sinal-700">✎ Editar item (renomear, quantidade, unidade…)</summary>
                          <FormAcao acao={editarItem} className="mt-2 grid gap-2 rounded bg-concreto-50 p-2 sm:grid-cols-4">
                            <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="item" value={i.id} />
                            <Campo rotulo="Material" className="sm:col-span-2"><input name="material" required defaultValue={i.material} className="entrada" /></Campo>
                            <Campo rotulo="Quantidade"><input name="quantidade" required inputMode="decimal" defaultValue={String(Number(i.quantidade)).replace('.', ',')} className="entrada" /></Campo>
                            <Campo rotulo="Unidade"><input name="unidade" required defaultValue={i.unidade} className="entrada" /></Campo>
                            <Campo rotulo="Especificação" className="sm:col-span-2"><input name="especificacao" defaultValue={i.especificacao ?? ''} className="entrada" /></Campo>
                            <Campo rotulo="Necessário em"><input type="date" name="data_necessidade" defaultValue={i.data_necessidade ?? ''} className="entrada" /></Campo>
                            {i.modalidade === 'locacao' ? <div className="grid grid-cols-2 gap-1">
                              <Campo rotulo="Locação: início"><input type="date" name="locacao_inicio" defaultValue={i.locacao_inicio ?? ''} className="entrada" /></Campo>
                              <Campo rotulo="Fim"><input type="date" name="locacao_fim" defaultValue={i.locacao_fim ?? ''} className="entrada" /></Campo></div> : <div />}
                            <div className="sm:col-span-4"><Botao variante="secundario">Salvar item</Botao>
                              <span className="ml-2 text-xs text-concreto-500">Para usar um material do cadastro, digite “CÓDIGO — nome” (ex.: PM-001 — Meio-fio).</span></div>
                          </FormAcao>
                        </details>)}
                      {i.cotacao_id && !i.oc_id && !['entregue', 'cancelado'].includes(st) && podeEditar && (
                        <p className="text-xs text-concreto-500">Este item já está numa cotação: para corrigir nome ou quantidade, o comprador corrige na cotação (ou cancele o item e inclua outro).</p>)}
                      {!['entregue', 'cancelado'].includes(st) && Number(i.quantidade_enviada) === 0 && Number(i.quantidade_recebida) === 0 &&
                        (gere || papel === 'compras' || s.solicitante_id === perfil.id) && (
                        <details className="text-sm"><summary className="cursor-pointer text-xs text-atraso-700">Cancelar item</summary>
                          <FormAcao acao={cancelarItem} className="mt-2 flex gap-2">
                            <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="item" value={i.id} />
                            <input name="motivo" required minLength={5} placeholder="Motivo do cancelamento" className="entrada flex-1" />
                            <Botao variante="perigo">Cancelar</Botao>
                          </FormAcao>
                        </details>
                      )}
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-concreto-500">Histórico do item ({evs.length + minhasEntregas.length})</summary>
                      <ul className="mt-2 space-y-1 border-l-2 border-concreto-200 pl-3 text-xs">
                        {evs.map((e) => <li key={e.id}><b>{dataHora(e.criado_em)}</b> — {(e.perfis as unknown as { nome: string })?.nome}: {e.status_novo ? STATUS_MATERIAL[e.status_novo as StatusMaterial]?.rotulo : ''} {e.quantidade ? `(${num(e.quantidade)})` : ''} {e.descricao}</li>)}
                        {minhasEntregas.filter((e) => e.recebido_em).map((e) => <li key={e.id}><b>{dataHora(e.recebido_em)}</b> — recebido por {(e.recebeu as unknown as { nome: string })?.nome}: {num(e.quantidade_recebida)} de {num(e.quantidade_enviada)} {e.observacao_recebimento ?? ''}</li>)}
                      </ul>
                    </details>
                    </div>
                  </details>
                );
              })}
            </div>
            {podeEditar && (
              <details className="mt-3 rounded-md border border-dashed border-sinal-400">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-sinal-700">+ Incluir item neste pedido</summary>
                <FormAcao acao={adicionarItem} limparAoConcluir className="grid gap-2 border-t border-concreto-100 p-3 sm:grid-cols-4">
                  <input type="hidden" name="solicitacao" value={id} />
                  <Campo rotulo="Material" className="sm:col-span-2"><input name="material" required placeholder="Nome ou CÓDIGO — nome" className="entrada" /></Campo>
                  <Campo rotulo="Quantidade"><input name="quantidade" required inputMode="decimal" className="entrada" /></Campo>
                  <Campo rotulo="Unidade"><input name="unidade" required defaultValue="un" className="entrada" /></Campo>
                  <Campo rotulo="Especificação" className="sm:col-span-2"><input name="especificacao" className="entrada" /></Campo>
                  <Campo rotulo="Compra ou locação"><select name="modalidade" className="entrada"><option value="compra">Compra</option><option value="locacao">Locação</option></select></Campo>
                  <div className="grid grid-cols-2 gap-1">
                    <Campo rotulo="Locação: início"><input type="date" name="locacao_inicio" className="entrada" /></Campo>
                    <Campo rotulo="Fim"><input type="date" name="locacao_fim" className="entrada" /></Campo></div>
                  <div className="sm:col-span-4"><Botao>Incluir item</Botao></div>
                </FormAcao>
              </details>)}
          </Cartao>
        </div>

        <div className="space-y-5">
          <Cartao titulo="Fotos e anexos">
            <div className="space-y-4">
              <FotoUpload obraId={s.obra_id} solicitacaoId={id} rotulo="📷 Anexar foto ou documento" />
              <Galeria anexos={anexos ?? []} />
            </div>
          </Cartao>
          <Cartao titulo="Fluxo do pedido">
            <ol className="space-y-1 text-xs text-concreto-600">
              {['Encarregado cria o pedido', 'Engenheiro aprova (quando exigido)', 'Almoxarifado verifica o estoque', 'Itens sem estoque seguem para compras',
                'Compras cota com fornecedores (compra ou locação)', 'Diretoria aprova a cotação e a OC é emitida', 'Comprador / financeiro paga e acompanha a entrega', 'Almoxarifado registra a saída para a obra', 'Encarregado confirma o recebimento'].map((p, k) => <li key={k}>{k + 1}. {p}</li>)}
            </ol>
          </Cartao>
        </div>
      </div>
    </>
  );
}
