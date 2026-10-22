import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Progresso, SeloPrazo, SeloPrioridade, SeloSolicitacao, SeloStatus, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { confirmarRecebimento, iniciarServico } from '../tarefas/acoes';
import { codSM, codTarefa, type StatusTarefa } from '@/lib/dominio';
import { SeloGravidade } from '@/components/SelosQualidade';
import { data, hojeISO } from '@/lib/formato';

export const metadata = { title: 'Minhas tarefas' };

/* eslint-disable @typescript-eslint/no-explicit-any */
function CartaoTarefa({ t }: { t: any }) {
  const st = t.status as StatusTarefa;
  const base = 'flex min-h-[48px] items-center justify-center rounded-md border px-2 text-center text-sm font-semibold';
  const botao = `${base} border-concreto-300 bg-white active:bg-concreto-100`;
  return (
    <article className={`rounded-lg border-2 bg-white p-4 shadow-sm ${t.situacao_prazo === 'atrasado' ? 'border-atraso-500' : t.situacao_prazo === 'atencao' ? 'border-atencao-500' : 'border-concreto-200'}`}>
      <Link href={`/tarefas/${t.id}`} className="block">
        <div className="flex items-center justify-between gap-2 text-xs text-concreto-500"><span className="font-mono">{codTarefa(t.numero)} • {t.obra_codigo}</span><SeloPrioridade p={t.prioridade} /></div>
        <h3 className="mt-1 text-lg font-bold leading-tight">{t.titulo}</h3>
        <p className="text-sm text-concreto-600">📍 {t.local ?? t.obra_nome}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>Prazo: <b>{data(t.fim_previsto)}</b></span><SeloPrazo s={t.situacao_prazo} /><SeloStatus s={st} />
        </div>
        {st !== 'aguardando_confirmacao' && <div className="mt-2"><Progresso valor={t.percentual} /></div>}
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {st === 'aguardando_confirmacao' && (
          <FormAcao acao={confirmarRecebimento} className="col-span-2"><input type="hidden" name="tarefa" value={t.id} /><Botao grande variante="escuro">✓ Confirmar recebimento</Botao></FormAcao>)}
        {['aguardando_confirmacao', 'programado', 'aguardando_material', 'paralisado'].includes(st) && (
          <FormAcao acao={iniciarServico} className="col-span-2"><input type="hidden" name="tarefa" value={t.id} />
            <Botao grande>{st === 'aguardando_material' || st === 'paralisado' ? '▶ Retomar serviço' : '▶ Iniciar serviço'}</Botao></FormAcao>)}
        {st === 'em_andamento' && <Link href={`/tarefas/${t.id}#andamento`} className={`${base} col-span-2 border-sinal-500 bg-sinal-500 text-white active:bg-sinal-600`}>↗ Atualizar andamento</Link>}
        <Link href={`/materiais/nova?tarefa=${t.id}`} className={botao}>▤ Solicitar material</Link>
        <Link href={`/tarefas/${t.id}#impedimento`} className={botao}>⚠ Impedimento</Link>
        {st === 'em_andamento' && <Link href={`/tarefas/${t.id}#concluir`} className={`${base} col-span-2 border-ok-500 bg-white text-ok-700`}>⚑ Concluir serviço</Link>}
      </div>
    </article>
  );
}

