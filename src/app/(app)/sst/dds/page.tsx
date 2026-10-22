import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, LinkBotao, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { data } from '@/lib/formato';

export const metadata = { title: 'DDS' };

export default async function ListaDDS() {
  const { supabase } = await exigirPapel('admin', 'seguranca', 'engenheiro', 'encarregado', 'rh');
  const { data: lista } = await supabase.from('dds').select('*, obras(codigo), perfis(nome), dds_presencas(count)').order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(100);
  const mes = new Date().toISOString().slice(0, 7);
  const doMes = (lista ?? []).filter((d) => d.data.startsWith(mes));
  return (
    <>
      <Cabecalho titulo="DDS — Diálogo Diário de Segurança" acoes={<LinkBotao href="/sst/dds/novo">+ Registrar DDS</LinkBotao>} />
      <AbasSST atual="dds" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="DDS no mês" valor={doMes.length} />
        <Indicador rotulo="Participações no mês" valor={doMes.reduce((s, d) => s + Number((d.dds_presencas as unknown as { count: number }[])[0]?.count ?? 0), 0)} />
        <Indicador rotulo="Último DDS" valor={lista?.[0] ? data(lista[0].data) : '—'} />
      </div>
      {!lista?.length ? <Vazio>Nenhum DDS registrado.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela">
          <thead><tr><th>Nº</th><th>Data</th><th>Obra</th><th>Tema</th><th>Presentes</th><th>Responsável</th></tr></thead>
          <tbody>{lista.map((d) => (
            <tr key={d.id}>
              <td><Link href={`/sst/dds/${d.id}`} className="link font-mono">DDS-{String(d.numero).padStart(4, '0')}</Link></td>
              <td className="whitespace-nowrap">{data(d.data)} {d.hora?.slice(0, 5)}</td>
              <td className="text-xs">{(d.obras as unknown as { codigo: string })?.codigo}</td>
              <td>{d.tema}</td>
              <td className="font-mono">{(d.dds_presencas as unknown as { count: number }[])[0]?.count ?? 0}</td>
              <td className="text-xs">{(d.perfis as unknown as { nome: string })?.nome}</td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
