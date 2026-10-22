import { obterSessao } from '@/lib/sessao';
import { Navegacao } from '@/components/Navegacao';
import { sair } from '@/app/login/acoes';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { supabase, perfil } = await obterSessao();
  const { count } = await supabase.from('notificacoes').select('id', { count: 'exact', head: true }).eq('lida', false);
  return (
    <div className="min-h-screen">
      <Navegacao papel={perfil.papel} nome={perfil.nome} usuarioId={perfil.id} naoLidas={count ?? 0} sair={sair} />
      <main className="px-4 pb-24 pt-4 md:ml-60 md:px-8 md:pb-10 md:pt-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
