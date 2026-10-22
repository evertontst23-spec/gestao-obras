'use client';
import { useEffect, useState } from 'react';

/** Depois de uma atualização do sistema, uma aba que já estava aberta pode pedir arquivos que não existem
 *  mais. Nesse caso a página é recarregada sozinha (uma vez). Nos demais erros, mostra o aviso e o botão. */
const versaoAntiga = (e: Error) => /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch|Server Action/i.test(`${e.name} ${e.message}`);

export function ErroTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recarregando, setRecarregando] = useState(false);
  useEffect(() => {
    console.error(error);
    if (versaoAntiga(error)) {
      let ja = false;
      try { ja = sessionStorage.getItem('recarregou') === location.pathname; sessionStorage.setItem('recarregou', location.pathname); } catch { /* sem armazenamento */ }
      if (!ja) { setRecarregando(true); location.reload(); }
    }
  }, [error]);
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <div className="mb-2 text-3xl">⚠</div>
      <h2 className="mb-2 text-lg font-bold">{recarregando ? 'Atualizando o sistema…' : 'Algo deu errado nesta tela'}</h2>
      {!recarregando && <>
        <p className="mb-4 text-sm text-concreto-600">O sistema pode ter sido atualizado enquanto a página estava aberta. Recarregue para continuar.</p>
        <div className="flex justify-center gap-2">
          <button onClick={() => { try { sessionStorage.removeItem('recarregou'); } catch {} location.reload(); }} className="rounded-md bg-sinal-500 px-4 py-2 text-sm font-semibold text-white">Recarregar</button>
          <button onClick={() => reset()} className="rounded-md border border-concreto-300 bg-white px-4 py-2 text-sm font-semibold">Tentar de novo</button>
        </div>
        <p className="mt-4 break-all text-xs text-concreto-400">{error.digest ? `Código: ${error.digest}` : error.message}</p>
      </>}
    </div>
  );
}
