import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { criarClienteServidor } from './supabase/server';
import type { Papel, Perfil } from './dominio';

/** Usuário logado + perfil. Redireciona para o login se não houver sessão. */
export const obterSessao = cache(async () => {
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('perfis').select('*').eq('id', user.id).single();
  if (!perfil || !perfil.ativo) redirect('/login?erro=inativo');
  return { supabase, perfil: perfil as Perfil };
});

export async function exigirPapel(...papeis: Papel[]) {
  const s = await obterSessao();
  if (!papeis.includes(s.perfil.papel)) redirect('/');
  return s;
}

export const gestor = (p: Papel) => p === 'admin' || p === 'engenheiro';
