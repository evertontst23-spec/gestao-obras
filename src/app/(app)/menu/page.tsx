import Link from 'next/link';
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
              <Link key={i.href} href={i.href} className="flex min-h-[64px] items-center gap-3 rounded-lg border border-concreto-200 bg-white px-4 font-semibold active:bg-concreto-100">
                <span aria-hidden className="text-xl text-sinal-600">{i.icone}</span>{i.rotulo}
              </Link>))}
          </div>
        </section>
      ))}
    </div>
  );
}
