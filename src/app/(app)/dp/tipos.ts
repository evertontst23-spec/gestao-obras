export type LinhaFolha = {
  funcionario_id: string; matricula: string; nome: string; funcao: string | null; obra_id: string | null; obra_codigo: string | null;
  empregador?: string | null; vinculo?: string | null; fechamento_externo?: boolean;
  salario_base: number; insalubridade: number; periculosidade: number; valor_hora: number;
  he_util_h: number; he_util_valor: number; he_100_h: number; he_100_valor: number; dsr_he: number;
  faltas: number; desconto_faltas: number; atraso_h: number; desconto_atrasos: number;
  dias_trabalhados: number; vale_alimentacao: number; vale_transporte: number; desconto_vt: number;
  bruto: number; inss: number; liquido_estimado: number; incompletos: number;
};
export const soma = (l: LinhaFolha[], k: keyof LinhaFolha) => l.reduce((s, x) => s + Number(x[k] ?? 0), 0);
export const horas = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
