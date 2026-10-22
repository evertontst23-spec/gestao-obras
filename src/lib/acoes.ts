// Utilitários compartilhados pelas Server Actions
export type EstadoAcao = { erro?: string; ok?: string; id?: string } | null;

/** Traduz erros do Postgres/Supabase em mensagens para o usuário */
export function mensagemErro(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? 'Erro desconhecido';
  if (m.includes('row-level security')) return 'Você não tem permissão para esta operação.';
  if (m.includes('duplicate key') && m.includes('codigo')) return 'Já existe uma obra com este código.';
  if (m.includes('tarefas_prazo_ck') || m.includes('reprog_datas_ck')) return 'A data de conclusão deve ser igual ou posterior à data de início.';
  if (m.includes('obras_datas_ck')) return 'A conclusão prevista deve ser posterior ao início.';
  if (m.includes('lanc_tipo_cat_ck')) return 'A categoria não corresponde ao tipo (receita/despesa).';
  if (m.includes('invalid input syntax')) return 'Algum campo foi preenchido em formato inválido.';
  return m;
}

export function txt(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
export function numero(f: FormData, k: string) {
  const v = txt(f, k);
  if (v === null) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
