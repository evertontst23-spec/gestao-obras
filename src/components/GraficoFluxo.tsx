import { reais } from '@/lib/dominio';
import { rotuloMes, type MesFluxo } from '@/lib/fluxo';

/** Barras pareadas entradas × saídas; parte clara = previsto */
export function GraficoFluxo({ meses, hoje }: { meses: MesFluxo[]; hoje: string }) {
  const max = Math.max(1, ...meses.map((m) => Math.max(m.entradas + m.entradasPrev, m.saidas + m.saidasPrev)));
  const atual = hoje.slice(0, 7);
  let acum = 0;
  return (
    <div>
      <div className="flex h-48 items-end gap-2 border-b border-concreto-200 pb-1">
        {meses.map((m) => {
          const h = (v: number) => `${(v / max) * 100}%`;
          return (
            <div key={m.mes} className="flex h-full flex-1 items-end justify-center gap-0.5" title={`${rotuloMes(m.mes)} — entradas ${reais(m.entradas + m.entradasPrev)} • saídas ${reais(m.saidas + m.saidasPrev)}`}>
              <div className="flex h-full w-1/2 max-w-[22px] flex-col justify-end">
                <div className="rounded-t-sm bg-ok-100" style={{ height: h(m.entradasPrev) }} />
                <div className="bg-ok-500" style={{ height: h(m.entradas) }} />
              </div>
              <div className="flex h-full w-1/2 max-w-[22px] flex-col justify-end">
                <div className="rounded-t-sm bg-atraso-100" style={{ height: h(m.saidasPrev) }} />
                <div className="bg-atraso-500" style={{ height: h(m.saidas) }} />
              </div>
            </div>);
        })}
      </div>
      <div className="flex gap-2 pt-1 text-center text-[11px] text-concreto-500">
        {meses.map((m) => <div key={m.mes} className={`flex-1 whitespace-nowrap ${m.mes === atual ? 'font-bold text-concreto-900' : ''}`}>{rotuloMes(m.mes).replace(' de ', '/')}</div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-concreto-600">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 bg-ok-500" />Recebido</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-ok-100" />A receber</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 bg-atraso-500" />Pago</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-atraso-100" />A pagar</span>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="tabela whitespace-nowrap text-xs">
        <thead><tr><th>Mês</th><th className="text-right">Entradas</th><th className="text-right">Saídas</th><th className="text-right">Saldo do mês</th><th className="text-right">Acumulado</th></tr></thead>
        <tbody>{meses.map((m) => {
          const e = m.entradas + m.entradasPrev, s = m.saidas + m.saidasPrev, saldo = e - s; acum += saldo;
          return <tr key={m.mes} className={m.mes > atual ? 'text-concreto-500' : ''}><td>{rotuloMes(m.mes).replace(/^./, (c) => c.toUpperCase())}{m.mes === atual && ' (atual)'}{m.mes > atual && ' (previsto)'}</td>
            <td className="text-right font-mono">{reais(e)}</td><td className="text-right font-mono">{reais(s)}</td>
            <td className={`text-right font-mono ${saldo < 0 ? 'text-atraso-700' : 'text-ok-700'}`}>{reais(saldo)}</td><td className={`text-right font-mono font-semibold ${acum < 0 ? 'text-atraso-700' : ''}`}>{reais(acum)}</td></tr>;
        })}</tbody>
      </table></div>
    </div>
  );
}
