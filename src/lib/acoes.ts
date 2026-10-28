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
  if (m.includes('espera_celular_unico')) return 'Este celular já está no banco de espera.';
  if (m.includes('invalid input syntax')) return 'Algum campo foi preenchido em formato inválido.';
  return m;
}

export function txt(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
/** Converte texto digitado no padrão brasileiro ("1.621,00", "1621,5", "R$ 2.500") ou com ponto decimal ("1621.50"). */
export function paraNumero(v: string, milharSemVirgula = false): number | null {
  let s = v.replace(/R\$|\s/g, '');
  if (s.includes(',')) {
    // "1.621,00" → vírgula é o decimal; "1,621.00" (padrão americano) → ponto é o decimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (milharSemVirgula && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');            // "1.621" em campo de dinheiro = mil seiscentos e vinte e um
  }
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function numero(f: FormData, k: string) {
  const v = txt(f, k);
  return v === null ? null : paraNumero(v);
}
/** Valor em reais: aceita "1.621", "1.621,00", "1621,00", "R$ 1.621,00" */
export function dinheiro(f: FormData, k: string) {
  const v = txt(f, k);
  return v === null ? null : paraNumero(v, true);
}
/** Campos numéricos preenchidos em formato que não deu para entender */
export function numerosInvalidos(f: FormData, ks: string[]) {
  return ks.filter((k) => txt(f, k) !== null && paraNumero(txt(f, k)!, true) === null);
}
