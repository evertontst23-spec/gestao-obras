'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

export async function criarSolicitacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const materiais = f.getAll('material');
  const itens = materiais.map((m, i) => ({
    material: String(m).trim(),
    especificacao: String(f.getAll('especificacao')[i] ?? '').trim(),
    unidade: String(f.getAll('unidade')[i] ?? '').trim(),
    quantidade: Number(String(f.getAll('quantidade')[i] ?? '').replace(/\./g, (m, o, t: string) => (t.includes(',') ? '' : m)).replace(',', '.')),
    modalidade: String(f.getAll('modalidade')[i] ?? 'compra') === 'locacao' ? 'locacao' : 'compra',
    locacao_inicio: String(f.getAll('locacao_inicio')[i] ?? '') || null,
    locacao_fim: String(f.getAll('locacao_fim')[i] ?? '') || null,
  })).filter((i) => i.material);
  if (!itens.length) return { erro: 'Inclua pelo menos um material.' };
  const semNome = itens.find((i) => / —\s*$/.test(i.material));
  if (semNome) return { erro: `O código ${semNome.material.replace(/ —\s*$/, '')} não está no cadastro. Digite o nome do material para cadastrá-lo.` };
  if (itens.some((i) => !i.unidade || !(i.quantidade > 0))) return { erro: 'Cada material precisa de unidade e quantidade maior que zero.' };
  const loc = itens.find((i) => i.modalidade === 'locacao' && (!i.locacao_inicio || !i.locacao_fim || i.locacao_fim < i.locacao_inicio));
  if (loc) return { erro: `Informe o período da locação de ${loc.material} (o fim não pode ser antes do início).` };
  const tarefa = txt(f, 'tarefa_id');
  if (!tarefa) return { erro: 'Escolha a tarefa da planilha ligada a este pedido, ou “Sem vínculo”.' };
  if (tarefa === 'sem' && (txt(f, 'observacoes') ?? '').length < 5) return { erro: 'Pedido sem vínculo: explique na observação para que é o material.' };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('criar_solicitacao', {
    p_obra: txt(f, 'obra_id'), p_tarefa: tarefa === 'sem' ? null : tarefa, p_data_necessidade: txt(f, 'data_necessidade'),
    p_prioridade: txt(f, 'prioridade') ?? 'normal', p_justificativa: txt(f, 'justificativa'), p_observacoes: txt(f, 'observacoes'),
    p_itens: itens,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/materiais'); revalidatePath('/campo');
  redirect(`/materiais/${data}?criado=1`);
}

async function chamar(nome: string, args: Record<string, unknown>, sol: string, ok: string): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc(nome, args);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/materiais/${sol}`); revalidatePath('/suprimentos'); revalidatePath('/campo'); revalidatePath('/painel');
  return { ok };
}

export async function decidirSolicitacao(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  const aprovar = f.get('decisao') === 'aprovar';
  return chamar('solicitacao_decidir', { p_solicitacao: s, p_aprovar: aprovar, p_parecer: txt(f, 'parecer') }, s,
    aprovar ? 'Pedido aprovado e enviado ao almoxarifado.' : 'Pedido rejeitado.');
}
export async function verificarEstoque(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  return chamar('item_verificar_estoque', { p_item: txt(f, 'item'), p_disponivel: numero(f, 'disponivel'), p_observacao: txt(f, 'observacao') }, s, 'Estoque verificado.');
}
export async function atualizarCompra(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  return chamar('item_atualizar_compra', {
    p_item: txt(f, 'item'), p_status: txt(f, 'status'), p_fornecedor: txt(f, 'fornecedor'),
    p_previsao: txt(f, 'previsao'), p_observacao: txt(f, 'observacao'),
  }, s, 'Compra atualizada.');
}
export async function registrarEnvio(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  return chamar('item_registrar_envio', { p_item: txt(f, 'item'), p_quantidade: numero(f, 'quantidade'), p_observacao: txt(f, 'observacao') }, s, 'Envio registrado. O encarregado vai confirmar o recebimento.');
}
export async function confirmarEntrega(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  return chamar('entrega_confirmar', { p_entrega: txt(f, 'entrega'), p_quantidade_recebida: numero(f, 'recebida'), p_observacao: txt(f, 'observacao') }, s, 'Recebimento confirmado.');
}
export async function cancelarItem(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  return chamar('item_cancelar', { p_item: txt(f, 'item'), p_motivo: txt(f, 'motivo') }, s, 'Item cancelado.');
}
export async function devolverLocacao(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  const r = await chamar('locacao_devolver', { p_item: txt(f, 'item'), p_data: txt(f, 'data'), p_obs: txt(f, 'observacao') }, s, 'Devolução registrada. A locação foi encerrada.');
  revalidatePath('/suprimentos/locacoes');
  return r;
}
export async function prorrogarLocacao(_: EstadoAcao, f: FormData) {
  const s = txt(f, 'solicitacao')!;
  const r = await chamar('locacao_prorrogar', { p_item: txt(f, 'item'), p_fim: txt(f, 'fim'), p_obs: txt(f, 'observacao') }, s, 'Locação prorrogada.');
  revalidatePath('/suprimentos/locacoes');
  return r;
}
export async function verificarEstoqueLote(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const itens = f.getAll('itens').map(String).filter(Boolean);
  const modo = txt(f, 'modo') === 'estoque' ? 'estoque' : 'cotacao';
  if (!itens.length) return { erro: 'Nenhum item selecionado.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('itens_verificar_estoque_lote', { p_itens: itens, p_modo: modo, p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  const sol = txt(f, 'solicitacao');
  if (sol) revalidatePath(`/materiais/${sol}`);
  revalidatePath('/suprimentos'); revalidatePath('/campo'); revalidatePath('/painel');
  return { ok: modo === 'estoque' ? `${data} item(ns) separados do estoque.` : `${data} item(ns) enviados para cotação.` };
}
