// Rótulos, cores e regras de interface do domínio (espelham os enums do banco)

export type Papel = 'admin' | 'engenheiro' | 'encarregado' | 'compras' | 'almoxarifado' | 'seguranca' | 'rh' | 'financeiro';
export type StatusTarefa =
  | 'pendente' | 'aguardando_confirmacao' | 'programado' | 'em_andamento' | 'aguardando_material'
  | 'paralisado' | 'concluido_encarregado' | 'aguardando_validacao' | 'aprovado';
export type StatusMaterial =
  | 'solicitado' | 'aguardando_aprovacao' | 'aprovado' | 'disponivel_estoque' | 'em_cotacao'
  | 'compra_autorizada' | 'comprado' | 'em_transporte' | 'parcialmente_entregue' | 'entregue' | 'cancelado';
export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export type SituacaoPrazo = 'no_prazo' | 'atencao' | 'atrasado' | 'concluido';

export interface Perfil { id: string; nome: string; email: string | null; telefone: string | null; papel: Papel; ativo: boolean }

export const PAPEIS: Record<Papel, string> = {
  admin: 'Diretoria / Administrador',
  engenheiro: 'Engenheiro',
  encarregado: 'Encarregado',
  compras: 'Compras / Suprimentos',
  almoxarifado: 'Almoxarifado',
  seguranca: 'Segurança do Trabalho',
  rh: 'RH / Departamento Pessoal',
  financeiro: 'Financeiro',
};

export const STATUS_TAREFA: Record<StatusTarefa, { rotulo: string; cor: string; ordem: number }> = {
  pendente:               { rotulo: 'Pendente',              cor: 'bg-concreto-100 text-concreto-700', ordem: 1 },
  aguardando_confirmacao: { rotulo: 'Aguardando confirmação', cor: 'bg-sinal-100 text-sinal-700',      ordem: 2 },
  programado:             { rotulo: 'Programado',            cor: 'bg-sky-100 text-sky-800',           ordem: 3 },
  em_andamento:           { rotulo: 'Em andamento',          cor: 'bg-blue-100 text-blue-800',         ordem: 4 },
  aguardando_material:    { rotulo: 'Aguardando material',   cor: 'bg-atencao-50 text-atencao-700',    ordem: 5 },
  paralisado:             { rotulo: 'Paralisado',            cor: 'bg-atraso-50 text-atraso-700',      ordem: 6 },
  concluido_encarregado:  { rotulo: 'Concluído (encarregado)', cor: 'bg-violet-100 text-violet-800',   ordem: 7 },
  aguardando_validacao:   { rotulo: 'Aguardando validação',  cor: 'bg-violet-100 text-violet-800',     ordem: 8 },
  aprovado:               { rotulo: 'Aprovado e finalizado', cor: 'bg-ok-50 text-ok-700',              ordem: 9 },
};

export const STATUS_MATERIAL: Record<StatusMaterial, { rotulo: string; cor: string }> = {
  solicitado:            { rotulo: 'Solicitado',            cor: 'bg-concreto-100 text-concreto-700' },
  aguardando_aprovacao:  { rotulo: 'Aguardando aprovação',  cor: 'bg-sinal-100 text-sinal-700' },
  aprovado:              { rotulo: 'Aprovado',              cor: 'bg-sky-100 text-sky-800' },
  disponivel_estoque:    { rotulo: 'Disponível em estoque', cor: 'bg-teal-100 text-teal-800' },
  em_cotacao:            { rotulo: 'Em cotação',            cor: 'bg-atencao-50 text-atencao-700' },
  compra_autorizada:     { rotulo: 'Compra autorizada',     cor: 'bg-amber-100 text-amber-800' },
  comprado:              { rotulo: 'Comprado',              cor: 'bg-blue-100 text-blue-800' },
  em_transporte:         { rotulo: 'Em transporte',         cor: 'bg-indigo-100 text-indigo-800' },
  parcialmente_entregue: { rotulo: 'Parcialmente entregue', cor: 'bg-violet-100 text-violet-800' },
  entregue:              { rotulo: 'Entregue',              cor: 'bg-ok-50 text-ok-700' },
  cancelado:             { rotulo: 'Cancelado',             cor: 'bg-concreto-200 text-concreto-600 line-through' },
};

