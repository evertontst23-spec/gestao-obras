// Fluxo de caixa mensal: realizado (pela data da baixa) e previsto (pelo vencimento; atrasados entram no mês atual)
export type Lanc = { tipo: string; status: string; valor: number | string; valor_liquidado: number | string | null; vencimento: string; liquidado_em: string | null; categoria: string };
export type MesFluxo = { mes: string; entradas: number; saidas: number; entradasPrev: number; saidasPrev: number };

export function fluxoMensal(lancs: Lanc[], hoje: string, antes = 5, depois = 3): MesFluxo[] {
  const atual = hoje.slice(0, 7);
  const [a, m] = atual.split('-').map(Number);
  const meses: MesFluxo[] = [];
  for (let i = -antes; i <= depois; i++) {
    const d = new Date(Date.UTC(a, m - 1 + i, 1));
    meses.push({ mes: d.toISOString().slice(0, 7), entradas: 0, saidas: 0, entradasPrev: 0, saidasPrev: 0 });
  }
  const idx = new Map(meses.map((x, i) => [x.mes, i]));
  for (const l of lancs) {
    if (l.status === 'liquidado' && l.liquidado_em) {
      const i = idx.get(l.liquidado_em.slice(0, 7));
      if (i !== undefined) meses[i][l.tipo === 'receita' ? 'entradas' : 'saidas'] += Number(l.valor_liquidado ?? l.valor);
    } else if (l.status === 'aberto') {
      const mv = l.vencimento.slice(0, 7) < atual ? atual : l.vencimento.slice(0, 7);
      const i = idx.get(mv);
      if (i !== undefined) meses[i][l.tipo === 'receita' ? 'entradasPrev' : 'saidasPrev'] += Number(l.valor);
    }
  }
  return meses;
}
export const rotuloMes = (mes: string) => new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
