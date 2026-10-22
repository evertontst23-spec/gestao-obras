/** Filtro GET de competência (e opcionalmente obra/funcionário) */
export function SeletorMes({ mes, extra }: { mes: string; extra?: React.ReactNode }) {
  return (
    <form className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
      <input type="month" name="mes" defaultValue={mes} className="entrada w-auto" />
      {extra}
      <button className="rounded-md bg-concreto-800 px-4 py-2 text-sm font-semibold text-white">Ver</button>
    </form>
  );
}
