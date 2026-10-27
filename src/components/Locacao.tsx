import { data } from '@/lib/formato';

export const SITUACAO_LOCACAO: Record<string, { rotulo: string; cor: string }> = {
  a_contratar: { rotulo: 'A contratar',  cor: 'bg-concreto-100 text-concreto-700' },
  ativa:       { rotulo: 'Na obra',      cor: 'bg-ok-50 text-ok-700' },
  vencendo:    { rotulo: 'Vencendo',     cor: 'bg-atencao-100 text-atencao-800' },
  vencida:     { rotulo: 'Vencida',      cor: 'bg-atraso-50 text-atraso-700' },
  devolvida:   { rotulo: 'Devolvida',    cor: 'bg-concreto-200 text-concreto-600' },
  cancelada:   { rotulo: 'Cancelada',    cor: 'bg-concreto-200 text-concreto-600 line-through' },
};

type ItemLoc = { modalidade?: string | null; locacao_inicio?: string | null; locacao_fim?: string | null; locacao_dias?: number | null; locacao_situacao?: string | null };

/** Etiqueta "Locação 01/11 a 30/11 (30 dias)" — nada para itens de compra. */
export function SeloLocacao({ i, comSituacao = false }: { i: ItemLoc; comSituacao?: boolean }) {
  if (i.modalidade !== 'locacao') return null;
  const s = i.locacao_situacao ? SITUACAO_LOCACAO[i.locacao_situacao] : null;
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1 text-[11px]">
      <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">🔁 Locação {data(i.locacao_inicio)} a {data(i.locacao_fim)}{i.locacao_dias ? ` (${i.locacao_dias} d)` : ''}</span>
      {comSituacao && s && <span className={`rounded px-1.5 py-0.5 font-semibold ${s.cor}`}>{s.rotulo}</span>}
    </span>
  );
}
