import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Marca a notificação como lida e abre o destino. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('notificacoes').update({ lida: true }).eq('id', Number(id)).select('link').maybeSingle();
  const destino = data?.link && data.link.startsWith('/') ? data.link : '/notificacoes';
  return NextResponse.redirect(new URL(destino, req.url));
}
