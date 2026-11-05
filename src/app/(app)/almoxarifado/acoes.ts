'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, paraNumero, txt } from '@/lib/acoes';

const rev = () => { revalidatePath('/almoxarifado', 'layout'); revalidatePath('/suprimentos/estoque'); };

export async function registrarRetirada(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const devolucao = txt(f, 'tipo') === 'devolucao';
  const { error } = devolucao
    ? await supabase.rpc('almox_devolucao', { p_obra: txt(f, 'obra_id'), p_insumo: txt(f, 'insumo_id'), p_quantidade: numero(f, 'quantidade'),
        p_funcionario: txt(f, 'funcionario_id'), p_observacao: txt(f, 'observacao') })
    : await supabase.rpc('almox_retirada', { p_obra: txt(f, 'obra_id'), p_insumo: txt(f, 'insumo_id'), p_quantidade: numero(f, 'quantidade'),
        p_funcionario: txt(f, 'funcionario_id'), p_destino: txt(f, 'destino'), p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: devolucao ? 'Devolução registrada: voltou ao estoque.' : 'Retirada registrada: saiu do estoque.' };
}

export async function emprestarFerramenta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cautela_emprestar', { p_obra: txt(f, 'obra_id'), p_funcionario: txt(f, 'funcionario_id'),
    p_insumo: txt(f, 'insumo_id'), p_quantidade: numero(f, 'quantidade'), p_previsao: txt(f, 'previsao'), p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Ferramenta emprestada e baixada do estoque.' };
}

export async function devolverFerramenta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cautela_devolver', { p_cautela: Number(txt(f, 'cautela')), p_boa: numero(f, 'boa'),
    p_situacao_resto: txt(f, 'resto') ?? 'danificada', p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Devolução registrada.' };
}

export async function salvarInventario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const ins = f.getAll('insumo_id').map(String), cont = f.getAll('contado').map(String);
  const itens = ins.map((id, k) => ({ insumo_id: id, contado: (cont[k] ?? '').trim() === '' ? null : paraNumero(cont[k]) })).filter((x) => x.contado !== null);
  if (!itens.length) return { erro: 'Informe a quantidade contada de pelo menos um item.' };
  const supabase = await criarClienteServidor();
  const { data: n, error } = await supabase.rpc('almox_inventario', { p_obra: txt(f, 'obra_id'), p_itens: itens, p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: n ? `Inventário salvo: ${n} item(ns) ajustado(s) para o contado.` : 'Inventário conferido: tudo bate com o sistema.' };
}
