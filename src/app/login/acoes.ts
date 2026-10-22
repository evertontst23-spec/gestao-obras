'use server';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, txt } from '@/lib/acoes';

export async function entrar(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: txt(f, 'email') ?? '', password: (f.get('senha') as string) ?? '' });
  if (error) return { erro: 'E-mail ou senha incorretos.' };
  const voltar = txt(f, 'voltar');
  redirect(voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/');
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect('/login');
}
