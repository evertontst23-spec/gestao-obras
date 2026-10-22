import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, SeloMaterial, SeloPrioridade, SeloSolicitacao } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { FotoUpload } from '@/components/FotoUpload';
import { Galeria } from '@/components/Galeria';
import { cancelarItem, confirmarEntrega, decidirSolicitacao, registrarEnvio, verificarEstoque } from '../acoes';
import { STATUS_MATERIAL, codSM, codTarefa, type StatusMaterial } from '@/lib/dominio';
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

  return (
    <>
      <Cabecalho titulo={`Solicitação ${codSM(s.numero)}`}
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
            <div className="space-y-4">
              {itens?.map((i) => {
                const st = i.status as StatusMaterial;
                const restante = Number(i.quantidade) - Number(i.quantidade_enviada);
                const minhasEntregas = (entregas ?? []).filter((e) => e.item_id === i.id);
                const pendentes = minhasEntregas.filter((e) => !e.recebido_em);
                const evs = (eventos ?? []).filter((e) => e.item_id === i.id);
                return (
                  <div key={i.id} className={`rounded-md border p-3 ${i.risco_atraso ? 'border-atraso-500' : 'border-concreto-200'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold">{i.material}</div>
                        {i.especificacao && <div className="text-xs text-concreto-500">{i.especificacao}</div>}
                        {i.item_origem_id && <div className="text-xs text-concreto-500">↳ saldo encaminhado para compra</div>}
                      </div>
                      <SeloMaterial s={st} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div><span className="text-xs text-concreto-500">Pedido</span><div className="font-mono font-semibold">{num(i.quantidade)} {i.unidade}</div></div>
                      <div><span className="text-xs text-concreto-500">Recebido</span><div className="font-mono font-semibold">{num(i.quantidade_recebida)} {i.unidade}</div></div>
                      <div><span className="text-xs text-concreto-500">Fornecedor</span><div>{i.fornecedor ?? '—'}</div></div>
                      <div><span className="text-xs text-concreto-500">Previsão de entrega</span><div className={i.risco_atraso || i.entrega_atrasada ? 'font-bold text-atraso-700' : ''}>{data(i.previsao_entrega)}</div></div>
                    </div>
                    {i.risco_atraso && <p className="mt-2 rounded bg-atraso-50 px-2 py-1 text-xs font-semibold text-atraso-700">⚠ Risco de atraso no serviço: entrega prevista após {data(i.data_necessidade)}</p>}
                    {i.entrega_atrasada && <p className="mt-2 rounded bg-atraso-50 px-2 py-1 text-xs font-semibold text-atraso-700">⚠ Entrega atrasada pelo fornecedor</p>}

                    <div className="mt-3 space-y-2">
                      {almox && st === 'aprovado' && (
                        <FormAcao acao={verificarEstoque} className="flex flex-wrap items-end gap-2 rounded bg-teal-50 p-2">
                          <input type="hidden" name="solicitacao" value={id} /><input type="hidden" name="item" value={i.id} />
                          <Campo rotulo={`Disponível em estoque (${i.unidade})`} className="w-40"><input name="disponivel" inputMode="decimal" defaultValue={i.quantidade} required className="entrada" /></Campo>
                          <input name="observacao" placeholder="Observação" className="entrada w-auto flex-1" />
                          <Botao variante="escuro">Registrar verificação</Botao>
                          <p className="w-full text-xs text-concreto-500">{i.insumo_id
                            ? <>Saldo no sistema — <b>esta obra: {num(saldoObra.get(i.insumo_id) ?? 0, 3)}</b> • <b>depósito central: {num(saldoCentral.get(i.insumo_id) ?? 0, 3)}</b> {i.unidade}. </>
                            : 'Item sem código de insumo (estoque não controlado). '}
                            Informe 0 se não houver. O que faltar vai para cotação.</p>
                        </FormAcao>
                      )}
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
                );
              })}
            </div>
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
                'Compras registra fornecedor e previsão', 'Almoxarifado registra a saída para a obra', 'Encarregado confirma o recebimento'].map((p, k) => <li key={k}>{k + 1}. {p}</li>)}
            </ol>
          </Cartao>
        </div>
      </div>
    </>
  );
}
