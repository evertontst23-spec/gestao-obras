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
    qtd_dia: n(txt(f, 'qtd_dia')), valor_unitario: n(txt(f, 'valor_unitario')), observacao: txt(f, 'observacao'),
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
