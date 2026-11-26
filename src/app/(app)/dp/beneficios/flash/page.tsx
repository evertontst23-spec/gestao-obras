import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Selo, Vazio } from '@/components/ui';
import { AbasDP, nomeMes } from '@/components/AbasDP';
import { GradeFlash, type PessoaFlash } from '@/components/GradeFlash';

export const metadata = { title: 'Benefícios — Flash' };

type Linha = { funcionario_id: string; tipo: string; dias: number; dias_retroativos: number; dias_desconto: number; qtd_dia: number; valor_unitario: number;
  funcionarios: { nome: string; cpf: string | null; ativo: boolean; data_demissao: string | null; funcoes: { nome: string } | null; empregadores: { nome: string } | null } | null };

export default async function BeneficiosFlash({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const pode = ['admin', 'rh'].includes(perfil.papel);
  const { data: comps } = await supabase.from('beneficio_competencias').select('*').order('competencia', { ascending: false });
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : (comps?.[0]?.competencia?.slice(0, 7) ?? '');
  const comp = (comps ?? []).find((c) => c.competencia.slice(0, 7) === mes);
  const { data: linhasRaw } = comp
    ? await supabase.from('beneficio_linhas').select('funcionario_id, tipo, dias, dias_retroativos, dias_desconto, qtd_dia, valor_unitario, funcionarios(nome, cpf, ativo, data_demissao, funcoes(nome), empregadores(nome))').eq('competencia_id', comp.id)
    : { data: [] };
  const linhas = (linhasRaw ?? []) as unknown as Linha[];

  // consolida por funcionário: 1 linha por pessoa, com alimentação e passagem
  const porFunc = new Map<string, PessoaFlash>();
  for (const l of linhas) {
    const f = l.funcionarios; if (!f) continue;
    const p = porFunc.get(l.funcionario_id) ?? {
      func_id: l.funcionario_id, nome: f.nome, cpf: f.cpf, cargo: f.funcoes?.nome ?? '', empresa: f.empregadores?.nome ?? '',
      dias: 0, faltas: 0, retroAlim: 0, qtdAlim: 0, unitAlim: 0, retroPass: 0, qtdPass: 0, unitPass: 0,
    };
    p.dias = Math.max(p.dias, Number(l.dias));
    p.faltas = Math.max(p.faltas, Number(l.dias_desconto));
    if (l.tipo === 'alimentacao') { p.retroAlim = Number(l.dias_retroativos); p.qtdAlim = Number(l.qtd_dia); p.unitAlim = Number(l.valor_unitario); }
    if (l.tipo === 'passagem') { p.retroPass = Number(l.dias_retroativos); p.qtdPass = Number(l.qtd_dia); p.unitPass = Number(l.valor_unitario); }
    porFunc.set(l.funcionario_id, p);
  }
  const pessoas = [...porFunc.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const editavel = pode && comp?.status === 'aberta';
  const semCpf = pessoas.filter((p) => !p.cpf).length;

  const subaba = (ativo: boolean) => `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${ativo ? 'bg-concreto-900 text-white' : 'text-concreto-600 hover:bg-concreto-100'}`;
  const chip = (ativo: boolean) => `rounded-full px-3.5 py-1.5 text-sm font-semibold ${ativo ? 'bg-concreto-900 text-white shadow-sm' : 'text-concreto-600 hover:bg-concreto-100 hover:text-concreto-900'}`;

  return (
    <>
      <Cabecalho titulo="Benefícios — Lançamento Flash" sub="Uma linha por funcionário: digite os dias, as faltas já vêm preenchidas, e o total de alimentação e passagem sai pronto para lançar na Flash." />
      <AbasDP atual="benef" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`/dp/beneficios?mes=${mes}`} className={subaba(false)}>Por obra / Pix</Link>
        <Link href={`/dp/beneficios/flash?mes=${mes}`} className={subaba(true)}>Flash (lançar dias)</Link>
      </div>

      {(comps ?? []).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(comps ?? []).map((c) => (
            <Link key={c.id} href={`/dp/beneficios/flash?mes=${c.competencia.slice(0, 7)}`} className={`${chip(c.competencia.slice(0, 7) === mes)} capitalize`}>
              {nomeMes(c.competencia.slice(0, 7))}{c.status === 'fechada' && ' 🔒'}</Link>))}
        </div>)}

      {!comp ? <Vazio>Nenhuma competência de benefícios. Crie o mês na aba “Por obra / Pix”.</Vazio>
        : !pessoas.length ? <Vazio>Nenhum funcionário com benefício nesta competência.</Vazio>
        : (
          <Cartao titulo={`${nomeMes(mes)} — ${pessoas.length} funcionário(s)`} className="mb-5"
            acoes={<div className="flex items-center gap-2 text-sm">{!editavel && <Selo cor="bg-concreto-100 text-concreto-600">{comp.status === 'fechada' ? 'Fechada' : 'Somente leitura'}</Selo>}
              {semCpf > 0 && <Selo cor="bg-atencao-100 text-atencao-800">{semCpf} sem CPF</Selo>}</div>}>
            <GradeFlash competenciaId={comp.id} editavel={!!editavel} pessoas={pessoas} />
            <p className="mt-3 text-xs text-concreto-500">Total = (dias + retroativo − faltas) × valor por dia, para alimentação e passagem. Os valores por dia vêm do cadastro de cada funcionário. O CSV sai com CPF, dias, faltas e os totais para subir na Flash.</p>
          </Cartao>)}
    </>
  );
}
