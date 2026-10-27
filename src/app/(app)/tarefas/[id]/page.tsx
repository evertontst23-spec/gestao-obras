import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, LinkBotao, Progresso, SeloPrazo, SeloPrioridade, SeloSolicitacao, SeloStatus, Selo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { FotoUpload } from '@/components/FotoUpload';
import { Galeria } from '@/components/Galeria';
import { AbrirAncora } from '@/components/AbrirAncora';
import { SeloGravidade, SeloNC } from '@/components/SelosQualidade';
import {
  atualizarAndamento, comentar, concluirServico, confirmarRecebimento, iniciarServico, registrarImpedimento,
  reprogramarPrazo, rejeitarNovoPrazo, solicitarNovoPrazo, validarServico,
} from '../acoes';
import { CAUSAS, STATUS_TAREFA, codSM, codTarefa, type StatusTarefa } from '@/lib/dominio';
import { data, dataHora, num } from '@/lib/formato';

const ICONES: Record<string, string> = {
  criada: '✚', recebimento_confirmado: '✓', iniciada: '▶', retomada: '▶', andamento: '↗', impedimento: '⚠',
  concluida_encarregado: '⚑', aprovada: '★', rejeitada: '↺', prazo_reprogramado: '⏱', revisao_prazo_solicitada: '⏱',
  revisao_prazo_rejeitada: '✕', material_solicitado: '▤', material_recebido: '▤', risco_material: '⚠', comentario: '💬',
  anexo: '📷', responsavel_alterado: '⇄', editada: '✎',
};

