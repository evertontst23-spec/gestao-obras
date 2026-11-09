'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, paraNumero, txt } from '@/lib/acoes';

/** Nova nota (o arquivo já foi enviado ao Storage pelo formulário) */
export async function registrarNota(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const valor = c.valor ? paraNumero(c.valor, true) : null;
  const { error } = await supabase.rpc('nota_registrar', { p: { ...c, valor, pago: c.pago === 'on' } });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Nota registrada e lançada no financeiro.' };
}

export async function cancelarNota(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('nota_cancelar', { p_id: txt(f, 'id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Nota cancelada (a despesa também).' };
}

export async function novaCategoriaNota(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('nota_categoria_salvar', { p_nome: txt(f, 'nome'), p_categoria_fin: txt(f, 'categoria_fin') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro/notas');
  return { ok: 'Categoria criada.' };
}
