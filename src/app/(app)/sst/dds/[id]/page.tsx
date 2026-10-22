import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { AbasSST } from '@/components/AbasSST';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { data, dataHora } from '@/lib/formato';

export default async function DetalheDDS({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await obterSessao();
  const { data: d } = await supabase.from('dds').select('*, obras(codigo, nome, endereco), perfis(nome)').eq('id', id).maybeSingle();
  if (!d) notFound();
  const [{ data: pres }, foto] = await Promise.all([
    supabase.from('dds_presencas').select('funcionario_id').eq('dds_id', id),
    d.foto_caminho ? supabase.storage.from('anexos').createSignedUrl(d.foto_caminho, 3600) : Promise.resolve({ data: null }),
  ]);
  const { data: equipe } = await supabase.rpc('equipe_da_obra', { p_obra: d.obra_id });
  const mapa = new Map(((equipe ?? []) as { id: string; nome: string; funcao: string; matricula: string }[]).map((e) => [e.id, e]));
  const obra = d.obras as unknown as { codigo: string; nome: string; endereco: string };
  return (
    <>
      <AbasSST atual="dds" />
      <div className="nao-imprimir mb-4 flex justify-end"><BotaoImprimir rotulo="🖨 Imprimir lista de presença" /></div>
      <article className="mx-auto max-w-4xl rounded-lg border border-concreto-200 bg-white p-6 text-sm print:border-0 print:p-0">
        <header className="mb-4 border-b-2 border-concreto-800 pb-3 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-700">Diálogo Diário de Segurança</div>
          <h1 className="text-xl font-black">DDS-{String(d.numero).padStart(4, '0')} — {d.tema}</h1>
          <p className="text-xs text-concreto-500">{obra.codigo} — {obra.nome} • {data(d.data)} {d.hora?.slice(0, 5)} • {d.duracao_min ?? '—'} min • {d.local ?? ''}</p>
        </header>
        {d.conteudo && <p className="mb-4 whitespace-pre-line"><b>Assuntos abordados:</b> {d.conteudo}</p>}
        {foto.data?.signedUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={foto.data.signedUrl} alt="Foto do DDS" className="mb-4 max-h-72 rounded-md" />}
        <table className="w-full border-collapse text-xs">
          <thead><tr className="bg-concreto-100">{['Nº', 'Nome', 'Função', 'Matrícula', 'Assinatura'].map((h) => <th key={h} className="border border-concreto-300 px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{(pres ?? []).map((p, k) => { const e = mapa.get(p.funcionario_id); return (
            <tr key={p.funcionario_id}><td className="border border-concreto-300 px-2 py-2">{k + 1}</td><td className="border border-concreto-300 px-2">{e?.nome ?? '(desligado)'}</td>
              <td className="border border-concreto-300 px-2">{e?.funcao}</td><td className="border border-concreto-300 px-2">{e?.matricula}</td><td className="w-48 border border-concreto-300 px-2"></td></tr>); })}</tbody>
        </table>
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
          <div className="border-t border-concreto-800 pt-1">{(d.perfis as unknown as { nome: string })?.nome} — responsável</div>
          <div className="border-t border-concreto-800 pt-1">Técnico de Segurança do Trabalho</div>
        </div>
        <p className="mt-4 text-[10px] text-concreto-500">Registrado em {dataHora(d.criado_em)}.</p>
      </article>
    </>
  );
}
