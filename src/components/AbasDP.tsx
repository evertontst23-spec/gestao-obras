import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
/** Abas do RH/DP — cada perfil vê só o que pode usar */
export async function AbasDP({ atual, mes }: { atual: string; mes?: string }) {
  const { supabase, perfil } = await obterSessao();
  const q = mes ? `?mes=${mes}` : '';
  const rh = ['admin', 'rh'].includes(perfil.papel);
  const { count } = rh ? await supabase.from('ponto_contestacoes').select('id', { count: 'exact', head: true }).eq('status', 'aberta') : { count: 0 };
  const todas: [string, string, string, string[]][] = [
    ['ponto', 'Registro de ponto', '/dp/ponto', ['admin', 'rh', 'seguranca', 'engenheiro', 'encarregado', 'almoxarifado']],
    ['espelho', 'Espelho de ponto', `/dp/espelho${q}`, ['admin', 'rh', 'financeiro', 'engenheiro']],
    ['correcoes', `Pedidos de correção${count ? ` (${count})` : ''}`, '/dp/correcoes', ['admin', 'rh']],
    ['folha', 'Folha', `/dp/folha${q}`, ['admin', 'rh', 'financeiro']],
    ['pag', 'Pagamentos', '/dp/pagamentos', ['admin', 'rh', 'financeiro']],
    ['he', 'Horas extras e faltas', `/dp/horas-extras${q}`, ['admin', 'rh', 'financeiro']],
    ['atestados', 'Atestados', '/dp/atestados', ['admin', 'rh']],
    ['mov', 'Admissões e desligamentos', '/dp/movimentacao', ['admin', 'rh', 'financeiro']],
    ['par', 'Parâmetros', '/dp/parametros', ['admin', 'rh', 'financeiro']],
  ];
  const abas = todas.filter((a) => a[3].includes(perfil.papel));
  if (abas.length < 2) return null;
  return (
    <nav className="nao-imprimir -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-concreto-200 px-4 md:mx-0 md:px-0">
      {abas.map(([k, r, h]) => <Link key={k} href={h} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${atual === k ? 'border-sinal-500 text-sinal-700' : 'border-transparent text-concreto-500 hover:text-concreto-800'} ${k === 'correcoes' && count ? 'text-atraso-700' : ''}`}>{r}</Link>)}
    </nav>
  );
}
export function mesAtual(mes?: string) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }).slice(0, 7);
  return mes && /^\d{4}-\d{2}$/.test(mes) ? mes : hoje;
}
export function nomeMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
