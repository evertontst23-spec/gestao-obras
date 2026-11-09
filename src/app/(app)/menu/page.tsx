import { Icone } from '@/components/Icone';
import Link from 'next/link';
import { Palette } from 'lucide-react';
import { obterSessao } from '@/lib/sessao';
import { menuDo } from '@/lib/menu';

export const metadata = { title: 'Menu' };

export default async function Menu() {
  const { perfil } = await obterSessao();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      {menuDo(perfil.papel).map((s) => (
        <section key={s.titulo}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-concreto-500">{s.titulo}</h2>
          <div className="grid grid-cols-2 gap-2">
            {s.itens.map((i) => (
              <Link key={i.href} href={i.href} className="flex min-h-[64px] items-center gap-3 rounded-lg border border-concreto-200 bg-superficie px-4 font-semibold active:bg-concreto-100">
                <Icone nome={i.icone} className="h-5 w-5 text-sinal-600" />{i.rotulo}
              </Link>))}
          </div>
        </section>
      ))}
      <Link href="/aparencia" className="flex min-h-[56px] items-center gap-3 rounded-lg border border-concreto-200 bg-superficie px-4 font-semibold shadow-cartao active:bg-concreto-100">
        <Palette aria-hidden className="h-5 w-5 text-sinal-600" strokeWidth={1.75} />Aparência (escolher o visual)
      </Link>
    </div>
  );
}