export const STATUS_SOLICITACAO: Record<string, { rotulo: string; cor: string }> = {
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', cor: 'bg-sinal-100 text-sinal-700' },
  aprovada:             { rotulo: 'Aprovada',             cor: 'bg-sky-100 text-sky-800' },
  rejeitada:            { rotulo: 'Rejeitada',            cor: 'bg-atraso-50 text-atraso-700' },
  em_atendimento:       { rotulo: 'Em atendimento',       cor: 'bg-blue-100 text-blue-800' },
  concluida:            { rotulo: 'Concluída',            cor: 'bg-ok-50 text-ok-700' },
  cancelada:            { rotulo: 'Cancelada',            cor: 'bg-concreto-200 text-concreto-600' },
};

export const PRIORIDADES: Record<Prioridade, { rotulo: string; cor: string }> = {
  baixa:   { rotulo: 'Baixa',   cor: 'bg-concreto-100 text-concreto-600' },
  normal:  { rotulo: 'Normal',  cor: 'bg-concreto-100 text-concreto-800' },
  alta:    { rotulo: 'Alta',    cor: 'bg-sinal-100 text-sinal-700' },
  urgente: { rotulo: 'Urgente', cor: 'bg-atraso-500 text-white' },
};

export const SITUACAO_PRAZO: Record<SituacaoPrazo, { rotulo: string; cor: string; barra: string }> = {
  no_prazo:  { rotulo: 'No prazo',        cor: 'bg-ok-50 text-ok-700',          barra: 'bg-ok-500' },
  atencao:   { rotulo: 'Prazo próximo',   cor: 'bg-atencao-50 text-atencao-700', barra: 'bg-atencao-500' },
  atrasado:  { rotulo: 'Atrasado',        cor: 'bg-atraso-50 text-atraso-700',   barra: 'bg-atraso-500' },
  concluido: { rotulo: 'Concluído',       cor: 'bg-concreto-100 text-concreto-700', barra: 'bg-concreto-400' },
};

export const CAUSAS: Record<string, string> = {
  falta_material: 'Falta de material',
  mao_de_obra: 'Mão de obra / equipe',
  clima: 'Chuva / clima',
  equipamento: 'Equipamento',
  projeto: 'Projeto / definição técnica',
  cliente: 'Cliente / fiscalização',
  interferencia: 'Interferência de outro serviço',
  outro: 'Outro',
};

export const SITUACOES_OBRA: Record<string, string> = {
  planejamento: 'Planejamento', em_andamento: 'Em andamento', paralisada: 'Paralisada', concluida: 'Concluída', cancelada: 'Cancelada',
};

export const UNIDADES = ['un', 'm', 'm²', 'm³', 'kg', 't', 'saco', 'L', 'barra', 'peça', 'caixa', 'rolo', 'galão', 'vb'];

/** Status em que o serviço ainda conta para prazo */
export const TAREFA_ABERTA: StatusTarefa[] = ['pendente', 'aguardando_confirmacao', 'programado', 'em_andamento', 'aguardando_material', 'paralisado'];

export const codTarefa = (n: number) => `T-${String(n).padStart(5, '0')}`;
export const codSM = (n: number) => `SM-${String(n).padStart(5, '0')}`;

export const codCot = (n: number) => `COT-${String(n).padStart(5, '0')}`;
export const codOC = (n: number) => `OC-${String(n).padStart(5, '0')}`;

