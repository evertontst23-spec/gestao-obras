'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, dinheiro, mensagemErro, txt } from '@/lib/acoes';

export async function transferirCusto(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const valor = dinheiro(f, 'valor');
  if (valor === null) return { erro: 'Informe o valor.' };
  const supabase = await criarClienteServidor();
  const mes = txt(f, 'competencia');
  const { error } = await supabase.rpc('custo_transferir', {
    p_origem: txt(f, 'origem'), p_destino: txt(f, 'destino'), p_categoria: txt(f, 'categoria'),
    p_valor: valor, p_competencia: mes ? `${mes}-01` : null, p_motivo: txt(f, 'motivo'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout'); revalidatePath('/obras', 'layout');
  return { ok: `Custo de ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} transferido.` };
}

export async function cancelarTransferenciaCusto(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('custo_transferencia_cancelar', { p_id: txt(f, 'id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout'); revalidatePath('/obras', 'layout');
  return { ok: 'Transferência cancelada.' };
}
