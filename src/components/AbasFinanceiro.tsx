import Link from 'next/link';
export function AbasFinanceiro({ atual }: { atual: 'painel' | 'lanc' | 'bm' | 'cc' }) {
  const abas = [['painel', 'Fluxo de caixa', '/financeiro'], ['lanc', 'Contas a pagar e receber', '/financeiro/lancamentos'], ['cc', 'Centro de custo por obra', '/financeiro/centro-custo'], ['bm', 'Medições (BM)', '/financeiro/medicoes']];
  return (
    <nav className="nao-imprimir -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-concreto-200 px-4 md:mx-0 md:px-0">
      {abas.map(([k, r, h]) => <Link key={k} href={h} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${atual === k ? 'border-sinal-500 text-sinal-700' : 'border-transparent text-concreto-500 hover:text-concreto-800'}`}>{r}</Link>)}
    </nav>
  );
}
