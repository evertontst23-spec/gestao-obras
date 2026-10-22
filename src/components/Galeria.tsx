import { criarClienteServidor } from '@/lib/supabase/server';
import { dataHora } from '@/lib/formato';

const CAT: Record<string, { r: string; c: string }> = {
  execucao: { r: 'Execução', c: 'bg-ok-500' }, correcao: { r: 'Correção', c: 'bg-atencao-500' },
  nao_conformidade: { r: 'Não conformidade', c: 'bg-atraso-500' }, geral: { r: '', c: '' },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Lista anexos com links temporários (bucket privado). */
export async function Galeria({ anexos, vazio = 'Nenhuma foto ou documento.' }: { anexos: any[]; vazio?: string }) {
  if (!anexos.length) return <p className="text-sm text-concreto-500">{vazio}</p>;
  const supabase = await criarClienteServidor();
  const { data: urls } = await supabase.storage.from('anexos').createSignedUrls(anexos.map((a) => a.caminho), 3600);
  const mapa = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {anexos.map((a) => {
        const url = mapa.get(a.caminho);
        const img = a.tipo_mime?.startsWith('image/');
        return (
          <a key={a.id} href={url ?? '#'} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-md border border-concreto-200 bg-concreto-50" title={`${a.legenda ?? a.nome} • ${dataHora(a.criado_em)}`}>
            {img && url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={url} alt={a.legenda ?? a.nome} className="aspect-square w-full object-cover transition group-hover:opacity-90" loading="lazy" />
              : <div className="flex aspect-square items-center justify-center p-2 text-center text-xs font-semibold text-concreto-600">📄 {a.nome}</div>}
            {CAT[a.categoria]?.r && <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${CAT[a.categoria].c}`}>{CAT[a.categoria].r}</span>}
            <div className="truncate px-1.5 py-1 text-[10px] text-concreto-500">{a.legenda ?? dataHora(a.criado_em)}</div>
          </a>
        );
      })}
    </div>
  );
}
