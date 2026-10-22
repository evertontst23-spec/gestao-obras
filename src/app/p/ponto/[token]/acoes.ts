'use server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import type { EstadoAcao } from '@/lib/acoes';

/** Cliente sem sessão: o funcionário não tem login, o token do link é a credencial */
export const clienteAnonimo = async () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export async function pedirCorrecao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const token = String(f.get('token') ?? '');
  const { error } = await (await clienteAnonimo()).rpc('ponto_contestar', { p_token: token, p_data: f.get('data'), p_mensagem: f.get('mensagem') });
  if (error) return { erro: error.message };
  revalidatePath(`/p/ponto/${token}`);
  return { ok: 'Pedido enviado ao RH. A resposta aparece aqui embaixo.' };
}
