'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

const rev = () => { revalidatePath('/suprimentos', 'layout'); revalidatePath('/materiais', 'layout'); };

export async function lancarEstoque(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const tipo = txt(f, 'tipo')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('estoque_lancar', {
    p_obra: txt(f, 'obra_id'), p_insumo: txt(f, 'insumo_id'), p_tipo: tipo === 'transferencia' ? 'saida' : tipo,
    p_quantidade: numero(f, 'quantidade'), p_observacao: txt(f, 'observacao'),
    p_destino: txt(f, 'destino_id'), p_transferir: tipo === 'transferencia',
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Lançamento registrado no estoque.' };
}

export async function criarCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const itens: Record<string, string | number>[] = f.getAll('solicitacao_item_id').map((v) => ({ solicitacao_item_id: String(v) }));
  const reposIns = f.getAll('repor_insumo').map(String), reposQtd = f.getAll('repor_qtd').map(String);
  reposIns.forEach((ins, i) => { const q = Number((reposQtd[i] ?? '').replace(',', '.')); if (ins && q > 0) itens.push({ insumo_id: ins, quantidade: q }); });
  if (!itens.length) return { erro: 'Selecione os itens pendentes ou informe insumos para reposição.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('cotacao_criar', {
    p_obra: txt(f, 'obra_id'), p_itens: itens, p_justificativa_estoque: txt(f, 'justificativa_estoque'), p_observacoes: txt(f, 'observacoes'),
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  redirect(`/suprimentos/cotacoes/${data}`);
}

export async function salvarProposta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const precos = f.getAll('item_id').map((id, i) => ({ cotacao_item_id: String(id), preco_unitario: String(f.getAll('preco')[i] ?? '').replace(',', '.') }));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_proposta_salvar', {
    p_cotacao: cot, p_fornecedor: txt(f, 'fornecedor_id'), p_prazo: numero(f, 'prazo'), p_condicao: txt(f, 'condicao'),
    p_frete: numero(f, 'frete') ?? 0, p_precos: precos, p_obs: txt(f, 'observacoes'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/suprimentos/cotacoes/${cot}`);
  return { ok: 'Proposta registrada.' };
}

export async function enviarAprovacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_enviar_aprovacao', { p_cotacao: cot, p_proposta: txt(f, 'proposta_id'), p_justificativa: txt(f, 'justificativa') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Enviado para aprovação da diretoria.' };
}

export async function decidirCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const aprovar = f.get('decisao') === 'aprovar';
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('cotacao_decidir', {
    p_cotacao: cot, p_aprovar: aprovar, p_parecer: txt(f, 'parecer'), p_modalidade: txt(f, 'modalidade') ?? 'entrega', p_retirante: txt(f, 'retirante'),
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  if (aprovar && data) redirect(`/suprimentos/ordens/${data}`);
  return { ok: 'Compra recusada e devolvida ao comprador.' };
}

export async function cancelarCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_cancelar', { p_cotacao: txt(f, 'cotacao_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Cotação cancelada. Os itens voltaram para a fila.' };
}

export async function anexarDocumentoOC(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_anexar_documento', {
    p_oc: c.oc_id, p_tipo: c.tipo ?? 'outro', p_numero: c.numero, p_valor: c.valor ? Number(c.valor.replace(/\./g, '').replace(',', '.')) : null,
    p_vencimento: c.vencimento, p_caminho: c.caminho, p_mime: c.tipo_mime,
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Documento anexado à OC.' };
}

export async function liberarColeta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_liberar_coleta', { p_oc: txt(f, 'oc_id'), p_pagamento: txt(f, 'pagamento'), p_retirante: txt(f, 'retirante'), p_previsao: txt(f, 'previsao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'OC liberada — todos foram avisados.' };
}

export async function receberOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const itens = f.getAll('oc_item_id').map((id, i) => ({ oc_item_id: String(id), quantidade: String(f.getAll('qtd')[i] ?? '').replace(',', '.') }));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_receber', { p_oc: txt(f, 'oc_id'), p_itens: itens, p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Recebimento lançado: estoque atualizado e todos avisados.' };
}

export async function cancelarOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_cancelar', { p_oc: txt(f, 'oc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'OC cancelada; os itens voltaram para cotação.' };
}