export default async function Campo() {
  const { supabase, perfil } = await obterSessao();
  const hoje = hojeISO();
  const [{ data: tarefas }, { data: pedidos }, { data: aConfirmar }] = await Promise.all([
    supabase.from('v_tarefas').select('*').eq('encarregado_id', perfil.id).neq('status', 'aprovado').order('fim_previsto'),
    supabase.from('v_solicitacoes').select('*').eq('solicitante_id', perfil.id).in('status', ['aguardando_aprovacao', 'aprovada', 'em_atendimento']).order('data_necessidade'),
    supabase.from('entregas').select('id, quantidade_enviada, enviado_em, solicitacao_itens!inner(material, unidade, solicitacao_id, solicitacoes!inner(numero, solicitante_id))')
      .is('recebido_em', null).eq('solicitacao_itens.solicitacoes.solicitante_id', perfil.id),
  ]);
  const [{ data: correcoes }, { data: minhasObras }] = await Promise.all([
    supabase.from('v_nao_conformidades').select('*').eq('responsavel_id', perfil.id).in('status', ['aberta', 'em_correcao']).order('prazo_correcao'),
    supabase.from('obras').select('id, codigo, nome, planilhas(id)').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).eq('planilhas.ativa', true).order('nome'),
  ]);
  const ts = tarefas ?? [];
  const ativas = ts.filter((t) => !['aguardando_validacao', 'concluido_encarregado'].includes(t.status));
  const hojeLista = ativas.filter((t) => t.inicio_previsto <= hoje || t.status === 'aguardando_confirmacao' || t.status === 'em_andamento');
  const proximas = ativas.filter((t) => !hojeLista.includes(t));
  const validacao = ts.filter((t) => ['aguardando_validacao', 'concluido_encarregado'].includes(t.status));
  const dataExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Recife' });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm capitalize text-concreto-500">{dataExtenso}</p>
        <h1 className="text-2xl font-black uppercase tracking-tight">Minhas tarefas de hoje</h1>
      </div>

      {(aConfirmar?.length ?? 0) > 0 && (
        <section className="rounded-lg border-2 border-sinal-500 bg-sinal-50 p-4">
          <h2 className="font-bold text-sinal-700">📦 Material chegou? Confirme o recebimento</h2>
          <ul className="mt-2 space-y-2">{aConfirmar!.map((e) => {
            const it = e.solicitacao_itens as unknown as { material: string; unidade: string; solicitacao_id: string; solicitacoes: { numero: number } };
            return <li key={e.id}><Link href={`/materiais/${it.solicitacao_id}`} className="flex justify-between rounded-md bg-white p-3 text-sm font-semibold">
              <span>{it.material}</span><span>{e.quantidade_enviada} {it.unidade} →</span></Link></li>;
          })}</ul>
        </section>
      )}

      {(correcoes?.length ?? 0) > 0 && (
        <section className="rounded-lg border-2 border-atraso-500 bg-atraso-50 p-4">
          <h2 className="font-bold text-atraso-700">⚑ Correções que você precisa fazer</h2>
          <ul className="mt-2 space-y-2">{correcoes!.map((n) => (
            <li key={n.id}><Link href={`/qualidade/${n.id}`} className="block rounded-md bg-white p-3">
              <div className="flex items-center justify-between gap-2 text-xs"><span className="font-mono font-bold">{n.codigo} • {n.obra_codigo}</span><SeloGravidade g={n.gravidade} /></div>
              <div className="mt-1 font-semibold">{n.descricao}</div>
              <div className={`text-xs ${n.vencida ? 'font-bold text-atraso-700' : 'text-concreto-500'}`}>📍 {n.local ?? '—'} • corrigir até {data(n.prazo_correcao)}</div>
            </Link></li>))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        {hojeLista.length ? hojeLista.map((t) => <CartaoTarefa key={t.id} t={t} />) : <Vazio>Nenhuma tarefa para hoje. 👍</Vazio>}
      </section>

      {proximas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-concreto-500">Próximas</h2>
          <ul className="divide-y divide-concreto-100 rounded-lg border border-concreto-200 bg-white">
            {proximas.map((t) => <li key={t.id}><Link href={`/tarefas/${t.id}`} className="flex items-center justify-between gap-2 p-3">
              <span className="min-w-0"><span className="block truncate font-semibold">{t.titulo}</span><span className="text-xs text-concreto-500">começa {data(t.inicio_previsto)} • {t.local ?? t.obra_codigo}</span></span>
              <SeloStatus s={t.status} /></Link></li>)}
          </ul>
        </section>
      )}

      {validacao.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-concreto-500">Aguardando o engenheiro validar</h2>
          <ul className="divide-y divide-concreto-100 rounded-lg border border-concreto-200 bg-white">
            {validacao.map((t) => <li key={t.id}><Link href={`/tarefas/${t.id}`} className="flex justify-between gap-2 p-3 text-sm"><span className="truncate">{t.titulo}</span><SeloStatus s={t.status} /></Link></li>)}
          </ul>
        </section>
      )}

      {(minhasObras ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-black uppercase tracking-tight">Avanço e fotos da obra</h2>
          <div className="space-y-2">{minhasObras!.map((o) => {
            const temPlanilha = ((o.planilhas as unknown as { id: string }[]) ?? []).length > 0;
            return (
              <div key={o.id} className="rounded-lg border border-concreto-200 bg-white p-3">
                <div className="mb-2 text-sm font-semibold"><span className="font-mono text-xs text-concreto-500">{o.codigo}</span> {o.nome}</div>
                <div className="grid grid-cols-2 gap-2">
                  {temPlanilha && <Link href={`/obras/${o.id}/avanco#lancar`} className="flex min-h-[48px] items-center justify-center rounded-md bg-ok-500 text-sm font-semibold text-white">↗ Lançar execução</Link>}
                  <Link href={`/obras/${o.id}/avanco`} className="flex min-h-[48px] items-center justify-center rounded-md border border-concreto-300 text-sm font-semibold">📷 Fotos</Link>
                  <Link href={`/qualidade/nova?obra=${o.id}`} className={`flex min-h-[48px] items-center justify-center rounded-md border border-atraso-500 text-sm font-semibold text-atraso-700 ${temPlanilha ? 'col-span-2' : ''}`}>⚑ Não conformidade</Link>
                </div>
              </div>);
          })}</div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-black uppercase tracking-tight">Meus pedidos de material</h2>
          <Link href="/materiais" className="link text-sm">todos</Link>
        </div>
        {!pedidos?.length ? <Vazio>Nenhum pedido em aberto.</Vazio> : (
          <ul className="space-y-2">{pedidos.map((p) => (
            <li key={p.id}><Link href={`/materiais/${p.id}`} className="block rounded-lg border border-concreto-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2"><span className="font-mono font-bold">{codSM(p.numero)}</span><SeloSolicitacao s={p.status} /></div>
              <div className="mt-1 text-sm">{p.tarefa_titulo ?? p.obra_nome}</div>
              <div className="text-xs text-concreto-500">{p.itens_entregues}/{p.total_itens} entregues • preciso até {data(p.data_necessidade)}</div>
              {p.itens_em_risco > 0 && <div className="mt-1 text-xs font-bold text-atraso-700">⚠ Pode chegar depois da data</div>}
            </Link></li>))}
          </ul>)}
        <Link href="/materiais/nova" className="mt-3 flex min-h-[52px] items-center justify-center rounded-md bg-concreto-800 font-semibold text-white">+ Novo pedido de material</Link>
      </section>
    </div>
  );
}
