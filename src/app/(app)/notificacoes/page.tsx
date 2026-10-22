import { revalidatePath } from 'next/cache';
import { obterSessao } from '@/lib/sessao';
import { criarClienteServidor } from '@/lib/supabase/server';
import { Cabecalho, Vazio } from '@/components/ui';
import { relativo } from '@/lib/formato';

export const metadata = { title: 'Notificações' };

const ICONE: Record<string, string> = {
  atrasado: '🔴', vencimento_proximo: '🟠', inicio_hoje: '▶', risco_atraso_material: '⚠', entrega_atrasada: '⚠', paralisado_material: '⛔',
  aguardando_validacao: '⚑', material_aprovacao: '▤', tarefa_atribuida: '✚', tarefa_aprovada: '★', tarefa_rejeitada: '↺', material_enviado: '📦',
};

async function marcarTodas() {
  'use server';
  const supabase = await criarClienteServidor();
  await supabase.from('notificacoes').update({ lida: true }).eq('lida', false);
  revalidatePath('/', 'layout');
}

export default async function Notificacoes({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const { todas } = await searchParams;
  const { supabase } = await obterSessao();
  let q = supabase.from('notificacoes').select('*').order('criado_em', { ascending: false }).limit(200);
  if (!todas) q = q.eq('lida', false);
  const { data: lista } = await q;
  return (
    <div className="mx-auto max-w-2xl">
      <Cabecalho titulo="Central de notificações"
        sub={<a href={todas ? '/notificacoes' : '/notificacoes?todas=1'} className="link">{todas ? 'Mostrar só não lidas' : 'Mostrar todas'}</a>}
        acoes={!!lista?.some((n) => !n.lida) && <form action={marcarTodas}><button className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">Marcar todas como lidas</button></form>} />
      {!lista?.length ? <Vazio>Nenhuma notificação {todas ? '' : 'nova'}.</Vazio> : (
        <ul className="divide-y divide-concreto-100 overflow-hidden rounded-lg border border-concreto-200 bg-white">
          {lista.map((n) => (
            <li key={n.id}>
              <a href={`/notificacoes/abrir/${n.id}`} className={`flex gap-3 p-4 hover:bg-concreto-50 ${n.lida ? 'opacity-60' : ''}`}>
                <span className="w-6 text-center text-lg">{ICONE[n.tipo] ?? '•'}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.lida ? '' : 'font-bold'}`}>{n.titulo}</span>
                  {n.mensagem && <span className="block text-sm text-concreto-600">{n.mensagem}</span>}
                  <span className="text-xs text-concreto-400">{relativo(n.criado_em)}</span>
                </span>
                {!n.lida && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sinal-500" />}
              </a>
            </li>))}
        </ul>
      )}
    </div>
  );
}
