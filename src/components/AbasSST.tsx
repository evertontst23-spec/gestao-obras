import Link from 'next/link';
export function AbasSST({ atual }: { atual: 'painel' | 'epi' | 'dds' | 'os' }) {
  const abas = [['painel', 'Painel SST', '/sst'], ['epi', 'EPI', '/sst/epi'], ['dds', 'DDS', '/sst/dds'], ['os', 'Ordens de Serviço', '/sst/os']];
  return (
    <nav className="nao-imprimir -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-concreto-200 px-4 md:mx-0 md:px-0">
      {abas.map(([k, r, h]) => <Link key={k} href={h} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${atual === k ? 'border-sinal-500 text-sinal-700' : 'border-transparent text-concreto-500 hover:text-concreto-800'}`}>{r}</Link>)}
    </nav>
  );
}
