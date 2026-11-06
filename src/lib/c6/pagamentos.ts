import 'server-only';
import { chaveC6 } from './planilha';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type RecebedorPg = { tipo: 'empresa' | 'funcionario'; id: string; nome: string; pixOriginal: string | null; chave: string | null; tipoChave: string | null;
  valor: number; pessoas: string[]; obra: string };

/** Quem recebe num pagamento (dia 20 / dia 05): "pagar à empresa" vira um Pix por empresa; "pagar ao funcionário", um Pix por pessoa (já com descontos). */
export async function recebedoresPagamento(supabase: SB, pagamentoId: string, obras?: string[] | null) {
  const { data: p } = await supabase.from('pagamentos').select('id, titulo, tipo, status, data_pagamento').eq('id', pagamentoId).maybeSingle();
  if (!p) return { pagamento: null, recebedores: [] as RecebedorPg[] };
  const { data } = await supabase.from('pagamento_itens')
    .select('id, destino, valor, obra_id, funcionario_id, empregador_id, funcionarios(nome, pix), empregadores(nome, pix), obras(codigo, nome)')
    .eq('pagamento_id', pagamentoId).eq('removido', false);
  type I = { id: number; destino: string; valor: number; obra_id: string | null; funcionario_id: string | null; empregador_id: string | null; obras: { codigo: string; nome: string } | null;
    funcionarios: { nome: string; pix: string | null } | null; empregadores: { nome: string; pix: string | null } | null };
  const mapa = new Map<string, RecebedorPg>();
  for (const i of (data ?? []) as I[]) {
    if (obras && !obras.includes(i.obra_id ?? 'sem')) continue;
    const emp = i.destino === 'empresa' || !i.funcionario_id;
    // empresa: um Pix por empresa e por obra (dá para pagar uma obra e segurar outra)
    const k = emp ? `e:${i.empregador_id ?? 'sem'}:${i.obra_id ?? 'sem'}` : `f:${i.funcionario_id}`;
    if (!mapa.has(k)) {
      const pix = emp ? i.empregadores?.pix ?? null : i.funcionarios?.pix ?? null;
      const ch = pix ? chaveC6(pix) : null;
      mapa.set(k, { tipo: emp ? 'empresa' : 'funcionario', id: (emp ? i.empregador_id : i.funcionario_id) ?? 'sem',
        nome: emp ? i.empregadores?.nome ?? 'Sem empresa' : i.funcionarios?.nome ?? '', pixOriginal: pix, obra: i.obras?.nome ?? 'Escritório / sem obra',
        chave: ch && ch.tipo !== 'invalida' ? ch.chave : null, tipoChave: ch?.tipo ?? null, valor: 0, pessoas: [] });
    }
    const r = mapa.get(k)!;
    r.valor = Math.round((r.valor + Number(i.valor)) * 100) / 100;
    if (i.funcionarios?.nome && !r.pessoas.includes(i.funcionarios.nome)) r.pessoas.push(i.funcionarios.nome);
  }
  const recebedores = [...mapa.values()].filter((r) => r.valor > 0).sort((a, b) => a.obra.localeCompare(b.obra) || a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
  return { pagamento: p as { id: string; titulo: string; tipo: string; status: string; data_pagamento: string }, recebedores };
}
