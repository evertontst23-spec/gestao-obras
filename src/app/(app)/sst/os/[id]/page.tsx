import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { AbasSST } from '@/components/AbasSST';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { CienciaOS } from '@/components/CienciaOS';
import { data, dataHora } from '@/lib/formato';

export default async function DetalheOS({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: o } = await supabase.from('ordens_servico').select('*, perfis(nome), obras(codigo, nome)').eq('id', id).maybeSingle();
  if (!o) notFound();
  const { data: b } = await supabase.rpc('funcionario_basico', { p_func: o.funcionario_id }).maybeSingle();
  const ass = o.ciencia_caminho ? (await supabase.storage.from('anexos').createSignedUrl(o.ciencia_caminho, 3600)).data?.signedUrl : null;
  const bloco = (t: string, c: React.ReactNode) => <section className="mb-3"><h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-sinal-700">{t}</h2><div>{c}</div></section>;
  return (
    <>
      <AbasSST atual="os" />
      <div className="nao-imprimir mb-4 flex justify-end"><BotaoImprimir rotulo="🖨 Imprimir OS" /></div>
      <article className="mx-auto max-w-3xl rounded-lg border border-concreto-200 bg-white p-6 text-sm print:border-0 print:p-0">
        <header className="mb-4 border-b-2 border-concreto-800 pb-3 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-700">NR-01, item 1.4.1 "c"</div>
          <h1 className="text-xl font-black">ORDEM DE SERVIÇO DE SEGURANÇA E SAÚDE NO TRABALHO</h1>
          <p className="font-mono text-xs">OS-{String(o.numero).padStart(4, '0')} • {data(o.data)}{o.substituida && ' • SUBSTITUÍDA'}</p>
        </header>
        <dl className="mb-4 grid grid-cols-2 gap-2">
          <div><dt className="text-[11px] uppercase text-concreto-500">Trabalhador</dt><dd className="font-semibold">{(b as { nome: string } | null)?.nome}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">Função</dt><dd>{o.funcao_nome}</dd></div>
          <div className="col-span-2"><dt className="text-[11px] uppercase text-concreto-500">Obra</dt><dd>{(o.obras as unknown as { codigo: string; nome: string } | null)?.nome ?? '—'}</dd></div>
        </dl>
        {bloco('Atividades', <p className="whitespace-pre-line">{o.atividades}</p>)}
        {bloco('Riscos', <ul className="list-inside list-disc">{o.riscos.map((r: string) => <li key={r}>{r}</li>)}</ul>)}
        {o.medidas && bloco('Medidas de prevenção', <p className="whitespace-pre-line">{o.medidas}</p>)}
        {o.epis.length > 0 && bloco('EPIs de uso obrigatório', <p>{o.epis.join(' • ')}</p>)}
        {o.proibicoes && bloco('Proibições', <p className="whitespace-pre-line">{o.proibicoes}</p>)}
        {o.emergencia && bloco('Em caso de acidente', <p className="whitespace-pre-line">{o.emergencia}</p>)}
        <p className="my-4 rounded bg-concreto-50 p-3 text-xs">Declaro ter recebido e compreendido esta Ordem de Serviço, comprometendo-me a cumpri-la. O descumprimento injustificado constitui ato faltoso (art. 158 da CLT).</p>
        <div className="mt-6 grid grid-cols-2 gap-10 text-center text-xs">
          <div>{ass ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={ass} alt="Assinatura" className="mx-auto h-14" /> : <div className="h-14" />}
            <div className="border-t border-concreto-800 pt-1">Trabalhador {o.ciencia_em && `— ciência em ${dataHora(o.ciencia_em)}`}</div></div>
          <div><div className="h-14" /><div className="border-t border-concreto-800 pt-1">{(o.perfis as unknown as { nome: string })?.nome} — Segurança do Trabalho</div></div>
        </div>
      </article>
      {!o.ciencia_em && !o.substituida && ['admin', 'seguranca', 'engenheiro', 'encarregado'].includes(perfil.papel) && (
        <div className="mx-auto mt-5 max-w-3xl rounded-lg border-2 border-ok-500 bg-white p-4"><CienciaOS os={id} /></div>)}
    </>
  );
}
