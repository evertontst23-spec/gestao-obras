import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, LinkBotao, Selo, Vazio } from '@/components/ui';
import { reais } from '@/lib/dominio';
import { data } from '@/lib/formato';

export const metadata = { title: 'Funcionários' };

export default async function Funcionarios({ searchParams }: { searchParams: Promise<{ obra?: string; situacao?: string; q?: string; funcao?: string; empresa?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'engenheiro', 'rh', 'seguranca', 'financeiro');
  const situacao = sp.situacao ?? 'ativos';
  let q = supabase.from('v_funcionarios').select('*').order('nome');
  if (situacao === 'ativos') q = q.eq('ativo', true); else if (situacao === 'desligados') q = q.eq('ativo', false);
  if (sp.obra) q = sp.obra === 'sem' ? q.is('obra_id', null) : q.eq('obra_id', sp.obra);
  if (sp.funcao) q = q.eq('funcao_id', sp.funcao);
  if (sp.empresa) q = sp.empresa === 'sem' ? q.is('empregador_id', null) : q.eq('empregador_id', sp.empresa);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ''); q = q.or(`nome.ilike.%${t}%,cpf.ilike.%${t}%,matricula.ilike.%${t}%`); }
  const [{ data: lista }, { data: obras }, { data: funcoes }, { data: empresas }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'), supabase.from('funcoes').select('id, nome').order('nome'),
    supabase.from('empregadores').select('id, nome').order('nome'),
  ]);
  const fs = lista ?? [];
  const folha = fs.filter((f) => f.ativo).reduce((s, f) => s + Number(f.salario_efetivo ?? 0), 0);
  const pode = perfil.papel === 'admin' || perfil.papel === 'rh';
  const porObra = new Map<string, number>();
  fs.filter((f) => f.ativo).forEach((f) => porObra.set(f.obra_codigo ?? 'Escritório', (porObra.get(f.obra_codigo ?? 'Escritório') ?? 0) + 1));
  const porEmpresa = new Map<string, { id: string; n: number }>();
  fs.filter((f) => f.ativo).forEach((f) => { const k = f.empregador_nome ?? 'Sem empresa'; const e = porEmpresa.get(k) ?? { id: f.empregador_id ?? 'sem', n: 0 }; e.n++; porEmpresa.set(k, e); });
  const pendentes = fs.filter((f) => f.pendencias).length;

  return (
    <>
      <Cabecalho titulo="Funcionários" sub="Dossiê, centro de custo por obra, documentos e histórico. Desligamento não apaga a pasta."
        acoes={pode && <div className="flex gap-2"><LinkBotao href="/cadastros/empregadores" variante="secundario">Empresas</LinkBotao><LinkBotao href="/cadastros/funcionarios/novo">+ Novo funcionário</LinkBotao></div>} />
      {porEmpresa.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...porEmpresa].sort((a, b) => b[1].n - a[1].n).map(([nome, e]) => (
            <Link key={nome} href={`/cadastros/funcionarios?empresa=${e.id}`} className={`rounded-full border px-3 py-1 text-sm font-semibold ${sp.empresa === e.id ? 'border-sinal-500 bg-sinal-50 text-sinal-700' : 'border-concreto-300 bg-white text-concreto-700 hover:border-sinal-400'}`}>{nome} <span className="font-mono text-concreto-500">{e.n}</span></Link>))}
          {sp.empresa && <Link href="/cadastros/funcionarios" className="px-2 py-1 text-sm text-concreto-500 hover:underline">limpar</Link>}
        </div>)}
      {pendentes > 0 && <p className="mb-3 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">⚠ {pendentes} cadastro(s) com dados a confirmar (CPF, admissão, salário…). Abra o funcionário para completar.</p>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo={situacao === 'desligados' ? 'Desligados' : 'Funcionários'} valor={fs.length} />
        <Indicador rotulo="Salários base (ativos)" valor={reais(folha)} detalhe="sem encargos e horas extras" />
        <Indicador rotulo="Documentos vencidos" valor={fs.reduce((s, f) => s + Number(f.documentos_vencidos), 0)} tom={fs.some((f) => f.documentos_vencidos > 0) ? 'atraso' : 'ok'} />
        <Indicador rotulo="Vencem em 30 dias" valor={fs.reduce((s, f) => s + Number(f.documentos_a_vencer), 0)} tom={fs.some((f) => f.documentos_a_vencer > 0) ? 'atencao' : 'ok'} />
      </div>
      {porObra.size > 1 && <p className="mb-3 text-xs text-concreto-500">Por obra: {[...porObra.entries()].map(([o, n]) => `${o}: ${n}`).join(' • ')}</p>}
      <form className="mb-3 flex flex-wrap gap-2 rounded-lg border border-concreto-200 bg-white p-3">
        <input name="q" defaultValue={sp.q} placeholder="Nome, CPF ou matrícula…" className="entrada min-w-[200px] flex-1" />
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option><option value="sem">Escritório / sem obra</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <select name="empresa" defaultValue={sp.empresa ?? ''} className="entrada w-auto"><option value="">Todas as empresas</option><option value="sem">Sem empresa</option>{empresas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        <select name="funcao" defaultValue={sp.funcao ?? ''} className="entrada w-auto"><option value="">Todas as funções</option>{funcoes?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
        <select name="situacao" defaultValue={situacao} className="entrada w-auto"><option value="ativos">Ativos</option><option value="desligados">Desligados</option><option value="todos">Todos</option></select>
        <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      {!fs.length ? <Vazio>Nenhum funcionário encontrado.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Matrícula</th><th>Nome</th><th>Empresa</th><th>Função</th><th>Obra</th><th>Admissão</th><th className="text-right">Salário</th><th>Situação</th></tr></thead>
            <tbody>{fs.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-xs">{f.matricula}</td>
                <td><Link href={`/cadastros/funcionarios/${f.id}`} className="link">{f.nome}</Link>
                  {f.biometria_cadastrada && <span title="Biometria facial cadastrada" className="ml-1 text-xs">🙂</span>}
                  {f.pendencias && <div className="text-xs text-atencao-700">a confirmar: {f.pendencias}</div>}</td>
                <td className="whitespace-nowrap text-xs">{f.empregador_nome ?? '—'}{f.vinculo && <div className="text-concreto-500">{({ clt: 'CLT', terceirizado: 'terceirizado', clt_parceira: 'CLT parceira', autonomo: 'autônomo' } as Record<string, string>)[f.vinculo]}</div>}</td>
                <td>{f.funcao_nome ?? '—'}</td>
                <td className="text-xs">{f.obra_codigo ?? 'Escritório'}</td>
                <td className="whitespace-nowrap">{data(f.data_admissao)}</td>
                <td className="whitespace-nowrap text-right font-mono">{f.salario_efetivo ? reais(f.salario_efetivo) : f.fechamento_externo ? <span className="text-xs text-concreto-500">pela empresa</span> : '—'}{Number(f.adicional_pct) > 0 && <div className="text-xs text-concreto-500">com +{String(f.adicional_pct).replace('.', ',')}%</div>}</td>
                <td className="whitespace-nowrap">{!f.ativo ? <Selo cor="bg-concreto-200 text-concreto-600">Desligado {data(f.data_demissao)}</Selo>
                  : f.documentos_vencidos > 0 ? <Selo cor="bg-atraso-50 text-atraso-700">{f.documentos_vencidos} doc. vencido(s)</Selo>
                  : f.documentos_a_vencer > 0 ? <Selo cor="bg-atencao-50 text-atencao-700">doc. a vencer</Selo>
                  : <Selo cor="bg-ok-50 text-ok-700">Ativo</Selo>}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
