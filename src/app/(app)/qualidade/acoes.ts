'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, txt } from '@/lib/acoes';

export async function abrirNC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('nc_abrir', {
    p_obra: txt(f, 'obra_id'), p_tarefa: txt(f, 'tarefa_id'), p_item: txt(f, 'item_id'), p_local: txt(f, 'local'),
    p_descricao: txt(f, 'descricao'), p_gravidade: txt(f, 'gravidade') ?? 'moderada', p_responsavel: txt(f, 'responsavel_id'),
    p_prazo: txt(f, 'prazo'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/qualidade');
  redirect(`/qualidade/${data}?nova=1`);
}

async function chamar(nome: string, args: Record<string, unknown>, nc: string, ok: string): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc(nome, args);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/qualidade/${nc}`); revalidatePath('/qualidade'); revalidatePath('/campo');
  return { ok };
}
export async function iniciarCorrecao(_: EstadoAcao, f: FormData) {
  const nc = txt(f, 'nc')!;
  return chamar('nc_iniciar_correcao', { p_nc: nc, p_obs: txt(f, 'obs') }, nc, 'Correção iniciada.');
}
export async function registrarCorrecao(_: EstadoAcao, f: FormData) {
  const nc = txt(f, 'nc')!;
  return chamar('nc_registrar_correcao', { p_nc: nc, p_acao: txt(f, 'acao') }, nc, 'Correção informada. O engenheiro vai verificar.');
}
export async function verificarNC(_: EstadoAcao, f: FormData) {
  const nc = txt(f, 'nc')!;
  const aceitar = f.get('decisao') === 'aceitar';
  return chamar('nc_verificar', { p_nc: nc, p_aceitar: aceitar, p_parecer: txt(f, 'parecer') }, nc, aceitar ? 'Não conformidade encerrada.' : 'Não conformidade reaberta.');
}
export async function cancelarNC(_: EstadoAcao, f: FormData) {
  const nc = txt(f, 'nc')!;
  return chamar('nc_cancelar', { p_nc: nc, p_motivo: txt(f, 'motivo') }, nc, 'Não conformidade cancelada.');
}
