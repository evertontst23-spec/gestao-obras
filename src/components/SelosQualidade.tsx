import { Selo } from './ui';

export const STATUS_NC: Record<string, { r: string; c: string }> = {
  aberta: { r: 'Aberta', c: 'bg-atraso-50 text-atraso-700' },
  em_correcao: { r: 'Em correção', c: 'bg-atencao-50 text-atencao-700' },
  corrigida: { r: 'Corrigida — verificar', c: 'bg-violet-100 text-violet-800' },
  verificada: { r: 'Verificada / encerrada', c: 'bg-ok-50 text-ok-700' },
  cancelada: { r: 'Cancelada', c: 'bg-concreto-200 text-concreto-600' },
};
export const GRAVIDADE: Record<string, { r: string; c: string }> = {
  leve: { r: 'Leve', c: 'bg-concreto-100 text-concreto-700' },
  moderada: { r: 'Moderada', c: 'bg-atencao-50 text-atencao-700' },
  grave: { r: 'Grave', c: 'bg-atraso-500 text-white' },
};
export const SeloNC = ({ s }: { s: string }) => <Selo cor={STATUS_NC[s]?.c}>{STATUS_NC[s]?.r ?? s}</Selo>;
export const SeloGravidade = ({ g }: { g: string }) => <Selo cor={GRAVIDADE[g]?.c}>{GRAVIDADE[g]?.r ?? g}</Selo>;
