import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Info, LinkBotao, Progresso, Selo, SeloPrazo, SeloStatus, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { CamposObra } from '@/components/FormObra';
import { Gantt } from '@/components/Gantt';
import { AbasObra } from '@/components/AbasObra';
import { adicionarEtapa, adicionarMembro, atualizarObra, removerMembro } from '../acoes';
import { PAPEIS, SITUACOES_OBRA, TAREFA_ABERTA, codTarefa, type Perfil } from '@/lib/dominio';
import { data } from '@/lib/formato';

export default async function DetalheObra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: obra } = await supabase.from('v_obras').select('*').eq('id', id).maybeSingle();
  if (!obra) notFound();

  const [{ data: tarefas }, { data: etapas }, { data: membros }, { data: pessoas }, { data: pedidos }, { data: pode }] = await Promise.all([
    supabase.from('v_tarefas').select('*').eq('obra_id', id).order('inicio_previsto'),
    supabase.from('etapas').select('*').eq('obra_id', id).order('ordem'),
    supabase.from('obra_membros').select('usuario_id, funcao, perfis!obra_membros_usuario_id_fkey(nome, papel)').eq('obra_id', id),
    supabase.from('perfis').select('*').eq('ativo', true).order('nome'),
    supabase.from('v_solicitacoes').select('id, status').eq('obra_id', id).in('status', ['aguardando_aprovacao', 'aprovada', 'em_atendimento']),
    supabase.rpc('gere_obra', { p_obra: id }),
  ]);
  const gere = Boolean(pode);
  const ts = tarefas ?? [];
  const lista = (pessoas ?? []) as Perfil[];
  const abertas = ts.filter((t) => TAREFA_ABERTA.includes(t.status));
  const atrasadas = ts.filter((t) => t.situacao_prazo === 'atrasado');

  return (
    <>
      <Cabecalho
        titulo={obra.nome}
        sub={<><span className="font-mono">{obra.codigo}</span> • {obra.cliente ?? 'sem cliente'} • <Selo cor="bg-concreto-100 text-concreto-700">{SITUACOES_OBRA[obra.situacao]}</Selo></>}
        acoes={<>
          {gere && <LinkBotao href={`/tarefas/nova?obra=${id}`}>+ Tarefa</LinkBotao>}
          {gere && <LinkBotao href={`/tarefas/importar?obra=${id}`} variante="secundario">⬆ Planilha de tarefas</LinkBotao>}
          <LinkBotao href={`/materiais/pedido?obra=${id}`} variante="secundario">🖨 Pedido de material (PDF)</LinkBotao>
          <LinkBotao href={`/tarefas?obra=${id}`} variante="secundario">Plano de ação</LinkBotao>
          <LinkBotao href={`/tarefas?obra=${id}&visao=kanban`} variante="secundario">Kanban</LinkBotao>
        </>}
      />

      <AbasObra id={id} atual="geral" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-lg border border-concreto-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-concreto-500">Avanço físico
            <Link href={`/obras/${id}/avanco`} className="link normal-case">detalhar →</Link></div>
          <div className="mt-1 font-mono text-2xl font-bold">{obra.avanco_fisico}%</div>
          <Progresso valor={obra.avanco_fisico} />
        </div>
        <Indicador rotulo="Em aberto" valor={abertas.length} href={`/tarefas?obra=${id}`} />
        <Indicador rotulo="Atrasadas" valor={atrasadas.length} tom={atrasadas.length ? 'atraso' : 'ok'} href={`/tarefas?obra=${id}&prazo=atrasado`} />
        <Indicador rotulo="Pedidos abertos" valor={pedidos?.length ?? 0} tom="sinal" href={`/materiais?obra=${id}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao titulo="Cronograma">
            {ts.length ? <Gantt tarefas={ts} /> : <Vazio>Nenhuma tarefa planejada.</Vazio>}
          </Cartao>

          <Cartao titulo="Serviços em aberto" acoes={<Link href={`/tarefas?obra=${id}`} className="link text-sm">ver todos</Link>}>
            {!abertas.length ? <Vazio>Sem serviços em aberto.</Vazio> : (
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>%</th></tr></thead>
                <tbody>{abertas.slice(0, 15).map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/tarefas/${t.id}`} className="link">{codTarefa(t.numero)}</Link> {t.titulo}<div className="text-xs text-concreto-500">{t.local}</div></td>
                    <td className="whitespace-nowrap">{t.encarregado_nome}</td>
                    <td className="whitespace-nowrap">{data(t.fim_previsto)}<div><SeloPrazo s={t.situacao_prazo} /></div></td>
                    <td><SeloStatus s={t.status} /></td>
                    <td className="w-28"><Progresso valor={t.percentual} /></td>
                  </tr>))}
                </tbody></table></div>
            )}
          </Cartao>
        </div>

        <div className="space-y-5">
          <Cartao titulo="Dados da obra">
            <dl className="grid grid-cols-2 gap-3">
              <Info rotulo="Engenheiro">{obra.engenheiro_nome ?? '—'}</Info>
              <Info rotulo="Encarregado">{obra.encarregado_nome ?? '—'}</Info>
              <Info rotulo="Início">{data(obra.data_inicio)}</Info>
              <Info rotulo="Conclusão prevista">{data(obra.data_prevista_conclusao)}</Info>
              <div className="col-span-2"><Info rotulo="Endereço">{obra.endereco ?? '—'}</Info></div>
            </dl>
          </Cartao>

          <Cartao titulo="Etapas construtivas">
            {etapas?.length ? (
              <ol className="space-y-1 text-sm">{etapas.map((e) => (
                <li key={e.id} className="flex justify-between gap-2"><span>{e.ordem}. {e.nome}</span>
                  <span className="text-xs text-concreto-500">{e.inicio_previsto ? `${data(e.inicio_previsto)} – ${data(e.fim_previsto)}` : ''}</span></li>))}
              </ol>) : <p className="text-sm text-concreto-500">Nenhuma etapa cadastrada.</p>}
            {gere && (
              <FormAcao acao={adicionarEtapa} limparAoConcluir className="mt-4 space-y-2 border-t border-concreto-100 pt-3">
                <input type="hidden" name="obra_id" value={id} />
                <input name="nome" placeholder="Ex.: Fundação, Estrutura, Alvenaria…" className="entrada" required />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" name="inicio_previsto" className="entrada" aria-label="Início previsto" />
                  <input type="date" name="fim_previsto" className="entrada" aria-label="Fim previsto" />
                </div>
                <Botao variante="secundario">Adicionar etapa</Botao>
              </FormAcao>
            )}
          </Cartao>

          <Cartao titulo="Equipe vinculada">
            <ul className="space-y-2 text-sm">
              {(membros ?? []).map((m) => {
                const p = m.perfis as unknown as { nome: string; papel: keyof typeof PAPEIS } | null;
                return (
                  <li key={m.usuario_id} className="flex items-center justify-between gap-2">
                    <span>{p?.nome}<span className="block text-xs text-concreto-500">{m.funcao ?? PAPEIS[p?.papel ?? 'encarregado']}</span></span>
                    {gere && m.usuario_id !== obra.engenheiro_id && m.usuario_id !== obra.encarregado_id && (
                      <form action={removerMembro}><input type="hidden" name="obra_id" value={id} /><input type="hidden" name="usuario_id" value={m.usuario_id} />
                        <button className="text-xs text-atraso-700 hover:underline">remover</button></form>)}
                  </li>);
              })}
            </ul>
            {gere && (
              <FormAcao acao={adicionarMembro} limparAoConcluir className="mt-4 space-y-2 border-t border-concreto-100 pt-3">
                <input type="hidden" name="obra_id" value={id} />
                <select name="usuario_id" className="entrada" required defaultValue="">
                  <option value="" disabled>Selecionar colaborador…</option>
                  {lista.filter((p) => p.papel === 'engenheiro' || p.papel === 'encarregado').map((p) => <option key={p.id} value={p.id}>{p.nome} — {PAPEIS[p.papel]}</option>)}
                </select>
                <input name="funcao" placeholder="Função na obra (opcional)" className="entrada" />
                <Botao variante="secundario">Vincular à obra</Botao>
              </FormAcao>
            )}
          </Cartao>
        </div>
      </div>

      {gere && (
        <details className="mt-5 rounded-lg border border-concreto-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold uppercase tracking-wide text-concreto-700">Editar dados da obra</summary>
          <div className="border-t border-concreto-100 p-4">
            <FormAcao acao={atualizarObra}>
              <CamposObra obra={obra} rotulo="Salvar alterações"
                engenheiros={lista.filter((p) => p.papel === 'engenheiro')} encarregados={lista.filter((p) => p.papel === 'encarregado')} />
            </FormAcao>
          </div>
        </details>
      )}
    </>
  );
}