export const STATUS_COTACAO: Record<string, { rotulo: string; cor: string }> = {
  em_cotacao: { rotulo: 'Em cotação', cor: 'bg-atencao-50 text-atencao-700' },
  aguardando_aprovacao: { rotulo: 'Aguardando diretoria', cor: 'bg-sinal-100 text-sinal-700' },
  aprovada: { rotulo: 'Aprovada — OC emitida', cor: 'bg-ok-50 text-ok-700' },
  recusada: { rotulo: 'Recusada', cor: 'bg-atraso-50 text-atraso-700' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-concreto-200 text-concreto-600' },
};
export const STATUS_OC: Record<string, { rotulo: string; cor: string }> = {
  emitida: { rotulo: 'Emitida — aguardando pagamento', cor: 'bg-sky-100 text-sky-800' },
  pronta_coleta: { rotulo: 'Paga/faturada — pronta p/ coleta', cor: 'bg-sinal-100 text-sinal-700' },
  recebida_parcial: { rotulo: 'Recebida parcialmente', cor: 'bg-violet-100 text-violet-800' },
  recebida: { rotulo: 'Recebida na obra', cor: 'bg-ok-50 text-ok-700' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-concreto-200 text-concreto-600 line-through' },
};
export const CATEGORIAS_INSUMO = ['Material', 'EPI', 'Ferramenta', 'Equipamento', 'Elétrica', 'Hidráulica', 'Acabamento', 'Serviço', 'Escritório', 'Outro'];
export const TIPOS_DOC_FUNC = ['ASO', 'NR-35 (altura)', 'NR-18', 'NR-10', 'NR-12', 'NR-06 (EPI)', 'Contrato de trabalho', 'CTPS', 'RG / CPF', 'Comprovante de residência', 'Certificado', 'Outro'];
export const reais = (n?: number | string | null) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------- Financeiro
export const CATEGORIAS_RECEITA: Record<string, string> = { medicao: 'Medição (BM)', retencao_tecnica: 'Retenção técnica', outras_receitas: 'Outras receitas' };
export const CATEGORIAS_DESPESA: Record<string, string> = {
  material: 'Material', mao_de_obra: 'Mão de obra (salários)', encargos: 'Encargos (INSS/FGTS)', beneficios: 'Benefícios (VA/VT)',
  equipamentos: 'Equipamentos', servicos_terceiros: 'Serviços de terceiros', impostos: 'Impostos', administrativo: 'Administrativo', outras_despesas: 'Outras despesas',
};
export const CATEGORIAS_FIN: Record<string, string> = { ...CATEGORIAS_RECEITA, ...CATEGORIAS_DESPESA };
export const ORIGEM_LANC: Record<string, string> = { manual: 'Manual', oc: 'Ordem de compra', folha: 'Folha', bm: 'Medição' };
export const STATUS_BM: Record<string, { rotulo: string; cor: string }> = {
  aberto: { rotulo: 'Aguardando aprovação', cor: 'bg-atencao-100 text-atencao-800' },
  aprovado: { rotulo: 'Aprovado', cor: 'bg-ok-50 text-ok-700' },
  cancelado: { rotulo: 'Cancelado', cor: 'bg-concreto-100 text-concreto-600' },
};
export const codBM = (n: number) => `BM-${String(n).padStart(2, '0')}`;
export const codLanc = (n: number) => `L-${String(n).padStart(5, '0')}`;
/** Situação de um lançamento considerando o vencimento */
export function situacaoLanc(l: { status: string; vencimento: string; tipo: string }, hoje: string) {
  if (l.status === 'liquidado') return { rotulo: l.tipo === 'receita' ? 'Recebido' : 'Pago', cor: 'bg-ok-50 text-ok-700' };
  if (l.status === 'cancelado') return { rotulo: 'Cancelado', cor: 'bg-concreto-100 text-concreto-600' };
  if (l.vencimento < hoje) return { rotulo: 'Vencido', cor: 'bg-atraso-50 text-atraso-700' };
  if (l.vencimento === hoje) return { rotulo: 'Vence hoje', cor: 'bg-atencao-100 text-atencao-800' };
  return { rotulo: 'Em aberto', cor: 'bg-sky-100 text-sky-800' };
}
