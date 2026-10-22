'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

const atualizar = (id?: string | null) => { revalidatePath('/dp/pagamentos'); if (id) revalidatePath(`/dp/pagamentos/${id}`); revalidatePath('/financeiro', 'layout'); };

export async function criarPagamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data: id, error } = await supabase.rpc('pagamento_criar', {
    p_data: txt(f, 'data_pagamento'), p_titulo: txt(f, 'titulo'), p_tipo: txt(f, 'tipo') ?? 'adiantamento',
    p_inicio: txt(f, 'periodo_inicio'), p_fim: txt(f, 'periodo_fim'), p_obs: txt(f, 'observacoes'),
  });
  if (error) return { erro: mensagemErro(error) };
  if (f.get('gerar')) {
    const g = await supabase.rpc('pagamento_gerar', { p_pagamento: id, p_beneficios: !!(txt(f, 'periodo_inicio') && txt(f, 'periodo_fim')) });
    if (g.error) return { erro: `Pagamento criado, mas não foi possível calcular as linhas: ${mensagemErro(g.error)}` };
  }
  atualizar();
  redirect(`/dp/pagamentos/${id}`);
}

export async function gerarLinhas(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = txt(f, 'id');
  const { data: n, error } = await supabase.rpc('pagamento_gerar', { p_pagamento: id, p_beneficios: f.get('beneficios') === 'on' });
  if (error) return { erro: mensagemErro(error) };
  atualizar(id);
  return { ok: `${n} linha(s) calculada(s). Confira e ajuste antes de fechar.` };
}

export async function salvarItem(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = txt(f, 'id');
  const valor = numero(f, 'valor');
  if (valor === null) return { erro: 'Informe o valor.' };
  const { error } = await supabase.rpc('pagamento_item_salvar', { p_pagamento: id, p: {
    funcionario_id: txt(f, 'funcionario_id'), empregador_id: txt(f, 'empregador_id'), obra_id: txt(f, 'obra_id'),
    categoria: txt(f, 'categoria') ?? 'outro', destino: txt(f, 'destino'), descricao: txt(f, 'descricao'),
    valor: txt(f, 'categoria') === 'desconto' ? -Math.abs(valor) : valor,
  } });
  if (error) return { erro: mensagemErro(error) };
  atualizar(id);
  return { ok: 'Linha incluída.' };
}

export async function removerItem(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('pagamento_item_remover', { p_item: Number(txt(f, 'item')) });
  if (error) return { erro: mensagemErro(error) };
  atualizar(txt(f, 'id'));
  return { ok: 'Linha retirada.' };
}

export async function fecharPagamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = txt(f, 'id');
  const { error } = await supabase.rpc('pagamento_fechar', { p_pagamento: id });
  if (error) return { erro: mensagemErro(error) };
  atualizar(id);
  return { ok: 'Pagamento fechado. As contas a pagar já estão no financeiro.' };
}

export async function quitarPagamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = txt(f, 'id');
  const { error } = await supabase.rpc('pagamento_quitar', { p_pagamento: id, p_data: txt(f, 'data') });
  if (error) return { erro: mensagemErro(error) };
  atualizar(id);
  return { ok: 'Pagamento registrado como pago. As contas foram baixadas no financeiro.' };
}

export async function reabrirPagamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = txt(f, 'id');
  const { error } = await supabase.rpc('pagamento_reabrir', { p_pagamento: id, p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  atualizar(id);
  return { ok: 'Pagamento reaberto para ajustes. As contas geradas foram canceladas e voltam ao fechar de novo.' };
}

export async function cancelarPagamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = txt(f, 'id');
  const { error } = await supabase.rpc('pagamento_cancelar', { p_pagamento: id, p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  atualizar(id);
  return { ok: 'Pagamento cancelado.' };
}
