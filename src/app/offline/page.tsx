export default function Offline() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-4xl">📶</div>
      <h1 className="text-lg font-bold">Sem conexão</h1>
      <p className="max-w-xs text-sm text-concreto-600">O canteiro está sem internet no momento. As telas já abertas continuam disponíveis; tente novamente quando o sinal voltar.</p>
    </main>
  );
}
