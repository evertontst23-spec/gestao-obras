'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { ATALHOS, menuDo } from '@/lib/menu';
import type { Papel } from '@/lib/dominio';

export function Navegacao({ papel, nome, usuarioId, naoLidas, sair }:
  { papel: Papel; nome: string; usuarioId: string; naoLidas: number; sair: () => Promise<void> }) {
  const caminho = usePathname();
  const router = useRouter();
  const [contador, setContador] = useState(naoLidas);
  const secoes = menuDo(papel);
  const todos = secoes.flatMap((s) => s.itens);
  // item ativo = o de caminho mais específico
  const ativoHref = todos.map((i) => i.href).filter((h) => caminho === h || caminho.startsWith(h + '/')).sort((a, b) => b.length - a.length)[0];
  const atalhos = ATALHOS[papel].map((h) => todos.find((i) => i.href === h)).filter(Boolean) as typeof todos;
  const limparCache = () => { if ('caches' in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))); };

  useEffect(() => setContador(naoLidas), [naoLidas]);
  useEffect(() => {
    const sb = criarClienteNavegador();
    const canal = sb.channel(`notif-${usuarioId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuarioId}` },
        () => { setContador((c) => c + 1); if ('vibrate' in navigator) navigator.vibrate?.(150); router.refresh(); })
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [usuarioId, router]);

  const sino = (
    <Link href="/notificacoes" aria-label="Notificações"
      className={`relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${caminho.startsWith('/notificacoes') ? 'bg-concreto-700 text-white' : 'text-concreto-200 hover:bg-concreto-700'}`}>
      <span aria-hidden>🔔</span><span className="hidden lg:inline">Alertas</span>
      {contador > 0 && <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-sinal-500 px-1.5 text-center text-xs font-bold text-white">{contador > 99 ? '99+' : contador}</span>}
    </Link>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-concreto-900 text-concreto-100 md:flex">
        <div className="border-b border-concreto-700 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sinal-400">Gestão de Obras</div>
          <div className="mt-1 truncate text-sm font-semibold">{nome}</div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {secoes.map((s) => (
            <div key={s.titulo}>
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-concreto-500">{s.titulo}</div>
              <div className="space-y-0.5">
                {s.itens.map((i) => (
                  <Link key={i.href} href={i.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-semibold ${ativoHref === i.href ? 'bg-sinal-500 text-white' : 'text-concreto-200 hover:bg-concreto-700'}`}>
                    <span aria-hidden className="w-4 text-center">{i.icone}</span>{i.rotulo}
                  </Link>))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-concreto-700 p-3">
          {sino}
          <form action={sair} onSubmit={limparCache}><button className="w-full rounded-md px-3 py-2 text-left text-sm text-concreto-400 hover:bg-concreto-700">Sair</button></form>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-concreto-900 px-4 py-2 text-white md:hidden">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sinal-400">Gestão de Obras</div>
          <div className="truncate text-sm font-semibold">{nome}</div>
        </div>
        <div className="flex items-center gap-1">
          {sino}
          <form action={sair} onSubmit={limparCache}><button className="rounded-md px-2 py-2 text-xs text-concreto-300">Sair</button></form>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-concreto-200 bg-white md:hidden"
           style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {atalhos.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${ativoHref === i.href ? 'text-sinal-600' : 'text-concreto-500'}`}>
            <span aria-hidden className="text-lg leading-none">{i.icone}</span><span className="w-full truncate px-0.5 text-center">{i.curto ?? i.rotulo}</span>
          </Link>
        ))}
        <Link href="/menu" className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${caminho === '/menu' ? 'text-sinal-600' : 'text-concreto-500'}`}>
          <span aria-hidden className="text-lg leading-none">☷</span>Menu
        </Link>
      </nav>
    </>
  );
}
