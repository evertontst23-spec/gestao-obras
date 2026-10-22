/* eslint-disable @typescript-eslint/no-explicit-any */
/** Soma valores e execução dos serviços em cada grupo da planilha (para subtotais e % por etapa). */
export function agregarGrupos(itens: any[]) {
  const porId = new Map<string, { valor: number; executado: number; fisico: number[] }>();
  for (const i of itens) porId.set(i.id, { valor: 0, executado: 0, fisico: [] });
  for (const s of itens) {
    if (s.tipo !== 'servico') continue;
    const pct = Number(s.quantidade) > 0 ? Math.min(1, Number(s.executado) / Number(s.quantidade)) : 0;
    let p = s.pai_id;
    while (p) {
      const g = porId.get(p);
      if (!g) break;
      g.valor += Number(s.valor_total ?? 0);
      g.executado += Number(s.valor_executado ?? 0);
      g.fisico.push(pct);
      p = itens.find((x) => x.id === p)?.pai_id ?? null;
    }
  }
  const pct = (id: string) => {
    const g = porId.get(id)!;
    if (g.valor > 0) return (g.executado / g.valor) * 100;
    return g.fisico.length ? (g.fisico.reduce((a, b) => a + b, 0) / g.fisico.length) * 100 : 0;
  };
  return { porId, pct };
}
