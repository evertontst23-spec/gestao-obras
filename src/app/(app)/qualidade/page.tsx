import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Indicador, LinkBotao, Vazio } from '@/components/ui';
import { AbasObra } from '@/components/AbasObra';
import { SeloGravidade, SeloNC, STATUS_NC } from '@/components/SelosQualidade';
import { codTarefa } from '@/lib/dominio';
import { data } from '@/lib/formato';

export const metadata = { title: 'Qualidade e não conformidades' };

export default async function Qualidade({ searchParams }: { searchParams: Promise<{ obra?: string; status?: string; minhas?: string }> }) {
  const f = await searchParams;
  const { supabase, perfil } = await obterSessao();
  let q = supabase.from('v_nao_conformidades').select('*').order('aberta_em', { ascending: false }).limit(300);
  if (f.obra) q = q.eq('obra_id', f.obra);
  if (f.minhas || perfil.papel === 'encarregado') q = q.eq('responsavel_id', perfil.id);
  const [{ data: lista }, { data: obras }, obraSel] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
    f.obra ? supabase.from('obras').select('id, codigo, nome').eq('id', f.obra).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const todas = lista ?? [];
  const abertas = todas.filter((n) => ['aberta', 'em_correcao'].includes(n.status));
  const vencidas = todas.filter((n) => n.vencida);
  const verificar = todas.filter((n) => n.status === 'corrigida');
  const filtradas = f.status === 'todas' ? todas : f.status ? todas.filter((n) => n.status === f.status) : todas.filter((n) => !['verificada', 'cancelada'].includes(n.status));
  const link = (extra: Record<string, string>) => `/qualidade?${new URLSearchParams({ ...(f.obra ? { obra: f.obra } : {}), ...extra })}`;

  return (
    <>
      <Cabecalho titulo={obraSel.data ? obraSel.data.nome : perfil.papel === 'encarregado' ? 'Correções sob minha responsabilidade' : 'Qualidade e não conformidades'}
        sub={obraSel.data ? <span className="font-mono">{obraSel.data.codigo}</span> : undefined}
        acoes={perfil.papel !== 'compras' && perfil.papel !== 'almoxarifado' && <LinkBotao href={f.obra ? `/qualidade/nova?obra=${f.obra}` : '/qualidade/nova'}>+ Não conformidade</LinkBotao>} />
      {f.obra && <AbasObra id={f.obra} atual="qualidade" />}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Abertas" valor={abertas.length} tom={abertas.length ? 'atraso' : 'ok'} href={link({})} />
        <Indicador rotulo="Correção vencida" valor={vencidas.length} tom={vencidas.length ? 'atraso' : 'ok'} />
        <Indicador rotulo="Corrigidas a verificar" valor={verificar.length} tom={verificar.length ? 'sinal' : 'ok'} href={link({ status: 'corrigida' })} />
        <Indicador rotulo="Encerradas" valor={todas.filter((n) => n.status === 'verificada').length} tom="ok" href={link({ status: 'verificada' })} />
      </div>

      <form className="mb-4 flex flex-wrap gap-2 rounded-lg border border-concreto-200 bg-white p-3">
        {!f.obra && <select name="obra" defaultValue="" className="entrada w-auto min-w-[200px] flex-1"><option value="">Todas as obras</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>}
        {f.obra && <input type="hidden" name="obra" value={f.obra} />}
        <select name="status" defaultValue={f.status ?? ''} className="entrada w-auto"><option value="">Pendentes</option><option value="todas">Todas</option>
          {Object.entries(STATUS_NC).map(([k, v]) => <option key={k} value={k}>{v.r}</option>)}</select>
        {perfil.papel !== 'encarregado' && <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="minhas" value="1" defaultChecked={!!f.minhas} className="accent-sinal-500" /> Só minhas</label>}
        <button className="rounded-md bg-concreto-800 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>

      {!filtradas.length ? <Vazio>Nenhuma não conformidade {f.status ? 'neste filtro' : 'pendente'}. 👍</Vazio> : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtradas.map((n) => (
            <Link key={n.id} href={`/qualidade/${n.id}`} className={`block rounded-lg border-2 bg-white p-4 hover:border-sinal-400 ${n.vencida ? 'border-atraso-500' : 'border-concreto-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-sm font-bold">{n.codigo}</span>
                <span className="flex gap-1"><SeloGravidade g={n.gravidade} /><SeloNC s={n.status} /></span></div>
              <p className="mt-1 font-semibold leading-snug">{n.descricao}</p>
              <p className="mt-1 text-xs text-concreto-500">{n.obra_codigo}{n.local && ` • ${n.local}`}{n.tarefa_numero && ` • ${codTarefa(n.tarefa_numero)}`}{n.item_codigo && ` • item ${n.item_codigo}`}</p>
              <p className={`mt-1 text-xs ${n.vencida ? 'font-bold text-atraso-700' : 'text-concreto-600'}`}>Responsável: {n.responsavel_nome} • corrigir até {data(n.prazo_correcao)} • 📷 {n.fotos}</p>
            </Link>))}
        </div>
      )}
    </>
  );
}
