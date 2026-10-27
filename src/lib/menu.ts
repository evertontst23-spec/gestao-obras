import type { Papel } from './dominio';

export type ItemMenu = { href: string; rotulo: string; icone: string; papeis: Papel[]; curto?: string };
export type SecaoMenu = { titulo: string; itens: ItemMenu[] };

const TODOS: Papel[] = ['admin', 'engenheiro', 'encarregado', 'compras', 'almoxarifado', 'seguranca', 'rh', 'financeiro'];
const GESTAO: Papel[] = ['admin', 'engenheiro'];

/** Menu único; cada perfil vê só o que usa. Novos módulos entram aqui. */
export const MENU: SecaoMenu[] = [
  { titulo: 'Geral', itens: [
    { href: '/painel', rotulo: 'Painel', icone: '▦', papeis: GESTAO },
    { href: '/campo', rotulo: 'Minhas tarefas', curto: 'Tarefas', icone: '✓', papeis: ['encarregado'] },
    { href: '/obras', rotulo: 'Obras', icone: '⌂', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado', 'seguranca', 'rh', 'financeiro'] },
  ] },
  { titulo: 'Obra', itens: [
    { href: '/tarefas', rotulo: 'Plano de ação', icone: '☰', papeis: GESTAO },
    { href: '/diario', rotulo: 'Diário de obra', curto: 'Diário', icone: '✎', papeis: ['admin', 'engenheiro', 'encarregado'] },
    { href: '/qualidade', rotulo: 'Qualidade', icone: '⚑', papeis: ['admin', 'engenheiro', 'encarregado'] },
  ] },
  { titulo: 'Financeiro', itens: [
    { href: '/financeiro', rotulo: 'Fluxo de caixa', curto: 'Caixa', icone: '◫', papeis: ['admin', 'financeiro'] },
    { href: '/financeiro/lancamentos', rotulo: 'Contas a pagar e receber', curto: 'Contas', icone: '⇆', papeis: ['admin', 'financeiro'] },
    { href: '/financeiro/centro-custo', rotulo: 'Centro de custo por obra', curto: 'Centro de custo', icone: '◧', papeis: ['admin', 'financeiro'] },
    { href: '/financeiro/medicoes', rotulo: 'Medições (BM)', curto: 'BM', icone: '▧', papeis: ['admin', 'financeiro', 'engenheiro'] },
  ] },
  { titulo: 'SST', itens: [
    { href: '/sst', rotulo: 'Painel SST', curto: 'SST', icone: '✚', papeis: ['admin', 'seguranca', 'engenheiro', 'rh'] },
    { href: '/sst/epi', rotulo: 'EPI', icone: '⛑', papeis: ['admin', 'seguranca', 'almoxarifado', 'encarregado', 'engenheiro', 'rh'] },
    { href: '/sst/dds', rotulo: 'DDS', icone: '☊', papeis: ['admin', 'seguranca', 'engenheiro', 'encarregado', 'rh'] },
    { href: '/sst/os', rotulo: 'Ordens de Serviço', icone: '§', papeis: ['admin', 'seguranca', 'rh', 'engenheiro', 'encarregado'] },
  ] },
  { titulo: 'RH / Departamento Pessoal', itens: [
    { href: '/dp/ponto', rotulo: 'Registro de ponto', curto: 'Ponto', icone: '◷', papeis: ['admin', 'rh', 'seguranca', 'engenheiro', 'encarregado', 'almoxarifado'] },
    { href: '/dp/pagamentos', rotulo: 'Pagamentos (dia 20 / dia 05)', curto: 'Pagamentos', icone: '$', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/folha', rotulo: 'Folha', icone: '₢', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/espelho', rotulo: 'Espelho de ponto', curto: 'Espelho', icone: '▥', papeis: ['admin', 'rh', 'financeiro', 'engenheiro'] },
    { href: '/dp/correcoes', rotulo: 'Pedidos de correção', curto: 'Correções', icone: '✎', papeis: ['admin', 'rh'] },
    { href: '/dp/horas-extras', rotulo: 'Horas extras e faltas', curto: 'HE', icone: '⏱', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/atestados', rotulo: 'Atestados', icone: '✉', papeis: ['admin', 'rh'] },
    { href: '/dp/movimentacao', rotulo: 'Admissões e desligamentos', curto: 'Admissões', icone: '⇅', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/parametros', rotulo: 'Parâmetros do DP', curto: 'Parâmetros', icone: '⚙', papeis: ['admin', 'rh', 'financeiro'] },
  ] },
  { titulo: 'Suprimentos', itens: [
    { href: '/materiais', rotulo: 'Pedidos de material', curto: 'Pedidos', icone: '▤', papeis: TODOS.filter((p) => p !== 'rh' && p !== 'seguranca') },
    { href: '/suprimentos', rotulo: 'Filas de atendimento', curto: 'Filas', icone: '⇄', papeis: ['admin', 'compras', 'almoxarifado', 'financeiro'] },
    { href: '/suprimentos/cotacoes', rotulo: 'Cotações', icone: '≋', papeis: ['admin', 'compras', 'financeiro'] },
    { href: '/suprimentos/ordens', rotulo: 'Ordens de compra', curto: 'OCs', icone: '⎙', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado', 'financeiro'] },
    { href: '/suprimentos/estoque', rotulo: 'Estoque', icone: '▣', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado'] },
    { href: '/suprimentos/locacoes', rotulo: 'Controle de locações', curto: 'Locações', icone: '⟳', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado', 'financeiro'] },
  ] },
  { titulo: 'Cadastros', itens: [
    { href: '/cadastros/funcionarios', rotulo: 'Funcionários', curto: 'Equipe', icone: '◎', papeis: ['admin', 'engenheiro', 'rh', 'seguranca', 'financeiro'] },
    { href: '/cadastros/dossies', rotulo: 'Dossiês (pastas)', curto: 'Dossiês', icone: '▣', papeis: ['admin', 'engenheiro', 'rh', 'seguranca', 'financeiro'] },
    { href: '/cadastros/empregadores', rotulo: 'Empresas contratantes', curto: 'Empresas', icone: '▥', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/cadastros/funcoes', rotulo: 'Funções e salários', curto: 'Funções', icone: '$', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/cadastros/insumos', rotulo: 'Insumos', icone: '◇', papeis: ['admin', 'compras', 'almoxarifado', 'engenheiro'] },
    { href: '/cadastros/fornecedores', rotulo: 'Fornecedores', icone: '⌂', papeis: ['admin', 'compras', 'financeiro'] },
    { href: '/usuarios', rotulo: 'Usuários', icone: '◉', papeis: ['admin'] },
  ] },
];

export function menuDo(papel: Papel): SecaoMenu[] {
  return MENU.map((s) => ({ ...s, itens: s.itens.filter((i) => i.papeis.includes(papel)) })).filter((s) => s.itens.length);
}

/** Atalhos da barra inferior do celular (até 4 + "Menu") */
export const ATALHOS: Record<Papel, string[]> = {
  admin: ['/painel', '/obras', '/financeiro', '/suprimentos'],
  engenheiro: ['/painel', '/obras', '/tarefas', '/qualidade'],
  encarregado: ['/campo', '/diario', '/dp/ponto', '/materiais'],
  compras: ['/suprimentos', '/suprimentos/cotacoes', '/suprimentos/ordens', '/materiais'],
  almoxarifado: ['/suprimentos', '/suprimentos/ordens', '/suprimentos/estoque', '/materiais'],
  seguranca: ['/sst', '/dp/ponto', '/sst/epi', '/sst/dds'],
  rh: ['/dp/pagamentos', '/dp/ponto', '/dp/espelho', '/cadastros/funcionarios'],
  financeiro: ['/financeiro', '/financeiro/lancamentos', '/financeiro/medicoes', '/dp/folha'],
};
