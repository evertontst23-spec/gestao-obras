import Link from 'next/link';
import { obterSessao, gestor } from '@/lib/sessao';
import { Cabecalho, LinkBotao, Progresso, SeloPrazo, SeloPrioridade, SeloStatus, Vazio } from '@/components/ui';
import { SITUACAO_PRAZO, STATUS_TAREFA, codTarefa, type SituacaoPrazo, type StatusTarefa } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';

export const metadata = { title: 'Plano de ação' };

type Filtros = { obra?: string; responsavel?: string; status?: string; prazo?: string; etapa?: string; de?: string; ate?: string; visao?: string; mes?: string };

export default async function Tarefas({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const { supabase, perfil } = await obterSessao();
  const visao = f.visao ?? 'lista';

  let q = supabase.from('v_tarefas').select('*').order('fim_previsto').limit(1000);
  if (f.obra) q = q.eq('obra_id', f.obra);
  if (f.responsavel) q = q.eq('encarregado_id', f.responsavel);
  if (f.status) q = q.eq('status', f.status);
  if (f.prazo) q = q.eq('situacao_prazo', f.prazo);
  if (f.etapa) q = q.eq('etapa_id', f.etapa);
  if (f.de) q = q.gte('fim_previsto', f.de);
  if (f.ate) q = q.lte('inicio_previsto', f.ate);

  const [{ data: tarefas }, { data: obras }, { data: encarregados }, { data: etapas }] = await Promise.all([
    q,
    supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('perfis').select('id, nome').eq('papel', 'encarregado').order('nome'),
    f.obra ? supabase.from('etapas').select('id, nome').eq('obra_id', f.obra).order('ordem') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const ts = tarefas ?? [];
  const params = (extra: Partial<Filtros>) => {
    const p = new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/tarefas?${p}`;
  };

  return (
    <>
      <Cabecalho titulo="Plano de ação" sub={`${ts.length} tarefa(s)`}
        acoes={gestor(perfil.papel) && <>
          <Link href={f.obra ? `/tarefas/importar?obra=${f.obra}` : '/tarefas/importar'} className="inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold hover:border-sinal-400">⬆ Importar planilha de tarefas</Link>
          <LinkBotao href={f.obra ? `/tarefas/nova?obra=${f.obra}` : '/tarefas/nova'}>+ Nova tarefa</LinkBotao></>} />

      <form className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-concreto-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-8">
        <input type="hidden" name="visao" value={visao} />
        <select name="obra" defaultValue={f.obra ?? ''} className="entrada col-span-2"><option value="">Todas as obras</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <select name="responsavel" defaultValue={f.responsavel ?? ''} className="entrada"><option value="">Responsável</option>
          {encarregados?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <select name="status" defaultValue={f.status ?? ''} className="entrada"><option value="">Status</option>
          {Object.entries(STATUS_TAREFA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
        <select name="prazo" defaultValue={f.prazo ?? ''} className="entrada"><option value="">Prazo</option>
          {Object.entries(SITUACAO_PRAZO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
        <select name="etapa" defaultValue={f.etapa ?? ''} className="entrada" disabled={!f.obra} title={f.obra ? '' : 'Selecione a obra'}>
          <option value="">Etapa</option>{etapas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        <input type="date" name="de" defaultValue={f.de} className="entrada" aria-label="Período de" />
        <input type="date" name="ate" defaultValue={f.ate} className="entrada" aria-label="Período até" />
        <div className="col-span-2 flex gap-2 md:col-span-4 xl:col-span-8">
          <button className="rounded-md bg-concreto-800 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
          <Link href={`/tarefas?visao=${visao}`} className="rounded-md px-3 py-2 text-sm text-concreto-600 hover:bg-concreto-100">Limpar</Link>
          <div className="ml-auto flex overflow-hidden rounded-md border border-concreto-300 text-sm font-semibold">
            {[['lista', 'Lista'], ['kanban', 'Kanban'], ['calendario', 'Calendário']].map(([k, r]) => (
              <Link key={k} href={params({ visao: k })} className={`px-3 py-2 ${visao === k ? 'bg-sinal-500 text-white' : 'bg-white text-concreto-700 hover:bg-concreto-50'}`}>{r}</Link>))}
          </div>
        </div>
      </form>

      {!ts.length ? <Vazio>Nenhuma tarefa encontrada com estes filtros.</Vazio>
        : visao === 'kanban' ? <Kanban tarefas={ts} />
        : visao === 'calendario' ? <Calendario tarefas={ts} mes={f.mes} link={(m) => params({ mes: m })} />
        : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Serviço / local</th><th>Obra</th><th>Responsável</th><th>Início</th><th>Limite</th><th>Prazo</th><th>Prioridade</th><th>Status</th><th className="w-32">Executado</th></tr></thead>
            <tbody>
              {ts.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/tarefas/${t.id}`} className="link font-mono">{codTarefa(t.numero)}</Link></td>
                  <td className="min-w-[220px]"><Link href={`/tarefas/${t.id}`} className="font-semibold hover:underline">{t.titulo}</Link>
                    <div className="text-xs text-concreto-500">{[t.etapa_nome, t.local].filter(Boolean).join(' • ')}</div></td>
                  <td className="whitespace-nowrap text-xs">{t.obra_codigo}</td>
                  <td className="whitespace-nowrap">{t.encarregado_nome}</td>
                  <td className="whitespace-nowrap">{data(t.inicio_previsto)}</td>
                  <td className="whitespace-nowrap">{data(t.fim_previsto)}{t.dias_atraso > 0 && t.situacao_prazo === 'atrasado' && <div className="text-xs font-bold text-atraso-700">{t.dias_atraso} d atraso</div>}</td>
                  <td><SeloPrazo s={t.situacao_prazo} /></td>
                  <td><SeloPrioridade p={t.prioridade} /></td>
                  <td><SeloStatus s={t.status} /></td>
                  <td><Progresso valor={t.status === 'aprovado' ? 100 : t.percentual} /></td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Kanban({ tarefas }: { tarefas: any[] }) {
  const colunas: { titulo: string; status: StatusTarefa[] }[] = [
    { titulo: 'A confirmar', status: ['pendente', 'aguardando_confirmacao'] },
    { titulo: 'Programado', status: ['programado'] },
    { titulo: 'Em andamento', status: ['em_andamento'] },
    { titulo: 'Impedido', status: ['aguardando_material', 'paralisado'] },
    { titulo: 'Validar', status: ['concluido_encarregado', 'aguardando_validacao'] },
    { titulo: 'Aprovado', status: ['aprovado'] },
  ];
  const borda: Record<SituacaoPrazo, string> = { no_prazo: 'border-l-ok-500', atencao: 'border-l-atencao-500', atrasado: 'border-l-atraso-500', concluido: 'border-l-concreto-300' };
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {colunas.map((c) => {
        const itens = tarefas.filter((t) => c.status.includes(t.status));
        return (
          <div key={c.titulo} className="w-72 shrink-0 snap-start rounded-lg bg-concreto-100 p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-concreto-600">
              {c.titulo}<span className="rounded bg-white px-1.5 font-mono">{itens.length}</span>
            </div>
            <div className="space-y-2">
              {itens.map((t) => (
                <Link key={t.id} href={`/tarefas/${t.id}`} className={`block rounded-md border border-concreto-200 border-l-4 bg-white p-3 text-sm shadow-sm hover:border-sinal-400 ${borda[t.situacao_prazo as SituacaoPrazo]}`}>
                  <div className="flex justify-between gap-2 text-xs text-concreto-500"><span className="font-mono">{codTarefa(t.numero)}</span><span>{data(t.fim_previsto)}</span></div>
                  <div className="mt-1 font-semibold leading-snug">{t.titulo}</div>
                  <div className="mt-1 text-xs text-concreto-500">{t.encarregado_nome} • {t.obra_codigo}</div>
                  <div className="mt-2 flex items-center gap-2"><SeloPrioridade p={t.prioridade} />{t.status !== 'aprovado' && <div className="flex-1"><Progresso valor={t.percentual} /></div>}</div>
                </Link>))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Calendario({ tarefas, mes, link }: { tarefas: any[]; mes?: string; link: (m: string) => string }) {
  const base = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : hojeISO().slice(0, 7);
  const [a, m] = base.split('-').map(Number);
  const primeiro = new Date(Date.UTC(a, m - 1, 1));
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const offset = primeiro.getUTCDay();
  const iso = (d: number) => `${base}-${String(d).padStart(2, '0')}`;
  const mesAnt = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
  const mesProx = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
  const hoje = hojeISO();
  const cores: Record<SituacaoPrazo, string> = { no_prazo: 'bg-ok-50 text-ok-700', atencao: 'bg-atencao-50 text-atencao-700', atrasado: 'bg-atraso-50 text-atraso-700', concluido: 'bg-concreto-100 text-concreto-600' };
  return (
    <div className="rounded-lg border border-concreto-200 bg-white">
      <div className="flex items-center justify-between border-b border-concreto-100 px-4 py-2">
        <Link href={link(mesAnt)} className="rounded px-2 py-1 hover:bg-concreto-100">←</Link>
        <b className="capitalize">{primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
        <Link href={link(mesProx)} className="rounded px-2 py-1 hover:bg-concreto-100">→</Link>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-concreto-500">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} className="min-h-[90px] border-t border-concreto-100 bg-concreto-50" />)}
        {Array.from({ length: diasMes }).map((_, i) => {
          const d = iso(i + 1);
          const inicios = tarefas.filter((t) => t.inicio_previsto === d);
          const limites = tarefas.filter((t) => t.fim_previsto === d);
          return (
            <div key={d} className={`min-h-[90px] border-l border-t border-concreto-100 p-1 ${d === hoje ? 'bg-sinal-50' : ''}`}>
              <div className={`text-xs font-bold ${d === hoje ? 'text-sinal-600' : 'text-concreto-500'}`}>{i + 1}</div>
              <div className="space-y-0.5">
                {inicios.map((t) => <Link key={'i' + t.id} href={`/tarefas/${t.id}`} title={`Início: ${t.titulo}`} className="block truncate rounded bg-sky-100 px-1 text-[10px] text-sky-800">▶ {t.titulo}</Link>)}
                {limites.map((t) => <Link key={'f' + t.id} href={`/tarefas/${t.id}`} title={`Prazo: ${t.titulo}`} className={`block truncate rounded px-1 text-[10px] ${cores[t.situacao_prazo as SituacaoPrazo]}`}>■ {t.titulo}</Link>)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 border-t border-concreto-100 px-4 py-2 text-[11px] text-concreto-500"><span>▶ início previsto</span><span>■ data limite (cor = situação do prazo)</span></div>
    </div>
  );
}
