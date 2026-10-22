import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, LinkBotao, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { BaixarCSV } from '@/components/BaixarCSV';
import { data } from '@/lib/formato';
import { reais } from '@/lib/dominio';

export const metadata = { title: 'Admissões e desligamentos' };

export default async function Movimentacao({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'rh', 'financeiro');
  const ano = /^\d{4}$/.test(sp.ano ?? '') ? sp.ano! : new Date().getFullYear().toString();
  const { data: funcs } = await supabase.from('funcionarios').select('id, nome, matricula, data_admissao, data_demissao, motivo_demissao, ativo, salario, funcoes(nome, salario_base), obras(codigo)')
    .or(`and(data_admissao.gte.${ano}-01-01,data_admissao.lte.${ano}-12-31),and(data_demissao.gte.${ano}-01-01,data_demissao.lte.${ano}-12-31)`).order('nome');
  const { count: ativos } = await supabase.from('funcionarios').select('id', { count: 'exact', head: true }).eq('ativo', true);
  const adm = (funcs ?? []).filter((f) => f.data_admissao.startsWith(ano)).sort((a, b) => b.data_admissao.localeCompare(a.data_admissao));
  const des = (funcs ?? []).filter((f) => f.data_demissao?.startsWith(ano)).sort((a, b) => b.data_demissao!.localeCompare(a.data_demissao!));
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const turnover = ativos ? (((adm.length + des.length) / 2) / ativos) * 100 : 0;
  const fn = (f: (typeof adm)[number]) => f.funcoes as unknown as { nome: string; salario_base: number } | null;

  return (
    <>
      <Cabecalho titulo={`Admissões e desligamentos — ${ano}`} acoes={<div className="flex gap-2"><LinkBotao href="/cadastros/funcionarios/novo">+ Admitir funcionário</LinkBotao>
        <BaixarCSV nome={`movimentacao-${ano}`} cabecalho={['Movimento', 'Data', 'Matrícula', 'Nome', 'Função', 'Obra', 'Motivo']}
          linhas={[...adm.map((f) => ['Admissão', data(f.data_admissao), f.matricula, f.nome, fn(f)?.nome ?? '', (f.obras as unknown as { codigo: string })?.codigo ?? '', '']),
            ...des.map((f) => ['Desligamento', data(f.data_demissao), f.matricula, f.nome, fn(f)?.nome ?? '', (f.obras as unknown as { codigo: string })?.codigo ?? '', f.motivo_demissao ?? ''])]} /></div>} />
      <AbasDP atual="mov" />
      <form className="mb-4 flex gap-2"><input name="ano" type="number" defaultValue={ano} className="entrada w-28" /><button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Ver</button></form>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Ativos hoje" valor={ativos ?? 0} />
        <Indicador rotulo="Admissões no ano" valor={adm.length} tom="ok" />
        <Indicador rotulo="Desligamentos no ano" valor={des.length} tom={des.length ? 'atraso' : 'neutro'} />
        <Indicador rotulo="Rotatividade" valor={`${turnover.toFixed(1).replace('.', ',')}%`} detalhe="(admissões + desligamentos) ÷ 2 ÷ ativos" />
      </div>
      <Cartao titulo="Mês a mês" className="mb-5">
        <div className="grid grid-cols-6 gap-2 text-center text-xs md:grid-cols-12">
          {meses.map((m) => {
            const a = adm.filter((f) => f.data_admissao.startsWith(m)).length, d = des.filter((f) => f.data_demissao?.startsWith(m)).length;
            return <div key={m} className="rounded-md bg-concreto-50 p-2"><div className="font-semibold text-concreto-500">{new Date(m + '-15').toLocaleDateString('pt-BR', { month: 'short' })}</div><div className="text-ok-700">+{a}</div><div className="text-atraso-700">−{d}</div></div>;
          })}
        </div>
      </Cartao>
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Admissões">
          {!adm.length ? <Vazio>Nenhuma admissão no ano.</Vazio> : <table className="tabela"><thead><tr><th>Data</th><th>Funcionário</th><th className="text-right">Salário</th></tr></thead>
            <tbody>{adm.map((f) => <tr key={f.id}><td className="whitespace-nowrap">{data(f.data_admissao)}</td><td><Link className="link" href={`/cadastros/funcionarios/${f.id}`}>{f.nome}</Link><div className="text-xs text-concreto-500">{fn(f)?.nome} • {(f.obras as unknown as { codigo: string })?.codigo ?? 'sem obra'}</div></td><td className="text-right font-mono">{reais(f.salario ?? fn(f)?.salario_base)}</td></tr>)}</tbody></table>}
        </Cartao>
        <Cartao titulo="Desligamentos">
          {!des.length ? <Vazio>Nenhum desligamento no ano.</Vazio> : <table className="tabela"><thead><tr><th>Data</th><th>Funcionário</th><th>Motivo</th></tr></thead>
            <tbody>{des.map((f) => <tr key={f.id}><td className="whitespace-nowrap">{data(f.data_demissao)}</td><td><Link className="link" href={`/cadastros/funcionarios/${f.id}`}>{f.nome}</Link><div className="text-xs text-concreto-500">admitido em {data(f.data_admissao)}</div></td><td className="text-sm">{f.motivo_demissao}</td></tr>)}</tbody></table>}
          <p className="mt-2 text-xs text-concreto-500">O desligamento é feito no dossiê do funcionário (bloqueia o ponto e mantém o histórico).</p>
        </Cartao>
      </div>
    </>
  );
}
