import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { FormDDS } from '@/components/FormDDS';
import { hojeISO } from '@/lib/formato';

export const metadata = { title: 'Novo DDS' };

export default async function NovoDDS({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const { obra } = await searchParams;
  const { supabase } = await exigirPapel('admin', 'seguranca', 'engenheiro', 'encarregado');
  const { data: obras } = await supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome');
  const sel = obra ?? (obras?.length === 1 ? obras[0].id : undefined);
  if (!sel) return (
    <><Cabecalho titulo="Novo DDS" sub="Em qual obra?" /><AbasSST atual="dds" />
      <div className="mx-auto max-w-xl space-y-2">{obras?.map((o) => <Link key={o.id} href={`/sst/dds/novo?obra=${o.id}`} className="block rounded-lg border border-concreto-200 bg-white p-4 font-semibold hover:border-sinal-400"><span className="font-mono text-xs text-concreto-500">{o.codigo}</span><br />{o.nome}</Link>)}</div></>);
  const { data: equipe } = await supabase.rpc('equipe_da_obra', { p_obra: sel });
  const o = obras?.find((x) => x.id === sel);
  return (
    <>
      <Cabecalho titulo="Novo DDS" sub={<>Obra: <b>{o?.codigo} — {o?.nome}</b></>} />
      <AbasSST atual="dds" />
      <div className="mx-auto max-w-3xl">{!(equipe ?? []).length ? <Vazio>Nenhum funcionário ativo vinculado a esta obra (Cadastros → Funcionários).</Vazio>
        : <Cartao><FormDDS obra={sel} equipe={(equipe ?? []) as { id: string; nome: string; funcao: string }[]} hoje={hojeISO()} /></Cartao>}</div>
    </>
  );
}
