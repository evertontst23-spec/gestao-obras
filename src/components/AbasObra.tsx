import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';

type Aba = 'geral' | 'planilha' | 'avanco' | 'qualidade' | 'diario' | 'financeiro';
export async function AbasObra({ id, atual }: { id: string; atual: Aba }) {
  const { perfil } = await obterSessao();
  const financeiro = ['admin', 'financeiro', 'engenheiro'].includes(perfil.papel);
  const abas = [
    { k: 'geral', r: 'Visão geral', h: `/obras/${id}` },
    { k: 'planilha', r: 'Planilha', h: `/obras/${id}/planilha` },
    { k: 'avanco', r: 'Avanço e fotos', h: `/obras/${id}/avanco` },
    { k: 'diario', r: 'Diário (RDO)', h: `/obras/${id}/diario` },
    { k: 'qualidade', r: 'Qualidade', h: `/qualidade?obra=${id}` },
    ...(financeiro ? [{ k: 'financeiro', r: 'Financeiro', h: `/obras/${id}/financeiro` }] : []),
  ];
  return (
    <nav className="nao-imprimir -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-concreto-200 px-4 md:mx-0 md:px-0">
      {abas.map((a) => (
        <Link key={a.k} href={a.h}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${atual === a.k ? 'border-sinal-500 text-sinal-700' : 'border-transparent text-concreto-500 hover:text-concreto-800'}`}>
          {a.r}
        </Link>))}
    </nav>
  );
}
