'use client';
/**
 * Navegação (identidade CAD): menu lateral com módulos recolhíveis, barra superior com trilha e alertas,
 * versão recolhida opcional (só ícones) e barra inferior no celular. Mesmos links e permissões de menu.ts.
 */
import { Icone } from '@/components/Icone';
import { Bell, Boxes, ChevronDown, ChevronsLeft, ChevronsRight, Database, HardHat, LayoutGrid, LogOut, Palette,
  ShieldCheck, ShoppingCart, Users, Wallet, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { ATALHOS, menuDo } from '@/lib/menu';
import { PAPEIS, type Papel } from '@/lib/dominio';

const ICONE_SECAO: Record<string, LucideIcon> = {
  Obra: HardHat, Financeiro: Wallet, SST: ShieldCheck, 'RH / Departamento Pessoal': Users, Suprimentos: ShoppingCart,
  Almoxarifado: Boxes, Cadastros: Database,
};
const NOME_SECAO: Record<string, string> = { 'RH / Departamento Pessoal': 'Departamento pessoal' };

export function NavegacaoCad({ papel, nome, usuarioId, naoLidas, sair }:
  { papel: Papel; nome: string; usuarioId: string; naoLidas: number; sair: () => Promise<void> }) {
  const caminho = usePathname();
  const router = useRouter();
  const [contador, setContador] = useState(naoLidas);
  const [recolhido, setRecolhido] = useState(false);
  const secoes = menuDo(papel);
  const todos = secoes.flatMap((s) => s.itens);
  // item ativo = o de caminho mais específico
  const ativoHref = todos.map((i) => i.href).filter((h) => caminho === h || caminho.startsWith(h + '/')).sort((a, b) => b.length - a.length)[0];
  const secaoAtiva = secoes.find((s) => s.itens.some((i) => i.href === ativoHref))?.titulo;
  const itemAtivo = todos.find((i) => i.href === ativoHref);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const aberta = (t: string) => abertas[t] ?? t === secaoAtiva;
  const atalhos = ATALHOS[papel].map((h) => todos.find((i) => i.href === h)).filter(Boolean) as typeof todos;
  const limparCache = () => { if ('caches' in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))); };
  const inicial = (nome || '?').trim().charAt(0).toUpperCase();

  useEffect(() => setContador(naoLidas), [naoLidas]);
  useEffect(() => {
    const sb = criarClienteNavegador();
    const canal = sb.channel(`notif-${usuarioId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuarioId}` },
        () => { setContador((c) => c + 1); if ('vibrate' in navigator) navigator.vibrate?.(150); router.refresh(); })
      .subscribe();
    return () => { sb.removeChannel(canal); };
  }, [usuarioId, router]);
  // menu recolhido: preferência do aparelho (só conveniência visual)
  useEffect(() => { try { setRecolhido(localStorage.getItem('menu-recolhido') === '1'); } catch { /* sem armazenamento */ } }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--menu-w', recolhido ? '76px' : '264px');
    try { localStorage.setItem('menu-recolhido', recolhido ? '1' : '0'); } catch { /* sem armazenamento */ }
  }, [recolhido]);

  const contadorTxt = contador > 99 ? '99+' : String(contador);
  const linkItem = (ativo: boolean) => `group flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500
    ${ativo ? 'bg-menu-ativo text-menu-ativo-texto' : 'text-menu-texto hover:bg-menu-hover hover:text-menu-ativo-texto'}`;

  return (
    <>
      {/* Menu lateral (computador) */}
      <aside style={{ width: 'var(--menu-w, 264px)' }}
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-menu-borda bg-menu-fundo text-menu-texto transition-[width] duration-200 md:flex">
        <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-menu-borda ${recolhido ? 'justify-center px-2' : 'px-5'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-menu-marca text-[11px] font-black tracking-wide text-white shadow-[0_6px_16px_-6px_rgb(var(--sinal-500))]">CAD</div>
          {!recolhido && <div className="min-w-0 leading-tight"><div className="text-[15px] font-semibold text-menu-ativo-texto">Gestão de Obras</div><div className="truncate text-xs text-menu-mudo">CAD Engenharia e SST</div></div>}
        </div>

        <nav aria-label="Menu principal" className={`flex-1 overflow-y-auto py-4 ${recolhido ? 'px-2' : 'px-3'}`}>
          {secoes.map((s) => {
            const geral = s.titulo === 'Geral';
            const Ic = ICONE_SECAO[s.titulo] ?? LayoutGrid;
            const contemAtivo = s.titulo === secaoAtiva;
            if (geral || recolhido) return (
              <ul key={s.titulo} className={`space-y-0.5 ${geral ? 'mb-4' : 'mb-1'}`}>
                {(recolhido && !geral ? s.itens.slice(0, 1) : s.itens).map((i) => {
                  const ativo = recolhido && !geral ? contemAtivo : ativoHref === i.href;
                  return (
                    <li key={i.href}>
                      <Link href={i.href} title={recolhido ? (geral ? i.rotulo : NOME_SECAO[s.titulo] ?? s.titulo) : undefined} aria-current={ativo ? 'page' : undefined}
                        className={`${linkItem(ativo)} ${recolhido ? 'h-11 justify-center' : 'h-10 px-3'}`}>
                        {geral ? <Icone nome={i.icone} className={`h-[18px] w-[18px] ${ativo ? 'text-menu-marca' : ''}`} /> : <Ic aria-hidden className={`h-[18px] w-[18px] ${ativo ? 'text-menu-marca' : ''}`} strokeWidth={1.8} />}
                        {!recolhido && i.rotulo}
                      </Link>
                    </li>);
                })}
              </ul>);
            return (
              <div key={s.titulo} className="mb-1">
                <button type="button" onClick={() => setAbertas((a) => ({ ...a, [s.titulo]: !aberta(s.titulo) }))} aria-expanded={aberta(s.titulo)}
                  className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] font-medium transition-colors hover:bg-menu-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500 ${contemAtivo ? 'text-menu-ativo-texto' : 'text-menu-texto'}`}>
                  <Ic aria-hidden className={`h-[18px] w-[18px] ${contemAtivo ? 'text-menu-marca' : ''}`} strokeWidth={1.8} />
                  <span className="flex-1">{NOME_SECAO[s.titulo] ?? s.titulo}</span>
                  <ChevronDown aria-hidden className={`h-4 w-4 text-menu-mudo transition-transform ${aberta(s.titulo) ? 'rotate-180' : ''}`} />
                </button>
                {aberta(s.titulo) && (
                  <ul className="mb-2 ml-[21px] mt-0.5 space-y-0.5 border-l border-menu-borda pl-3">
                    {s.itens.map((i) => {
                      const ativo = ativoHref === i.href;
                      return (
                        <li key={i.href}>
                          <Link href={i.href} aria-current={ativo ? 'page' : undefined}
                            className={`relative flex h-9 items-center rounded-lg px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500
                              ${ativo ? 'bg-menu-ativo font-semibold text-menu-ativo-texto before:absolute before:-left-[13px] before:top-2 before:h-5 before:w-0.5 before:rounded-full before:bg-menu-marca' : 'text-menu-mudo hover:bg-menu-hover hover:text-menu-ativo-texto'}`}>
                            {i.curto && i.rotulo.length > 26 ? i.curto : i.rotulo}
                          </Link>
                        </li>);
                    })}
                  </ul>)}
              </div>);
          })}
        </nav>

        <div className={`shrink-0 space-y-1 border-t border-menu-borda ${recolhido ? 'p-2' : 'p-3'}`}>
          <Link href="/aparencia" title="Aparência" className={`${linkItem(caminho === '/aparencia')} ${recolhido ? 'h-10 justify-center' : 'h-10 px-3'}`}>
            <Palette aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />{!recolhido && 'Aparência'}</Link>
          <button type="button" onClick={() => setRecolhido((r) => !r)} title={recolhido ? 'Expandir menu' : 'Recolher menu'}
            className={`${linkItem(false)} w-full ${recolhido ? 'h-10 justify-center' : 'h-10 px-3'}`}>
            {recolhido ? <ChevronsRight aria-hidden className="h-[18px] w-[18px]" /> : <><ChevronsLeft aria-hidden className="h-[18px] w-[18px]" />Recolher menu</>}
          </button>
          <div className={`mt-2 flex items-center gap-3 rounded-xl bg-menu-hover/60 ${recolhido ? 'justify-center p-2' : 'p-2.5'}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-menu-marca/15 text-sm font-semibold text-menu-marca ring-1 ring-menu-marca/30">{inicial}</div>
            {!recolhido && <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[13px] font-semibold text-menu-ativo-texto">{nome}</div><div className="truncate text-xs text-menu-mudo">{PAPEIS[papel] ?? papel}</div></div>}
            {!recolhido && (
              <form action={sair} onSubmit={limparCache}>
                <button aria-label="Sair" title="Sair" className="flex h-8 w-8 items-center justify-center rounded-lg text-menu-mudo hover:bg-menu-hover hover:text-menu-ativo-texto"><LogOut aria-hidden className="h-4 w-4" /></button>
              </form>)}
          </div>
        </div>
      </aside>

      {/* Barra superior (computador) */}
      <div style={{ marginLeft: 'var(--menu-w, 264px)' }}
        className="nao-imprimir sticky top-0 z-20 hidden h-16 items-center justify-between gap-4 border-b border-concreto-200/70 bg-concreto-50/80 px-10 backdrop-blur transition-[margin] duration-200 md:flex">
        <nav aria-label="Você está em" className="flex min-w-0 items-center gap-2 text-[13px]">
          {secaoAtiva && secaoAtiva !== 'Geral' && <><span className="truncate text-concreto-400">{NOME_SECAO[secaoAtiva] ?? secaoAtiva}</span><span className="text-concreto-300">/</span></>}
          <span className="truncate font-medium text-concreto-800">{itemAtivo?.rotulo ?? (caminho.startsWith('/notificacoes') ? 'Alertas' : caminho === '/aparencia' ? 'Aparência' : '')}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/notificacoes" aria-label={`Alertas${contador ? ` (${contadorTxt} não lidos)` : ''}`}
            className="relative flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-concreto-600 hover:bg-superficie hover:text-concreto-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sinal-500">
            <Bell aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />Alertas
            {contador > 0 && <span className="min-w-[22px] rounded-full bg-sinal-500 px-1.5 py-0.5 text-center text-[11px] font-bold text-white">{contadorTxt}</span>}
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-superficie text-sm font-semibold text-concreto-800 ring-1 ring-concreto-200" aria-hidden>{inicial}</div>
        </div>
      </div>

      {/* Celular: barra superior */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-menu-borda bg-menu-fundo px-4 text-menu-texto md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-menu-marca text-[10px] font-black text-white">CAD</div>
          <div className="min-w-0 leading-tight"><div className="truncate text-[15px] font-semibold text-menu-ativo-texto">{itemAtivo?.curto ?? itemAtivo?.rotulo ?? 'Gestão de Obras'}</div>
            {secaoAtiva && secaoAtiva !== 'Geral' && <div className="truncate text-[11px] text-menu-mudo">{NOME_SECAO[secaoAtiva] ?? secaoAtiva}</div>}</div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/notificacoes" aria-label="Alertas" className="relative flex h-10 w-10 items-center justify-center rounded-lg text-menu-texto">
            <Bell aria-hidden className="h-5 w-5" strokeWidth={1.8} />
            {contador > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-sinal-500 px-1 text-center text-[10px] font-bold text-white">{contadorTxt}</span>}
          </Link>
          <form action={sair} onSubmit={limparCache}><button aria-label="Sair" className="flex h-10 w-10 items-center justify-center rounded-lg text-menu-mudo"><LogOut aria-hidden className="h-[18px] w-[18px]" /></button></form>
        </div>
      </header>

      {/* Celular: barra inferior */}
      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-menu-borda bg-menu-fundo/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {atalhos.map((i) => {
          const ativo = ativoHref === i.href;
          return (
            <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${ativo ? 'text-menu-marca' : 'text-menu-mudo'}`}>
              <Icone nome={i.icone} className="h-5 w-5" /><span className="w-full truncate px-0.5 text-center">{i.curto ?? i.rotulo}</span>
            </Link>);
        })}
        <Link href="/menu" className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${caminho === '/menu' ? 'text-menu-marca' : 'text-menu-mudo'}`}>
          <LayoutGrid aria-hidden className="h-5 w-5" strokeWidth={1.75} />Menu
        </Link>
      </nav>
    </>
  );
}
