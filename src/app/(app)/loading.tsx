/** Aparece na hora em que se clica num menu, enquanto a página carrega. */
export default function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="animate-pulse">
      <div className="mb-2 h-7 w-64 rounded bg-concreto-200" />
      <div className="mb-6 h-4 w-96 max-w-full rounded bg-concreto-100" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg border border-concreto-200 bg-white" />)}
      </div>
      <div className="space-y-2 rounded-lg border border-concreto-200 bg-white p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-5 rounded bg-concreto-100" />)}
      </div>
    </div>
  );
}
