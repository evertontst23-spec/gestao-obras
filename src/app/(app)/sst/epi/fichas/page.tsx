import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { data } from '@/lib/formato';

export const metadata = { title: 'Fichas de EPI' };

export default async function FichasEPI({ searchParams }: { searchParams: Promise<{ obra?: string; q?: string; so?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'seguranca', 'almoxarifado', 'encarregado', 'engenheiro', 'rh');
  let qf = supabase.from('v_funcionarios').select('id, nome, matricula, funcao_nome, obra_id, obra_codigo, empregador_nome').eq('ativo', true).order('nome');
  if (sp.obra) qf = qf.eq('obra_id', sp.obra);
  const [{ data: funcs }, { data: entregas }, { data: pend }, { data: obras }] = await Promise.all([
    qf,
    supabase.from('epi_entregas').select('funcionario_id, data, epi_entrega_itens(count)'),
    supabase.from('epi_pendentes').select('funcionario_id, itens, confirmados').is('entrega_id', null),
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome'),
  ]);
  const assinados = new Map<string, number>(), ultima = new Map<string, string>(), faltam = new Map<string, number>();
  (entregas ?? []).forEach((e) => {
    const n = (e.epi_entrega_itens as unknown as { count: number }[])[0]?.count ?? 0;
    assinados.set(e.funcionario_id, (assinados.get(e.funcionario_id) ?? 0) + n);
    if (!ultima.has(e.funcionario_id) || e.data > ultima.get(e.funcionario_id)!) ultima.set(e.funcionario_id, e.data);
  });
  (pend ?? []).forEach((p) => {
    const n = (p.itens as unknown[]).length - Object.keys((p.confirmados as Record<string, string>) ?? {}).length;
    faltam.set(p.funcionario_id, (faltam.get(p.funcionario_id) ?? 0) + n);
  });
  const q = (sp.q ?? '').trim().toLowerCase();
  const lista = (funcs ?? []).filter((f) => (!q || f.nome.toLowerCase().includes(q) || String(f.matricula).includes(q))
    && (sp.so !== 'pendentes' || (faltam.get(f.id) ?? 0) > 0) && (sp.so !== 'sem' || !(assinados.get(f.id) || faltam.get(f.id))));
  const todos = funcs ?? [];
  const comPend = todos.filter((f) => (faltam.get(f.id) ?? 0) > 0).length;
  const semFicha = todos.filter((f) => !(assinados.get(f.id) || faltam.get(f.id))).length;
  const base = `/sst/epi/fichas?${sp.obra ? `obra=${sp.obra}&` : ''}`;

  return (
    <>
      <Cabecalho titulo="Fichas de EPI" sub="Ficha de controle de entrega de EPI de cada funcionário (NR-06) — uma assinatura por EPI" />
      <AbasSST atual="fichas" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Funcionários ativos" valor={todos.length} href={base} tom={!sp.so ? 'sinal' : 'neutro'} />
        <Indicador rotulo="Com EPI aguardando assinatura" valor={comPend} tom={comPend ? 'atencao' : 'ok'} href={`${base}so=pendentes`} />
        <Indicador rotulo="Sem nenhum EPI registrado" valor={semFicha} tom={semFicha ? 'atraso' : 'ok'} href={`${base}so=sem`} />
      </div>
      <form className="mb-3 flex flex-wrap items-end gap-2">
        {sp.so && <input type="hidden" name="so" value={sp.so} />}
        <label className="text-xs text-concreto-500">Obra
          <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-60"><option value="">Todas</option>{(obras ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></label>
        <label className="text-xs text-concreto-500">Buscar<input name="q" defaultValue={sp.q ?? ''} placeholder="Nome ou matrícula" className="entrada w-52" /></label>
        <button className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">Filtrar</button>
      </form>
      {!lista.length ? <Vazio>Nenhum funcionário neste filtro.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Funcionário</th><th>Função</th><th>Obra</th><th>Empresa</th><th className="text-right">EPIs assinados</th><th>Última entrega</th><th>Situação</th><th></th></tr></thead>
            <tbody>{lista.map((f) => {
              const a = assinados.get(f.id) ?? 0, p = faltam.get(f.id) ?? 0;
              return (
                <tr key={f.id}>
                  <td className="font-semibold"><Link href={`/sst/epi/ficha/${f.id}`} className="hover:text-sinal-700 hover:underline">{f.nome}</Link><div className="text-xs font-normal text-concreto-500">mat. {f.matricula}</div></td>
                  <td className="text-xs">{f.funcao_nome ?? '—'}</td>
                  <td className="text-xs">{f.obra_codigo ?? '—'}</td>
                  <td className="text-xs">{f.empregador_nome ?? '—'}</td>
                  <td className="text-right font-mono">{a}</td>
                  <td className="whitespace-nowrap text-xs">{data(ultima.get(f.id))}</td>
                  <td>{p > 0 ? <Selo cor="bg-atencao-100 text-atencao-800">{p} para assinar</Selo>
                    : a > 0 ? <Selo cor="bg-ok-50 text-ok-700">em dia</Selo> : <Selo cor="bg-atraso-50 text-atraso-700">sem EPI</Selo>}</td>
                  <td className="whitespace-nowrap text-right"><Link href={`/sst/epi/ficha/${f.id}`} className="rounded border border-concreto-300 px-2 py-1 text-xs font-semibold hover:border-sinal-400">{p > 0 ? 'Assinar →' : 'Abrir ficha →'}</Link></td>
                </tr>);
            })}</tbody>
          </table>
        </div>)}
    </>
  );
}
