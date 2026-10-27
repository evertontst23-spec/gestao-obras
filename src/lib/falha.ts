/** Texto para mostrar quando uma ação do servidor falha no navegador. */
export function textoFalha(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/Server Action|failed-to-find-server-action|Failed to fetch|NetworkError|Load failed/i.test(m)) {
    return /Failed to fetch|NetworkError|Load failed/i.test(m)
      ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
      : 'O sistema foi atualizado enquanto esta tela estava aberta. Recarregue a página (↻) e tente de novo.';
  }
  return m;
}
