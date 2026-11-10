export const TIPO_PAG: Record<string, string> = { adiantamento: 'Adiantamento (dia 20)', saldo: 'Saldo do mês (dia 05)', rescisao: 'Rescisão', outro: 'Outro' };
export const STATUS_PAG: Record<string, { rotulo: string; cor: string; tom: 'aviso' | 'marca' | 'ok' | 'neutro' }> = {
  rascunho: { rotulo: 'Em conferência', cor: 'bg-atencao-100 text-atencao-800', tom: 'aviso' },
  fechado: { rotulo: 'Fechado — a pagar', cor: 'bg-sinal-50 text-sinal-700', tom: 'marca' },
  pago: { rotulo: 'Pago', cor: 'bg-ok-50 text-ok-700', tom: 'ok' },
  cancelado: { rotulo: 'Cancelado', cor: 'bg-concreto-100 text-concreto-600', tom: 'neutro' },
};
export const CAT_PAG: Record<string, string> = {
  adiantamento: 'Adiantamento', saldo: 'Saldo', quinzena: 'Quinzena (valor da empresa)', rescisao: 'Saldo de rescisão', salario: 'Salário',
  hora_extra: 'Hora extra', desconto: 'Desconto', taxa: 'Taxa administrativa', passagem: 'Passagens', alimentacao: 'Alimentação', outro: 'Outro',
};
export const BENEFICIO = ['passagem', 'alimentacao'];
