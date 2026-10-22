'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro } from '@/lib/acoes';

export async function gerarAlertasAgora(_: EstadoAcao): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('gerar_alertas');
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/', 'layout');
  return { ok: `${data ?? 0} alerta(s) novo(s) gerado(s).` };
}
