import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
export async function AbasFinanceiro({ atual }: { atual: 'painel' | 'lanc' | 'bm' | 'cc' | 'notas' | 'transf' | 'restrito' }) {
  const { supabase } = await obterSessao();
  const { data: ve } = await supabase.rpc('ve_restrito');
  const abas = [['painel', 'Fluxo de caixa', '/financeiro'], ['lanc', 'Contas a pagar e receber', '/financeiro/lancamentos'], ['notas', 'Notas e despesas', '/financeiro/notas'], ['cc', 'Centro de custo por obra', '/financeiro/centro-custo'], ['transf', 'Transferência entre obras', '/financeiro/transferencias'], ['bm', 'Medições (BM)', '/financeiro/medicoes']];
  if (ve) abas.splice(2, 0, ['restrito', '🔒 Pró-labore', '/financeiro/lancamentos?restrito=1']);
  return (
    <nav className="nao-imprimir -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-concreto-200 px-4 md:mx-0 md:px-0">
      {abas.map(([k, r, h]) => <Link key={k} href={h} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${atual === k ? 'border-sinal-500 text-sinal-700' : 'border-transparent text-concreto-500 hover:text-concreto-800'}`}>{r}</Link>)}
    </nav>
  );
}
