/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, Vazio } from '@/components/ui';
import { resumoDossie, type Doc } from '@/lib/dossie';
import { hojeISO } from '@/lib/formato';

export const metadata = { title: 'Dossiês' };

/** Arquivo de pastas: uma pasta por funcionário, com o que já está guardado e o que falta */
export default async function Dossies({ searchParams }: { searchParams: Promise<{ q?: string; obra?: string; empresa?: string; situacao?: string; falta?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'rh', 'seguranca', 'financeiro', 'engenheiro');
  const situacao = sp.situacao ?? 'ativos';
  let q = supabase.from('v_funcionarios').select('id, matricula, nome, ativo, data_demissao, funcao_nome, obra_id, obra_codigo, empregador_id, empregador_nome, biometria_cadastrada').order('nome');
  if (situacao === 'ativos') q = q.eq('ativo', true); else if (situacao === 'desligados') q = q.eq('ativo', false);
  if (sp.obra) q = sp.obra === 'sem' ? q.is('obra_id', null) : q.eq('obra_id', sp.obra);
  if (sp.empresa) q = q.eq('empregador_id', sp.empresa);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ''); q = q.or(`nome.ilike.%${t}%,matricula.ilike.%${t}%`); }
  const [{ data: fs }, { data: docs }, { data: fotos }, { data: epis }, { data: oss }, { data: obras }, { data: empresas }] = await Promise.all([
    q, supabase.from('funcionario_documentos').select('id, funcionario_id, tipo, descricao, emissao, validade, caminho, tipo_mime, substituido, criado_em').eq('substituido', false),
    supabase.from('funcionarios').select('id, foto_caminho').not('foto_caminho', 'is', null),
    supabase.from('epi_entregas').select('funcionario_id'),
    supabase.from('ordens_servico').select('funcionario_id').eq('substituida', false),
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('empregadores').select('id, nome').order('nome'),
  ]);
  const hoje = hojeISO();
  const porFunc = new Map<string, Doc[]>();
  (docs ?? []).forEach((d) => porFunc.set(d.funcionario_id, [...(porFunc.get(d.funcionario_id) ?? []), d as Doc]));
  const caminhoFoto = new Map((fotos ?? []).map((x) => [x.id, x.foto_caminho as string]));
  const { data: urls } = caminhoFoto.size ? await supabase.storage.from('anexos').createSignedUrls([...caminhoFoto.values()], 3600) : { data: [] };
  const urlFoto = new Map((urls ?? []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl]));
  const nEpi = new Map<string, number>(); (epis ?? []).forEach((e) => nEpi.set(e.funcionario_id, (nEpi.get(e.funcionario_id) ?? 0) + 1));
  const comOS = new Set((oss ?? []).map((o) => o.funcionario_id));
  let pastas = (fs ?? []).map((f) => {
    const ds = porFunc.get(f.id) ?? [];
    const r = resumoDossie(ds, { foto: caminhoFoto.has(f.id), epi: nEpi.get(f.id) ?? 0, os: comOS.has(f.id), biometria: !!f.biometria_cadastrada }, !f.ativo, hoje);
    return { f, ds, r, foto: caminhoFoto.has(f.id) ? urlFoto.get(caminhoFoto.get(f.id)!) : undefined };
  });
  if (sp.falta === '1') pastas = pastas.filter((p) => p.r.faltam.length > 0 || p.r.vencidos.length > 0);
  const completas = pastas.filter((p) => !p.r.faltam.length && !p.r.vencidos.length).length;
  const iniciais = (n: string) => { const p = n.split(' ').filter((x) => x.length > 2); return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };

  return (
    <>
      <Cabecalho titulo="Dossiês dos funcionários" sub="Uma pasta por funcionário, com cada documento no seu lugar. Abra a pasta para ver, anexar ou substituir." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Pastas" valor={pastas.length} />
        <Indicador rotulo="Completas" valor={completas} tom="ok" />
        <Indicador rotulo="Com pendência" valor={pastas.length - completas} tom={pastas.length - completas ? 'atencao' : 'neutro'} href="/cadastros/dossies?falta=1" />
        <Indicador rotulo="Documentos guardados" valor={(docs ?? []).length} />
      </div>
      <form className="mb-4 flex flex-wrap gap-2 rounded-lg border border-concreto-200 bg-white p-3">
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Nome ou matrícula…" className="entrada w-auto min-w-[200px] flex-1" />
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option><option value="sem">Escritório / sem obra</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <select name="empresa" defaultValue={sp.empresa ?? ''} className="entrada w-auto"><option value="">Todas as empresas</option>{empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        <select name="situacao" defaultValue={situacao} className="entrada w-auto"><option value="ativos">Ativos</option><option value="desligados">Desligados</option><option value="todos">Todos</option></select>
        <label className="flex items-center gap-2 px-1 text-sm"><input type="checkbox" name="falta" value="1" defaultChecked={sp.falta === '1'} className="accent-sinal-500" /> Só com pendência</label>
        <button className="rounded-md bg-concreto-800 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>
      {!pastas.length ? <Vazio>Nenhuma pasta com esses filtros.</Vazio> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pastas.map(({ f, ds, r, foto }) => {
            const pct = Math.round((r.ok / Math.max(r.total, 1)) * 100);
            return (
              <Link key={f.id} href={`/cadastros/funcionarios/${f.id}/dossie`} className="group flex min-w-0 flex-col rounded-lg border border-concreto-200 bg-white hover:border-sinal-400">
                <div className="flex items-center gap-3 border-b border-concreto-100 p-3">
                  {foto ? <img src={foto} alt="" className="h-12 w-12 flex-none rounded-md object-cover" />
                    : <span className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-concreto-100 text-sm font-bold text-concreto-500">{iniciais(f.nome)}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold group-hover:text-sinal-700">📁 {f.nome}</div>
                    <div className="truncate text-xs text-concreto-500">{f.matricula} • {f.funcao_nome ?? 'sem função'} • {f.obra_codigo ?? 'Escritório'} • {f.empregador_nome ?? '—'}{!f.ativo && ' • desligado'}</div>
                  </div>
                </div>
                <div className="space-y-2 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded bg-concreto-100"><div className={`h-full ${pct === 100 ? 'bg-ok-500' : pct >= 50 ? 'bg-atencao-500' : 'bg-atraso-500'}`} style={{ width: `${pct}%` }} /></div>
                    <span className="font-mono">{r.ok}/{r.total}</span>
                  </div>
                  <div className="text-concreto-600">{ds.length} arquivo(s) guardado(s){r.vencidos.length > 0 && <b className="text-atraso-700"> • {r.vencidos.length} vencido(s)</b>}</div>
                  {r.faltam.length > 0 && <div className="flex flex-wrap gap-1">{r.faltam.slice(0, 5).map((s) => <span key={s.tipo} className="rounded bg-atencao-50 px-1.5 py-0.5 text-atencao-800">{s.rotulo}</span>)}{r.faltam.length > 5 && <span className="text-concreto-500">+{r.faltam.length - 5}</span>}</div>}
                  {!r.faltam.length && !r.vencidos.length && <span className="rounded bg-ok-50 px-1.5 py-0.5 font-semibold text-ok-700">Pasta completa</span>}
                </div>
              </Link>);
          })}
        </div>)}
    </>
  );
}
