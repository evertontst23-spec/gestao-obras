'use client';
import { Icone } from '@/components/Icone';
import { Bell, LayoutGrid, Palette } from 'lucide-react';
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
      className={`relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${caminho.startsWith('/notificacoes') ? 'bg-menu-ativo text-menu-ativo-texto' : 'text-menu-texto hover:bg-menu-hover'}`}>
      <Bell aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} /><span className="hidden lg:inline">Alertas</span>
      {contador > 0 && <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-sinal-500 px-1.5 text-center text-xs font-bold text-white">{contador > 99 ? '99+' : contador}</span>}
    </Link>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-menu-borda bg-menu-fundo text-menu-texto md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-menu-marca text-[12px] font-extrabold tracking-wide text-white">CAD</div>
          <div className="min-w-0"><div className="text-[15px] font-extrabold leading-tight">Gestão de Obras</div><div className="truncate text-xs text-menu-mudo">CAD Engenharia</div></div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {secoes.map((s) => (
            <div key={s.titulo}>
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-menu-mudo">{s.titulo}</div>
              <div className="space-y-0.5">
                {s.itens.map((i) => (
                  <Link key={i.href} href={i.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${ativoHref === i.href ? 'bg-menu-ativo text-menu-ativo-texto' : 'text-menu-texto hover:bg-menu-hover'}`}>
                    <Icone nome={i.icone} className={`h-[18px] w-[18px] ${ativoHref === i.href ? 'text-menu-marca' : 'opacity-80'}`} />{i.rotulo}
                  </Link>))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-menu-borda p-3">
          <Link href="/aparencia" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${caminho === '/aparencia' ? 'bg-menu-ativo text-menu-ativo-texto' : 'text-menu-texto hover:bg-menu-hover'}`}><Palette aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />Aparência</Link>
          {sino}
          <div className="mt-1 flex items-center gap-2.5 rounded-md border border-menu-borda px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-menu-hover text-sm font-bold">{(nome || '?').trim().charAt(0).toUpperCase()}</div>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{nome}</div>
            <form action={sair} onSubmit={limparCache}><button className="rounded-md px-2 py-1 text-xs font-semibold text-menu-mudo hover:bg-menu-hover">Sair</button></form>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-menu-borda bg-menu-fundo px-4 py-2 text-menu-texto md:hidden">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-menu-marca">Gestão de Obras</div>
          <div className="truncate text-sm font-semibold">{nome}</div>
        </div>
        <div className="flex items-center gap-1">
          {sino}
          <form action={sair} onSubmit={limparCache}><button className="rounded-md px-2 py-2 text-xs text-menu-mudo">Sair</button></form>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-concreto-200 bg-superficie md:hidden"
           style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {atalhos.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${ativoHref === i.href ? 'text-sinal-600' : 'text-concreto-500'}`}>
            <Icone nome={i.icone} className="h-5 w-5" /><span className="w-full truncate px-0.5 text-center">{i.curto ?? i.rotulo}</span>
          </Link>
        ))}
        <Link href="/menu" className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${caminho === '/menu' ? 'text-sinal-600' : 'text-concreto-500'}`}>
          <LayoutGrid aria-hidden className="h-5 w-5" strokeWidth={1.75} />Menu
        </Link>
      </nav>
    </>
  );
}
