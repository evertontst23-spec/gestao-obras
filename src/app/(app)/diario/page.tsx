import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Selo, Vazio } from '@/components/ui';
import { hojeISO } from '@/lib/formato';

export const metadata = { title: 'Diário de obra' };

/** Atalho: obras da pessoa com a situação do diário de hoje */
export default async function DiarioHub() {
  const { supabase } = await obterSessao();
  const hoje = hojeISO();
  const [{ data: obras }, { data: hojeD }] = await Promise.all([
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
    supabase.from('diario_obra').select('id, obra_id').eq('data', hoje),
  ]);
  const feito = new Map((hojeD ?? []).map((d) => [d.obra_id, d.id]));
  return (
    <>
      <Cabecalho titulo="Diário de obra" sub="Registre o dia de cada obra com fotos. O engenheiro valida." />
      {!obras?.length ? <Vazio>Você não está vinculado a nenhuma obra ativa.</Vazio> : (
        <div className="grid gap-3 sm:grid-cols-2">{obras.map((o) => (
          <Link key={o.id} href={feito.has(o.id) ? `/obras/${o.id}/diario/${feito.get(o.id)}` : `/obras/${o.id}/diario`} className="flex min-h-[64px] items-center justify-between rounded-lg border border-concreto-200 bg-white p-4 hover:border-sinal-400">
            <div><div className="font-semibold">{o.codigo}</div><div className="text-sm text-concreto-500">{o.nome}</div></div>
            {feito.has(o.id) ? <Selo cor="bg-ok-50 text-ok-700">Hoje registrado</Selo> : <Selo cor="bg-atencao-100 text-atencao-800">Registrar hoje</Selo>}
          </Link>))}</div>)}
    </>
  );
}