function CausaSelect({ nome = 'causa', padrao }: { nome?: string; padrao?: string }) {
  return (
    <select name={nome} defaultValue={padrao ?? 'outro'} className="entrada">
      {Object.entries(CAUSAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export default async function DetalheTarefa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: t } = await supabase.from('v_tarefas').select('*').eq('id', id).maybeSingle();
  if (!t) notFound();
  const { data: tf } = await supabase.from('tarefas').select('encarregado_func_id').eq('id', id).maybeSingle();
  const { data: encFunc } = tf?.encarregado_func_id
    ? await supabase.from('v_funcionarios').select('nome, funcao_nome').eq('id', tf.encarregado_func_id).maybeSingle() : { data: null };

  const [{ data: eventos }, { data: reprogs }, { data: anexos }, { data: pedidos }, { data: pode }, { data: criador }] = await Promise.all([
    supabase.from('tarefa_eventos').select('*, perfis(nome)').eq('tarefa_id', id).order('criado_em', { ascending: false }),
    supabase.from('reprogramacoes').select('*, solicitante:perfis!reprogramacoes_solicitado_por_fkey(nome)').eq('tarefa_id', id).order('criado_em', { ascending: false }),
    supabase.from('anexos').select('*').eq('tarefa_id', id).order('criado_em', { ascending: false }),
    supabase.from('v_solicitacoes').select('*').eq('tarefa_id', id).order('criado_em', { ascending: false }),
    supabase.rpc('gere_obra', { p_obra: t.obra_id }),
    supabase.from('perfis').select('nome').eq('id', t.criado_por).maybeSingle(),
  ]);
  const [{ data: item }, { data: ncs }] = await Promise.all([
    t.planilha_item_id ? supabase.from('v_planilha_itens').select('*').eq('id', t.planilha_item_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('v_nao_conformidades').select('*').eq('tarefa_id', id).order('aberta_em', { ascending: false }),
  ]);
  const ncAbertas = (ncs ?? []).filter((n) => ['aberta', 'em_correcao', 'corrigida'].includes(n.status));

  const st = t.status as StatusTarefa;
  const souResponsavel = t.encarregado_id === perfil.id;
  const gere = Boolean(pode);
  const pendente = reprogs?.find((r) => r.status === 'pendente');
  const finalizada = st === 'aprovado';
  const zap = encodeURIComponent(`${codTarefa(t.numero)} — ${t.titulo}\nObra: ${t.obra_nome}\nLocal: ${t.local ?? '-'}\nPrazo: ${data(t.inicio_previsto)} a ${data(t.fim_previsto)}\nStatus: ${STATUS_TAREFA[st].rotulo} (${t.percentual}%)`);

  return (
    <>
      <AbrirAncora />
      <Cabecalho
        titulo={t.titulo}
        sub={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{codTarefa(t.numero)}</span>
          <Link href={`/obras/${t.obra_id}`} className="link">{t.obra_codigo} — {t.obra_nome}</Link>
          <SeloStatus s={st} /><SeloPrazo s={t.situacao_prazo} /><SeloPrioridade p={t.prioridade} /></span>}
        acoes={<>
          {gere && !finalizada && <LinkBotao href={`/tarefas/${id}/editar`} variante="secundario">Editar</LinkBotao>}
          <a href={`https://wa.me/?text=${zap}`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold text-concreto-800 hover:bg-concreto-50">Compartilhar no WhatsApp</a>
        </>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info rotulo="Engenheiro / responsável">{t.encarregado_nome}</Info>
              <Info rotulo="Encarregado">{encFunc ? <>{encFunc.nome}{encFunc.funcao_nome && <div className="text-xs text-concreto-500">{encFunc.funcao_nome}</div>}</> : '—'}</Info>
              <Info rotulo="Etapa">{t.etapa_nome ?? '—'}</Info>
              <Info rotulo="Local">{t.local ?? '—'}</Info>
              <Info rotulo="Criada por">{criador?.nome ?? '—'}<div className="text-xs text-concreto-500">{dataHora(t.criado_em)}</div></Info>
              <Info rotulo="Início previsto">{data(t.inicio_previsto)}</Info>
              <Info rotulo="Data limite">{data(t.fim_previsto)}
                {t.situacao_prazo === 'atrasado' ? <div className="text-xs font-bold text-atraso-700">{t.dias_atraso} dia(s) de atraso</div>
                  : !finalizada && <div className="text-xs text-concreto-500">{t.dias_restantes} dia(s) restantes</div>}</Info>
              <Info rotulo="Quantidade">{num(t.quantidade_executada)} / {num(t.quantidade_prevista)} {t.unidade ?? ''}</Info>
              <Info rotulo="Início real">{dataHora(t.inicio_real)}</Info>
            </dl>
            <div className="mt-4"><Progresso valor={finalizada ? 100 : t.percentual} cor={finalizada ? 'bg-ok-500' : 'bg-sinal-500'} /></div>
            {t.descricao && <p className="mt-4 whitespace-pre-line text-sm text-concreto-700">{t.descricao}</p>}
            {t.observacoes && <p className="mt-2 whitespace-pre-line rounded-md bg-concreto-50 p-3 text-sm text-concreto-600"><b>Obs.:</b> {t.observacoes}</p>}
          </Cartao>

          {/* ---------- AÇÕES DO ENCARREGADO ---------- */}
          {souResponsavel && !finalizada && (
            <Cartao titulo="Minhas ações">
              <div className="space-y-3">
                {st === 'aguardando_confirmacao' && (
                  <FormAcao acao={confirmarRecebimento}><input type="hidden" name="tarefa" value={id} /><Botao grande variante="escuro">✓ Confirmar que recebi a tarefa</Botao></FormAcao>
                )}
                {['aguardando_confirmacao', 'programado', 'aguardando_material', 'paralisado'].includes(st) && (
                  <FormAcao acao={iniciarServico}><input type="hidden" name="tarefa" value={id} />
                    <Botao grande>{st === 'aguardando_material' || st === 'paralisado' ? '▶ Retomar serviço' : '▶ Iniciar serviço'}</Botao></FormAcao>
                )}
                {st === 'em_andamento' && (
                  <details id="andamento" className="rounded-md border border-concreto-200" open>
                    <summary className="cursor-pointer px-4 py-3 font-semibold">↗ Atualizar andamento</summary>
                    <FormAcao acao={atualizarAndamento} className="space-y-3 border-t border-concreto-100 p-4">
                      <input type="hidden" name="tarefa" value={id} />
                      <div className="grid grid-cols-2 gap-3">
                        <Campo rotulo="Percentual executado (%)"><input name="percentual" type="number" min={0} max={99} inputMode="numeric" defaultValue={t.percentual} className="entrada" /></Campo>
                        <Campo rotulo={`Quantidade executada ${t.unidade ? `(${t.unidade})` : ''}`} dica={t.quantidade_prevista ? 'Se informar só a quantidade, o % é calculado' : undefined}>
                          <input name="quantidade" inputMode="decimal" defaultValue={t.quantidade_executada || ''} className="entrada" /></Campo>
                      </div>
                      <Campo rotulo="O que foi feito"><textarea name="descricao" rows={2} className="entrada" /></Campo>
                      <Botao grande>Salvar andamento</Botao>
                    </FormAcao>
                  </details>
                )}
                <Link href={`/materiais/nova?tarefa=${id}`} className="flex min-h-[52px] items-center justify-center rounded-md border border-concreto-300 bg-white font-semibold hover:bg-concreto-50">▤ Solicitar material</Link>
                <details id="impedimento" className="rounded-md border border-concreto-200">
                  <summary className="cursor-pointer px-4 py-3 font-semibold">⚠ Registrar impedimento / dificuldade</summary>
                  <FormAcao acao={registrarImpedimento} limparAoConcluir className="space-y-3 border-t border-concreto-100 p-4">
                    <input type="hidden" name="tarefa" value={id} />
                    <Campo rotulo="Causa"><CausaSelect /></Campo>
                    <Campo rotulo="Descreva o problema"><textarea name="descricao" required minLength={5} rows={2} className="entrada" /></Campo>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paralisar" className="h-5 w-5 accent-atraso-500" /> O serviço está parado</label>
                    <p className="text-xs text-concreto-500">Se a causa for &quot;Falta de material&quot;, o serviço fica como &quot;Aguardando material&quot;.</p>
                    <Botao grande variante="escuro">Registrar</Botao>
                  </FormAcao>
                </details>
                <details className="rounded-md border border-concreto-200">
                  <summary className="cursor-pointer px-4 py-3 font-semibold">⏱ Solicitar revisão de prazo</summary>
                  {pendente ? <p className="border-t border-concreto-100 p-4 text-sm text-concreto-600">Já existe um pedido aguardando o engenheiro (novo término {data(pendente.fim_novo)}).</p> : (
                    <FormAcao acao={solicitarNovoPrazo} className="space-y-3 border-t border-concreto-100 p-4">
                      <input type="hidden" name="tarefa" value={id} />
                      <Campo rotulo="Novo término sugerido"><input type="date" name="fim" required min={t.inicio_previsto} className="entrada" /></Campo>
                      <Campo rotulo="Causa"><CausaSelect /></Campo>
                      <Campo rotulo="Justificativa"><textarea name="justificativa" required minLength={10} rows={2} className="entrada" /></Campo>
                      <p className="text-xs text-concreto-500">O prazo só muda depois que o engenheiro aprovar.</p>
                      <Botao grande variante="secundario">Enviar pedido</Botao>
                    </FormAcao>)}
                </details>
                {st === 'em_andamento' && (
                  <details id="concluir" className="rounded-md border border-ok-500">
                    <summary className="cursor-pointer px-4 py-3 font-semibold text-ok-700">⚑ Concluir serviço</summary>
                    <FormAcao acao={concluirServico} className="space-y-3 border-t border-concreto-100 p-4">
                      <input type="hidden" name="tarefa" value={id} />
                      {t.quantidade_prevista && <Campo rotulo={`Quantidade total executada (${t.unidade ?? ''})`}><input name="quantidade" inputMode="decimal" defaultValue={t.quantidade_prevista} className="entrada" /></Campo>}
                      <Campo rotulo="Observação final"><textarea name="descricao" rows={2} className="entrada" /></Campo>
                      <p className="text-xs text-concreto-500">Anexe fotos do serviço pronto antes de concluir. O engenheiro fará a validação.</p>
                      <Botao grande variante="sucesso">Informar conclusão</Botao>
                    </FormAcao>
                  </details>
                )}
              </div>
            </Cartao>
          )}

          {/* ---------- AÇÕES DO ENGENHEIRO ---------- */}
          {gere && !finalizada && (
            <Cartao titulo="Gestão do engenheiro">
              <div className="space-y-3">
                {(st === 'aguardando_validacao' || st === 'concluido_encarregado') && ncAbertas.length > 0 && (
                  <p className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-semibold text-atraso-700">⚑ {ncAbertas.length} não conformidade(s) em aberto — verifique-as antes de aprovar.</p>)}
                {(st === 'aguardando_validacao' || st === 'concluido_encarregado') && (
                  <FormAcao acao={validarServico} className="space-y-3 rounded-md border-2 border-violet-300 bg-violet-50 p-4">
                    <input type="hidden" name="tarefa" value={id} />
                    <div className="font-semibold text-violet-900">Serviço concluído pelo encarregado — validar</div>
                    <Campo rotulo="Parecer (obrigatório para devolver)"><textarea name="parecer" rows={2} className="entrada" /></Campo>
                    <div className="flex flex-wrap gap-2">
                      <Botao variante="sucesso" name="decisao" value="aprovar">★ Aprovar e finalizar</Botao>
                      <Botao variante="perigo" name="decisao" value="rejeitar">↺ Devolver para correção</Botao>
                    </div>
                  </FormAcao>
                )}
                {pendente && (
                  <div className="rounded-md border-2 border-atencao-500 bg-atencao-50 p-4 text-sm">
                    <div className="font-semibold">Pedido de novo prazo de {(pendente.solicitante as unknown as { nome: string })?.nome}</div>
                    <p className="mt-1">Término de {data(pendente.fim_anterior)} para <b>{data(pendente.fim_novo)}</b> — {CAUSAS[pendente.causa]}: {pendente.justificativa}</p>
                    <FormAcao acao={rejeitarNovoPrazo} className="mt-3 flex flex-wrap gap-2">
                      <input type="hidden" name="tarefa" value={id} /><input type="hidden" name="reprogramacao" value={pendente.id} />
                      <input name="parecer" placeholder="Motivo para manter o prazo" className="entrada flex-1" required minLength={5} />
                      <Botao variante="secundario">Manter prazo</Botao>
                    </FormAcao>
                  </div>
                )}
                <details open={Boolean(pendente)} className="rounded-md border border-concreto-200">
                  <summary className="cursor-pointer px-4 py-3 font-semibold">⏱ Reprogramar prazo {pendente ? '(aprovar pedido)' : ''}</summary>
                  <FormAcao acao={reprogramarPrazo} className="grid gap-3 border-t border-concreto-100 p-4 sm:grid-cols-2">
                    <input type="hidden" name="tarefa" value={id} />
                    {pendente && <input type="hidden" name="reprogramacao" value={pendente.id} />}
                    <Campo rotulo="Novo início"><input type="date" name="inicio" required defaultValue={pendente?.inicio_novo ?? t.inicio_previsto} className="entrada" /></Campo>
                    <Campo rotulo="Nova data limite"><input type="date" name="fim" required defaultValue={pendente?.fim_novo ?? t.fim_previsto} className="entrada" /></Campo>
                    <Campo rotulo="Causa"><CausaSelect padrao={pendente?.causa} /></Campo>
                    <Campo rotulo="Justificativa (fica no histórico)"><input name="justificativa" required minLength={10} defaultValue={pendente?.justificativa ?? ''} className="entrada" /></Campo>
                    <div className="sm:col-span-2"><Botao variante="escuro">Salvar novo prazo</Botao></div>
                  </FormAcao>
                </details>
              </div>
            </Cartao>
          )}

          <Cartao titulo="Fotos e anexos">
            <div className="space-y-4">
              {!finalizada && (souResponsavel || gere) && <FotoUpload obraId={t.obra_id} tarefaId={id} escolherCategoria categoria="execucao" />}
              <Galeria anexos={anexos ?? []} />
            </div>
          </Cartao>

          <Cartao titulo="Histórico">
            <FormAcao acao={comentar} limparAoConcluir className="mb-4 flex gap-2">
              <input type="hidden" name="tarefa" value={id} />
              <input name="texto" required placeholder="Escrever comentário…" className="entrada flex-1" />
              <Botao variante="secundario">Enviar</Botao>
            </FormAcao>
            <ol className="relative space-y-4 border-l-2 border-concreto-200 pl-5">
              {eventos?.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-concreto-800 text-[11px] text-white">{ICONES[e.tipo] ?? '•'}</span>
                  <div className="text-sm"><b>{(e.perfis as unknown as { nome: string })?.nome ?? 'Sistema'}</b>
                    {e.status_novo && e.status_anterior !== e.status_novo && <span className="ml-2"><SeloStatus s={e.status_novo} /></span>}</div>
                  <p className="text-sm text-concreto-700">{e.descricao}</p>
                  <div className="text-xs text-concreto-500">{dataHora(e.criado_em)}{e.percentual !== null && ` • ${e.percentual}%`}</div>
                </li>))}
            </ol>
          </Cartao>
        </div>

        <div className="space-y-5">
          {item && (
            <Cartao titulo="Item da planilha" acoes={<Link href={`/obras/${t.obra_id}/avanco?item=${item.id}#lancar`} className="link text-sm">avanço</Link>}>
              <div className="text-sm"><span className="font-mono text-concreto-500">{item.codigo}</span> {item.descricao}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-concreto-600">
                <span>Orçado: <b className="font-mono">{num(item.quantidade, 3)} {item.unidade}</b></span>
                <span>Executado: <b className="font-mono">{num(item.executado, 3)}</b></span>
                {Number(item.executado_pendente) > 0 && <span className="col-span-2 text-sinal-700">+{num(item.executado_pendente, 3)} aguardando validação</span>}
              </div>
              <div className="mt-2"><Progresso valor={Number(item.percentual ?? 0)} cor="bg-ok-500" /></div>
            </Cartao>
          )}
          <Cartao titulo="Qualidade" acoes={!finalizada && <Link href={`/qualidade/nova?tarefa=${id}`} className="link text-sm">+ não conformidade</Link>}>
            {!ncs?.length ? <p className="text-sm text-concreto-500">Nenhuma não conformidade registrada.</p> : (
              <ul className="space-y-2">{ncs.map((n) => (
                <li key={n.id}><Link href={`/qualidade/${n.id}`} className={`block rounded-md border p-3 hover:border-sinal-400 ${n.vencida ? 'border-atraso-500' : 'border-concreto-200'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold">{n.codigo}</span><span className="flex gap-1"><SeloGravidade g={n.gravidade} /><SeloNC s={n.status} /></span></div>
                  <div className="mt-1 text-sm">{n.descricao}</div>
                  <div className="text-xs text-concreto-500">corrigir até {data(n.prazo_correcao)} • {n.responsavel_nome}</div>
                </Link></li>))}
              </ul>)}
          </Cartao>
          <Cartao titulo="Materiais da tarefa" acoes={!finalizada && (souResponsavel || gere) && <Link href={`/materiais/nova?tarefa=${id}`} className="link text-sm">+ pedir</Link>}>
            {!pedidos?.length ? <p className="text-sm text-concreto-500">Nenhuma solicitação vinculada.</p> : (
              <ul className="space-y-2">{pedidos.map((p) => (
                <li key={p.id}><Link href={`/materiais/${p.id}`} className="block rounded-md border border-concreto-200 p-3 hover:border-sinal-400">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold">{codSM(p.numero)}</span><SeloSolicitacao s={p.status} /></div>
                  <div className="mt-1 text-xs text-concreto-500">{p.itens_entregues}/{p.total_itens} itens entregues • necessário {data(p.data_necessidade)}</div>
                  {p.itens_em_risco > 0 && <div className="mt-1 text-xs font-bold text-atraso-700">⚠ {p.itens_em_risco} item(ns) com risco de atraso</div>}
                </Link></li>))}
              </ul>)}
          </Cartao>
          <Cartao titulo="Alterações de prazo">
            {!reprogs?.length ? <p className="text-sm text-concreto-500">Prazo original mantido.</p> : (
              <ul className="space-y-3 text-sm">{reprogs.map((r) => (
                <li key={r.id} className="border-b border-concreto-100 pb-2 last:border-0">
                  <div className="flex justify-between gap-2"><span>{data(r.fim_anterior)} → <b>{data(r.fim_novo)}</b></span>
                    <Selo cor={r.status === 'aprovada' ? 'bg-ok-50 text-ok-700' : r.status === 'rejeitada' ? 'bg-atraso-50 text-atraso-700' : 'bg-atencao-50 text-atencao-700'}>{r.status}</Selo></div>
                  <div className="text-xs text-concreto-500">{CAUSAS[r.causa]} — {r.justificativa}</div>
                  {r.parecer && r.parecer !== r.justificativa && <div className="text-xs text-concreto-600">Parecer: {r.parecer}</div>}
                </li>))}
              </ul>)}
          </Cartao>
        </div>
      </div>
    </>
  );
}
