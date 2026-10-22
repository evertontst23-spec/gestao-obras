'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';
import type { ItemLido, Mapeamento } from '@/lib/planilha';

export async function importarPlanilha(dados: {
  obraId: string; nome: string; caminho: string | null; aba: string; mapa: Mapeamento; itens: ItemLido[]; criarEtapas: boolean;
}): Promise<EstadoAcao> {
  if (!dados.itens?.length) return { erro: 'Nenhum item para importar.' };
  if (dados.itens.length > 5000) return { erro: 'Planilha com mais de 5.000 linhas: divida por etapa ou fale com o suporte.' };
  const supabase = await criarClienteServidor();
  const itens = dados.itens.map((i) => ({
    codigo: i.codigo, codigo_referencia: i.codigo_referencia, fonte: i.fonte, descricao: i.descricao.slice(0, 1000),
    unidade: i.unidade, quantidade: i.quantidade, preco_unitario: i.preco_unitario, valor_total: i.valor_total,
    tipo: i.tipo, nivel: i.nivel, pai: i.pai,
  }));
  const { data, error } = await supabase.rpc('planilha_importar', {
    p_obra: dados.obraId, p_nome: dados.nome, p_caminho: dados.caminho, p_aba: dados.aba,
    p_mapeamento: { linha_cabecalho: dados.mapa.linhaCabecalho + 1, colunas: dados.mapa.colunas }, p_itens: itens, p_criar_etapas: dados.criarEtapas,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/obras/${dados.obraId}`, 'layout');
  return { ok: 'Planilha importada.', id: data as string };
}

export async function lancarExecucao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const obra = txt(f, 'obra_id')!;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('medicao_lancar', {
    p_item: txt(f, 'item'), p_quantidade: numero(f, 'quantidade'), p_data: txt(f, 'data'),
    p_descricao: txt(f, 'descricao'), p_local: txt(f, 'local'), p_tarefa: txt(f, 'tarefa'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/obras/${obra}`, 'layout');
  return { ok: 'Execução lançada. Agora envie as fotos do que foi feito.', id: data as string };
}

export async function validarLancamento(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const obra = txt(f, 'obra_id')!;
  const aprovar = f.get('decisao') === 'aprovar';
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('medicao_validar', { p_medicao: txt(f, 'medicao'), p_aprovar: aprovar, p_parecer: txt(f, 'parecer') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/obras/${obra}`, 'layout');
  return { ok: aprovar ? 'Validado — avanço atualizado.' : 'Lançamento rejeitado.' };
}
