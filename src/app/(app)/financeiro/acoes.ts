'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

const brl = (v: string | null) => (v ? v.replace(/\./g, '').replace(',', '.') : null);

/** Novo lançamento (com comprovante opcional enviado antes para o Storage) */
export async function criarLancamento(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('lancamento_criar', { p: { ...c, valor: brl(c.valor), liquidado: c.liquidado === 'on' } });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Lançamento registrado.' };
}

export async function liquidarLancamento(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('lancamento_liquidar', {
    p_id: c.id, p_data: c.data, p_valor: c.valor ? Number(brl(c.valor)) : null, p_forma: c.forma, p_caminho: c.caminho,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Baixa registrada.' };
}

export async function reprogramarLancamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('lancamento_reprogramar', { p_id: txt(f, 'id'), p_vencimento: txt(f, 'vencimento'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Vencimento alterado.' };
}

export async function cancelarLancamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('lancamento_cancelar', { p_id: txt(f, 'id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Lançamento cancelado.' };
}

export async function gerarBM(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('bm_gerar', { p_obra: txt(f, 'obra_id'), p_inicio: txt(f, 'inicio'), p_fim: txt(f, 'fim'), p_obs: txt(f, 'observacoes') });
  if (error) return { erro: mensagemErro(error) };
  redirect(`/financeiro/medicoes/${data}`);
}

export async function aprovarBM(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('bm_aprovar', { p_bm: txt(f, 'id'), p_data: txt(f, 'data'), p_nf: txt(f, 'nf'), p_outras: numero(f, 'outras') ?? 0 });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Medição aprovada — contas a receber geradas.' };
}

export async function cancelarBM(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('bm_cancelar', { p_bm: txt(f, 'id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/financeiro', 'layout');
  return { ok: 'Boletim cancelado — as execuções voltam a ficar disponíveis para medição.' };
}

export async function salvarContrato(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const p: Record<string, string | null> = {};
  for (const k of ['valor_contrato', 'orcamento_custo', 'iss_pct', 'inss_ret_pct', 'base_mao_obra_pct', 'retencao_tecnica_pct', 'impostos_faturamento_pct', 'prazo_recebimento_dias']) {
    const v = txt(f, k); p[k] = v === null ? null : v.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  }
  const id = txt(f, 'obra_id');
  const { error } = await supabase.rpc('obra_contrato_salvar', { p_obra: id, p });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/obras/${id}/financeiro`);
  return { ok: 'Contrato salvo.' };
}

// ---------------------------------------------------------------- Diário de obra
export async function registrarDiario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const obra = txt(f, 'obra_id');
  const dados: Record<string, unknown> = {};
  for (const k of ['clima', 'servicos_executados', 'ocorrencias', 'paralisacoes', 'necessidades_material', 'observacoes']) dados[k] = txt(f, k);
  try { dados.frentes = JSON.parse(txt(f, 'frentes') ?? '[]'); } catch { return { erro: 'Frentes de serviço inválidas.' }; }
  if (!(dados.frentes as unknown[]).length && !dados.servicos_executados) return { erro: 'Adicione pelo menos uma frente de serviço (serviço e quem trabalhou) ou escreva o resumo do dia.' };
  const { data, error } = await supabase.rpc('diario_registrar', { p_obra: obra, p_data: txt(f, 'data'), p_dados: dados, p_tarefas: [] });
  if (error) return { erro: mensagemErro(error) };
  redirect(`/obras/${obra}/diario/${data}`);
}

export async function validarDiario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('diario_validar', { p_diario: txt(f, 'id') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/obras/${txt(f, 'obra_id')}/diario`, 'layout');
  return { ok: 'Diário validado.' };
}
