'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, txt } from '@/lib/acoes';

export async function escolherTema(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('perfil_tema', { p_tema: txt(f, 'tema') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/', 'layout');
  return { ok: 'Visual aplicado.' };
}
