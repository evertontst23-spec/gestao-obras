'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, txt } from '@/lib/acoes';

const n = (v: string | null) => (v == null || v.trim() === '' ? null : String(Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v)));

export async function criarMesBeneficios(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const mes = txt(f, 'mes');
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('beneficio_competencia_criar', { p_mes: `${mes}-01`, p_dias_uteis: Number(txt(f, 'dias_uteis') ?? 0), p_obs: txt(f, 'observacoes') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  redirect(`/dp/beneficios?mes=${mes}`);
}

export async function salvarLinhaBeneficio(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('beneficio_linha_salvar', { p: {
    competencia_id: txt(f, 'competencia_id'), funcionario_id: txt(f, 'funcionario_id'), obra_id: txt(f, 'obra_id'), tipo: txt(f, 'tipo'),
    dias: n(txt(f, 'dias')), dias_retroativos: n(txt(f, 'dias_retroativos')), dias_desconto: n(txt(f, 'dias_desconto')),
    qtd_dia: n(txt(f, 'qtd_dia')), valor_unitario: n(txt(f, 'valor_unitario')), observacao: txt(f, 'observacao'), adicional_tipo: txt(f, 'adicional_tipo'),
  } });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  return { ok: 'Salvo.' };
}

export async function removerLinhaBeneficio(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('beneficio_linha_remover', { p_linha: Number(txt(f, 'linha')) });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  return { ok: 'Linha removida.' };
}

export async function situacaoMesBeneficios(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const acao = txt(f, 'acao');
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('beneficio_competencia_situacao', {
    p_comp: txt(f, 'competencia_id'), p_fechar: acao === 'fechar' ? true : acao === 'reabrir' ? false : null,
    p_dias_uteis: txt(f, 'dias_uteis') ? Number(txt(f, 'dias_uteis')) : null, p_obs: txt(f, 'observacoes'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  return { ok: acao === 'fechar' ? 'Benefícios do mês fechados.' : acao === 'reabrir' ? 'Reaberto para edição.' : 'Mês atualizado.' };
}

export async function aplicarDiasTodos(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const tipo = txt(f, 'tipo');
  const { data, error } = await supabase.rpc('beneficio_aplicar_dias', {
    p_comp: txt(f, 'competencia_id'), p_obra: txt(f, 'obra_id'), p_tipo: tipo && tipo !== 'todos' ? tipo : null, p_dias: n(txt(f, 'dias')),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  return { ok: `${data} linha(s) atualizada(s).` };
}

export async function marcarPagoBeneficio(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const ids = String(f.get('linhas') ?? '').split(',').map(Number).filter(Boolean);
  const pago = txt(f, 'pago') === '1';
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('beneficio_marcar_pago', { p_linhas: ids, p_pago: pago, p_para: txt(f, 'para') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  return { ok: pago ? 'Pix marcado como enviado.' : 'Pagamento desfeito: voltou para pendente.' };
}

export async function salvarPixEmpresa(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('empregadores').update({ pix: txt(f, 'pix'), banco: txt(f, 'banco') }).eq('id', txt(f, 'empregador_id')!);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/beneficios');
  return { ok: 'Chave Pix da empresa salva.' };
}

export async function marcarExportadosPagos(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const ids = (k: string) => String(f.get(k) ?? '').split(',').map(Number).filter(Boolean);
  const supabase = await criarClienteServidor();
  for (const [k, para] of [['linhas_emp', 'empresa'], ['linhas_func', 'funcionario']] as const) {
    if (!ids(k).length) continue;
    const { error } = await supabase.rpc('beneficio_marcar_pago', { p_linhas: ids(k), p_pago: true, p_para: para });
    if (error) return { erro: mensagemErro(error) };
  }
  revalidatePath('/dp/beneficios');
  return { ok: 'Todos os Pix da planilha marcados como enviados.' };
}
