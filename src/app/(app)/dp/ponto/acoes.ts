'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemErro } from '@/lib/acoes';

export type SituacaoLote = 'ok' | 'falta' | 'falta_justificada' | 'atestado' | 'nada';
export type ItemLote = { funcionario_id: string; situacao: SituacaoLote; obs?: string; dias?: number };
export type HorariosLote = {
  entrada: string; saida_almoco: string; volta_almoco: string; largada: string;
  noturno_entrada: string; noturno_saida: string;   // plantão do vigia noturno (a saída é no dia seguinte)
};
export type ResultadoLote = {
  erro?: string; ok?: number; falta?: number; falta_justificada?: number; atestado?: number;
  pulados?: { nome: string; motivo: string }[];
};

/** RH lança o dia da equipe de uma vez: OK (4 marcações), falta, falta justificada ou atestado. */
export async function lancarPontoLote(data: string, itens: ItemLote[], horarios: HorariosLote): Promise<ResultadoLote> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: 'Data inválida.' };
  const lista = itens.filter((i) => i.situacao !== 'nada');
  if (!lista.length) return { erro: 'Ninguém foi marcado — escolha OK, falta, falta justificada ou atestado para alguém.' };
  const supabase = await criarClienteServidor();
  const { data: r, error } = await supabase.rpc('ponto_lancar_lote', { p_data: data, p_itens: lista, p_horarios: horarios });
  if (error) return { erro: mensagemErro(error) };
  for (const p of ['/dp/ponto', '/dp/ponto/lote', '/dp/espelho', '/dp/atestados', '/dp/horas-extras']) revalidatePath(p);
  return r as ResultadoLote;
}
