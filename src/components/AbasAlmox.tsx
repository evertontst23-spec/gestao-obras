import Link from 'next/link';

export function AbasAlmox({ atual }: { atual: 'painel' | 'retiradas' | 'ferramentas' | 'inventario' | 'estoque' }) {
  const abas = [['painel', 'Painel e fluxo', '/almoxarifado'], ['retiradas', 'Retiradas e devoluções', '/almoxarifado/retiradas'],
    ['ferramentas', 'Ferramentas emprestadas', '/almoxarifado/ferramentas'], ['inventario', 'Inventário', '/almoxarifado/inventario'],
    ['estoque', 'Estoque (saldos)', '/suprimentos/estoque']];
  return (
    <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-concreto-200 px-4 md:mx-0 md:px-0">
      {abas.map(([k, r, h]) => (
        <Link key={k} href={h} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${atual === k ? 'border-sinal-500 text-sinal-700' : 'border-transparent text-concreto-500 hover:text-concreto-800'}`}>{r}</Link>))}
    </nav>
  );
}
