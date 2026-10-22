/** Curva de avanço acumulado (%) — SVG simples, sem bibliotecas. */
export function CurvaAvanco({ pontos }: { pontos: { data: string; pct: number }[] }) {
  if (pontos.length < 2) return <p className="text-sm text-concreto-500">A curva aparece a partir do segundo lançamento validado.</p>;
  const L = 600, A = 180, m = { e: 36, d: 12, t: 10, b: 24 };
  const t0 = new Date(pontos[0].data).getTime(), t1 = new Date(pontos[pontos.length - 1].data).getTime();
  const x = (d: string) => m.e + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (L - m.e - m.d);
  const y = (p: number) => m.t + (1 - p / 100) * (A - m.t - m.b);
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.data).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const fmt = (d: string) => { const [, mm, dd] = d.split('-'); return `${dd}/${mm}`; };
  const ultimo = pontos[pontos.length - 1];
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={`Avanço acumulado: ${ultimo.pct.toFixed(1)}%`}>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={m.e} x2={L - m.d} y1={y(g)} y2={y(g)} stroke="#ebeae7" />
          <text x={m.e - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="#8d897f">{g}%</text>
        </g>))}
      <path d={`${caminho} L${x(ultimo.data)},${y(0)} L${x(pontos[0].data)},${y(0)} Z`} fill="#f26b1d" opacity="0.08" />
      <path d={caminho} fill="none" stroke="#f26b1d" strokeWidth="2.5" strokeLinejoin="round" />
      {pontos.map((p) => <circle key={p.data} cx={x(p.data)} cy={y(p.pct)} r="3" fill="#f26b1d" />)}
      <text x={m.e} y={A - 6} fontSize="10" fill="#8d897f">{fmt(pontos[0].data)}</text>
      <text x={L - m.d} y={A - 6} fontSize="10" fill="#8d897f" textAnchor="end">{fmt(ultimo.data)}</text>
      <text x={x(ultimo.data) - 6} y={y(ultimo.pct) - 8} fontSize="12" fontWeight="700" fill="#b34210" textAnchor="end">{ultimo.pct.toFixed(1)}%</text>
    </svg>
  );
}
