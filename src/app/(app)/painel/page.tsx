import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, LinkBotao, Progresso, SeloStatus, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { gerarAlertasAgora } from './acoes';
import { codSM, codTarefa } from '@/lib/dominio';
import { data } from '@/lib/formato';

export const metadata = { title: 'Painel' };

export default async function Painel({ searchParams }: { searchParams: Promise<{ obra?: string; de?: string; ate?: string }> }) {
  const f = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'engenheiro');

  let qt = supabase.from('v_tarefas').select('*').limit(5000);
  if (f.obra) qt = qt.eq('obra_id', f.obra);
  if (f.de) qt = qt.gte('fim_previsto', f.de);
  if (f.ate) qt = qt.lte('inicio_previsto', f.ate);
  let qs = supabase.from('v_solicitacoes').select('*').eq('status', 'aguardando_aprovacao');
  if (f.obra) qs = qs.eq('obra_id', f.obra);
  let qr = supabase.from('v_itens').select('*').eq('risco_atraso', true);
  if (f.obra) qr = qr.eq('obra_id', f.obra);

  const [{ data: tarefas }, { data: obras }, { data: pedidosAprov }, { data: riscos }, { data: reprogs }] = await Promise.all([
    qt, supabase.from('v_obras').select('*').order('nome'), qs, qr,
    supabase.from('reprogramacoes').select('id, tarefa_id, fim_novo, tarefas!inner(numero, titulo, obra_id)').eq('status', 'pendente'),
  ]);
  let qn = supabase.from('v_nao_conformidades').select('id, codigo, descricao, status, vencida, obra_id').in('status', ['aberta', 'em_correcao', 'corrigida']);
  if (f.obra) qn = qn.eq('obra_id', f.obra);
  let qm = supabase.from('medicoes').select('id, obra_id').eq('status', 'lancada');
  if (f.obra) qm = qm.eq('obra_id', f.obra);
  const [{ data: ncs }, { data: medPend }] = await Promise.all([qn, qm]);
  const ncVerificar = (ncs ?? []).filter((n) => n.status === 'corrigida');
  const medPorObra = new Map<string, number>();
  (medPend ?? []).forEach((m) => medPorObra.set(m.obra_id, (medPorObra.get(m.obra_id) ?? 0) + 1));
  const ts = tarefas ?? [];
  const conta = (fn: (t: (typeof ts)[number]) => boolean) => ts.filter(fn).length;
  const total = ts.length;
  const aprovadas = conta((t) => t.status === 'aprovado');
  const pendentes = conta((t) => ['pendente', 'aguardando_confirmacao', 'programado'].includes(t.status));
  const andamento = conta((t) => t.status === 'em_andamento');
  const material = conta((t) => t.status === 'aguardando_material' || t.status === 'paralisado');
  const validar = ts.filter((t) => t.status === 'aguardando_validacao' || t.status === 'concluido_encarregado');
  const atrasadas = ts.filter((t) => t.situacao_prazo === 'atrasado').sort((a, b) => b.dias_atraso - a.dias_atraso);
  const pctConclusao = total ? Math.round((aprovadas / total) * 100) : 0;
  const concluidasNoPrazo = conta((t) => t.status === 'aprovado' && t.dias_atraso === 0);

  // Produtividade por encarregado
  const porEnc = new Map<string, { nome: string; total: number; aprovadas: number; atrasadas: number; noPrazo: number; pct: number }>();
  for (const t of ts) {
    const r = porEnc.get(t.encarregado_id) ?? { nome: t.encarregado_nome, total: 0, aprovadas: 0, atrasadas: 0, noPrazo: 0, pct: 0 };
    r.total++; r.pct += t.status === 'aprovado' ? 100 : t.percentual;
    if (t.status === 'aprovado') { r.aprovadas++; if (t.dias_atraso === 0) r.noPrazo++; }
    if (t.situacao_prazo === 'atrasado') r.atrasadas++;
    porEnc.set(t.encarregado_id, r);
  }
  const reprogsFiltradas = (reprogs ?? []).filter((r) => !f.obra || (r.tarefas as unknown as { obra_id: string }).obra_id === f.obra);
  const obrasLista = (obras ?? []).filter((o) => !f.obra || o.id === f.obra);
  const qs2 = (extra: Record<string, string>) => `/tarefas?${new URLSearchParams({ ...(f.obra ? { obra: f.obra } : {}), ...extra })}`;

  return (
    <>
      <Cabecalho titulo={perfil.papel === 'admin' ? 'Visão gerencial consolidada' : 'Painel do engenheiro'}
        sub={`${obrasLista.length} obra(s) • ${total} tarefa(s) no filtro`}
        acoes={<><LinkBotao href="/tarefas/nova">+ Nova tarefa</LinkBotao><LinkBotao href="/tarefas?visao=kanban" variante="secundario">Kanban</LinkBotao></>} />

      <form className="mb-5 flex flex-wrap gap-2 rounded-lg border border-concreto-200 bg-white p-3">
        <select name="obra" defaultValue={f.obra ?? ''} className="entrada w-auto min-w-[220px] flex-1"><option value="">Todas as obras</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <input type="date" name="de" defaultValue={f.de} className="entrada w-auto" aria-label="De" />
        <input type="date" name="ate" defaultValue={f.ate} className="entrada w-auto" aria-label="Até" />
        <button className="rounded-md bg-concreto-800 px-4 py-2 text-sm font-semibold text-white">Aplicar</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Indicador rotulo="Total de tarefas" valor={total} href={qs2({})} />
        <Indicador rotulo="Pendentes" valor={pendentes} tom="sinal" href={qs2({ status: 'aguardando_confirmacao' })} detalhe="a confirmar / programadas" />
        <Indicador rotulo="Em andamento" valor={andamento} href={qs2({ status: 'em_andamento' })} />
        <Indicador rotulo="Concluídas" valor={aprovadas} tom="ok" href={qs2({ status: 'aprovado' })} detalhe={`${concluidasNoPrazo} no prazo`} />
        <Indicador rotulo="Atrasadas" valor={atrasadas.length} tom={atrasadas.length ? 'atraso' : 'ok'} href={qs2({ prazo: 'atrasado' })} />
        <Indicador rotulo="Aguard. material / parado" valor={material} tom={material ? 'atencao' : 'ok'} href={qs2({ status: 'aguardando_material' })} />
        <Indicador rotulo="Validar conclusão" valor={validar.length} tom={validar.length ? 'sinal' : 'ok'} href={qs2({ status: 'aguardando_validacao' })} />
        <Indicador rotulo="Pedidos p/ aprovar" valor={pedidosAprov?.length ?? 0} tom={pedidosAprov?.length ? 'sinal' : 'ok'} href="/materiais?status=aguardando_aprovacao" />
        <Indicador rotulo="Não conformidades" valor={ncs?.length ?? 0} tom={(ncs ?? []).some((n) => n.vencida) ? 'atraso' : ncs?.length ? 'atencao' : 'ok'}
          href={f.obra ? `/qualidade?obra=${f.obra}` : '/qualidade'} detalhe={`${(ncs ?? []).filter((n) => n.vencida).length} com correção vencida`} />
        <Indicador rotulo="Materiais em risco" valor={riscos?.length ?? 0} tom={riscos?.length ? 'atraso' : 'ok'} href="/materiais?risco=1" />
        <div className="col-span-2 rounded-lg border border-concreto-200 bg-white px-4 py-3 sm:col-span-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-concreto-500">Conclusão dos serviços (aprovados / total)</div>
          <div className="mt-1 font-mono text-2xl font-bold">{pctConclusao}%</div>
          <Progresso valor={pctConclusao} cor="bg-ok-500" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Precisa da sua ação">
          {!validar.length && !pedidosAprov?.length && !reprogsFiltradas.length && !ncVerificar.length && !medPorObra.size ? <Vazio>Nada pendente. 👍</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">
              {[...medPorObra.entries()].map(([o, q]) => <li key={'m' + o} className="py-2"><Link href={`/obras/${o}/avanco`} className="flex justify-between gap-2"><span>↗ Validar <b>{q}</b> lançamento(s) de execução</span><span className="text-xs text-concreto-500">{obras?.find((x) => x.id === o)?.codigo}</span></Link></li>)}
              {ncVerificar.map((n) => <li key={n.id} className="py-2"><Link href={`/qualidade/${n.id}`} className="flex justify-between gap-2"><span>⚑ Verificar correção <b>{n.codigo}</b> {n.descricao}</span></Link></li>)}
              {validar.map((t) => <li key={t.id} className="py-2"><Link href={`/tarefas/${t.id}`} className="flex justify-between gap-2"><span>⚑ Validar <b>{codTarefa(t.numero)}</b> {t.titulo}</span><span className="text-xs text-concreto-500">{t.encarregado_nome}</span></Link></li>)}
              {pedidosAprov?.map((s) => <li key={s.id} className="py-2"><Link href={`/materiais/${s.id}`} className="flex justify-between gap-2"><span>▤ Aprovar <b>{codSM(s.numero)}</b> • {s.total_itens} item(ns)</span><span className="text-xs text-concreto-500">até {data(s.data_necessidade)}</span></Link></li>)}
              {reprogsFiltradas.map((r) => { const t = r.tarefas as unknown as { numero: number; titulo: string };
                return <li key={r.id} className="py-2"><Link href={`/tarefas/${r.tarefa_id}`} className="flex justify-between gap-2"><span>⏱ Novo prazo pedido: <b>{codTarefa(t.numero)}</b> {t.titulo}</span><span className="text-xs text-concreto-500">{data(r.fim_novo)}</span></Link></li>; })}
            </ul>)}
        </Cartao>

        <Cartao titulo="Tarefas atrasadas" acoes={<Link href={qs2({ prazo: 'atrasado' })} className="link text-sm">ver todas</Link>}>
          {!atrasadas.length ? <Vazio>Nenhuma tarefa atrasada.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{atrasadas.slice(0, 10).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/tarefas/${t.id}`} className="min-w-0"><span className="block truncate"><b>{codTarefa(t.numero)}</b> {t.titulo}</span>
                  <span className="text-xs text-concreto-500">{t.obra_codigo} • {t.encarregado_nome} • venceu {data(t.fim_previsto)}</span></Link>
                <span className="shrink-0 text-right"><span className="block font-mono font-bold text-atraso-700">{t.dias_atraso}d</span><SeloStatus s={t.status} /></span>
              </li>))}
            </ul>)}
        </Cartao>

        <Cartao titulo="Desempenho por obra">
          {!obrasLista.length ? <Vazio>Sem obras.</Vazio> : (
            <div className="overflow-x-auto"><table className="tabela">
              <thead><tr><th>Obra</th><th>Tarefas</th><th>Atrasadas</th><th className="w-40">Avanço físico</th></tr></thead>
              <tbody>{obrasLista.map((o) => (
                <tr key={o.id}><td><Link href={`/obras/${o.id}`} className="link">{o.codigo}</Link> <span className="text-xs text-concreto-500">{o.nome}</span></td>
                  <td className="font-mono">{o.tarefas_aprovadas}/{o.total_tarefas}</td>
                  <td className={`font-mono ${o.tarefas_atrasadas ? 'font-bold text-atraso-700' : ''}`}>{o.tarefas_atrasadas}</td>
                  <td><Progresso valor={o.avanco_fisico} /></td></tr>))}
              </tbody></table></div>)}
        </Cartao>

        <Cartao titulo="Produtividade por encarregado">
          {!porEnc.size ? <Vazio>Sem dados no período.</Vazio> : (
            <div className="overflow-x-auto"><table className="tabela">
              <thead><tr><th>Encarregado</th><th>Tarefas</th><th>Aprovadas</th><th>No prazo</th><th>Atrasadas</th><th className="w-32">Execução média</th></tr></thead>
              <tbody>{[...porEnc.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, r]) => (
                <tr key={id}><td><Link href={qs2({ responsavel: id })} className="link">{r.nome}</Link></td>
                  <td className="font-mono">{r.total}</td><td className="font-mono">{r.aprovadas}</td>
                  <td className="font-mono">{r.aprovadas ? `${Math.round((r.noPrazo / r.aprovadas) * 100)}%` : '—'}</td>
                  <td className={`font-mono ${r.atrasadas ? 'font-bold text-atraso-700' : ''}`}>{r.atrasadas}</td>
                  <td><Progresso valor={r.pct / r.total} /></td></tr>))}
              </tbody></table></div>)}
        </Cartao>

        <Cartao titulo="Materiais com risco de atraso" className="lg:col-span-2">
          {!riscos?.length ? <Vazio>Nenhum material com previsão de entrega após a data de necessidade.</Vazio> : (
            <div className="overflow-x-auto"><table className="tabela">
              <thead><tr><th>Pedido</th><th>Material</th><th>Obra / serviço</th><th>Necessário</th><th>Previsão</th><th>Fornecedor</th></tr></thead>
              <tbody>{riscos.map((i) => (
                <tr key={i.id}><td><Link href={`/materiais/${i.solicitacao_id}`} className="link font-mono">{codSM(i.solicitacao_numero)}</Link></td>
                  <td>{i.material}</td><td className="text-xs">{i.obra_codigo} • {i.tarefa_titulo ?? 'geral'}</td>
                  <td>{data(i.data_necessidade)}</td><td className="font-bold text-atraso-700">{data(i.previsao_entrega)}</td><td className="text-xs">{i.fornecedor}</td></tr>))}
              </tbody></table></div>)}
        </Cartao>
      </div>

      {perfil.papel === 'admin' && (
        <FormAcao acao={gerarAlertasAgora} className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-concreto-300 p-4 text-sm">
          <span className="text-concreto-600">Os alertas de prazo rodam automaticamente de hora em hora.</span>
          <Botao variante="secundario">Verificar alertas agora</Botao>
        </FormAcao>
      )}
    </>
  );
}
