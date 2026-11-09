import type { NomeIcone } from '@/components/Icone';
import type { Papel } from './dominio';

export type ItemMenu = { href: string; rotulo: string; icone: NomeIcone; papeis: Papel[]; curto?: string };
export type SecaoMenu = { titulo: string; itens: ItemMenu[] };

const TODOS: Papel[] = ['admin', 'engenheiro', 'encarregado', 'compras', 'almoxarifado', 'seguranca', 'rh', 'financeiro'];
const GESTAO: Papel[] = ['admin', 'engenheiro'];

/** Menu único; cada perfil vê só o que usa. Novos módulos entram aqui. */
export const MENU: SecaoMenu[] = [
  { titulo: 'Geral', itens: [
    { href: '/painel', rotulo: 'Painel', icone: 'painel', papeis: GESTAO },
    { href: '/campo', rotulo: 'Minhas tarefas', curto: 'Tarefas', icone: 'tarefas', papeis: ['encarregado'] },
    { href: '/obras', rotulo: 'Obras', icone: 'obras', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado', 'seguranca', 'rh', 'financeiro'] },
  ] },
  { titulo: 'Obra', itens: [
    { href: '/tarefas', rotulo: 'Plano de ação', icone: 'plano', papeis: GESTAO },
    { href: '/diario', rotulo: 'Diário de obra', curto: 'Diário', icone: 'diario', papeis: ['admin', 'engenheiro', 'encarregado'] },
    { href: '/qualidade', rotulo: 'Qualidade', icone: 'qualidade', papeis: ['admin', 'engenheiro', 'encarregado'] },
  ] },
  { titulo: 'Financeiro', itens: [
    { href: '/financeiro', rotulo: 'Fluxo de caixa', curto: 'Caixa', icone: 'caixa', papeis: ['admin', 'financeiro'] },
    { href: '/financeiro/lancamentos', rotulo: 'Contas a pagar e receber', curto: 'Contas', icone: 'contas', papeis: ['admin', 'financeiro'] },
    { href: '/financeiro/notas', rotulo: 'Notas e despesas (almoço, materiais diversos…)', curto: 'Notas', icone: 'notas', papeis: ['admin', 'financeiro', 'compras'] },
    { href: '/financeiro/centro-custo', rotulo: 'Centro de custo por obra', curto: 'Centro de custo', icone: 'centroCusto', papeis: ['admin', 'financeiro'] },
    { href: '/financeiro/medicoes', rotulo: 'Medições (BM)', curto: 'BM', icone: 'medicoes', papeis: ['admin', 'financeiro', 'engenheiro'] },
  ] },
  { titulo: 'SST', itens: [
    { href: '/sst', rotulo: 'Painel SST', curto: 'SST', icone: 'sst', papeis: ['admin', 'seguranca', 'engenheiro', 'rh'] },
    { href: '/sst/epi', rotulo: 'EPI', icone: 'epi', papeis: ['admin', 'seguranca', 'almoxarifado', 'encarregado', 'engenheiro', 'rh'] },
    { href: '/sst/dds', rotulo: 'DDS', icone: 'dds', papeis: ['admin', 'seguranca', 'engenheiro', 'encarregado', 'rh'] },
    { href: '/sst/os', rotulo: 'Ordens de Serviço', icone: 'os', papeis: ['admin', 'seguranca', 'rh', 'engenheiro', 'encarregado'] },
  ] },
  { titulo: 'RH / Departamento Pessoal', itens: [
    { href: '/dp/ponto', rotulo: 'Registro de ponto', curto: 'Ponto', icone: 'ponto', papeis: ['admin', 'rh', 'seguranca', 'engenheiro', 'encarregado', 'almoxarifado'] },
    { href: '/dp/pagamentos', rotulo: 'Pagamentos (dia 20 / dia 05)', curto: 'Pagamentos', icone: 'pagamentos', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/beneficios', rotulo: 'Benefícios (alimentação e passagem)', curto: 'Benefícios', icone: 'beneficios', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/folha', rotulo: 'Folha', icone: 'folha', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/espelho', rotulo: 'Espelho de ponto', curto: 'Espelho', icone: 'espelho', papeis: ['admin', 'rh', 'financeiro', 'engenheiro'] },
    { href: '/dp/correcoes', rotulo: 'Pedidos de correção', curto: 'Correções', icone: 'correcoes', papeis: ['admin', 'rh'] },
    { href: '/dp/horas-extras', rotulo: 'Horas extras e faltas', curto: 'HE', icone: 'horasExtras', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/atestados', rotulo: 'Atestados', icone: 'atestados', papeis: ['admin', 'rh'] },
    { href: '/dp/movimentacao', rotulo: 'Admissões e desligamentos', curto: 'Admissões', icone: 'admissoes', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/dp/parametros', rotulo: 'Parâmetros do DP', curto: 'Parâmetros', icone: 'parametros', papeis: ['admin', 'rh', 'financeiro'] },
  ] },
  { titulo: 'Suprimentos', itens: [
    { href: '/materiais', rotulo: 'Pedidos de material', curto: 'Pedidos', icone: 'pedidos', papeis: TODOS.filter((p) => p !== 'rh' && p !== 'seguranca') },
    { href: '/suprimentos', rotulo: 'Filas de atendimento', curto: 'Filas', icone: 'filas', papeis: ['admin', 'compras', 'almoxarifado', 'financeiro'] },
    { href: '/suprimentos/cotacoes', rotulo: 'Cotações', icone: 'cotacoes', papeis: ['admin', 'compras', 'financeiro'] },
    { href: '/suprimentos/ordens', rotulo: 'Ordens de compra', curto: 'OCs', icone: 'ordens', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado', 'financeiro'] },
    { href: '/suprimentos/locacoes', rotulo: 'Controle de locações', curto: 'Locações', icone: 'locacoes', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado', 'financeiro'] },
  ] },
  { titulo: 'Almoxarifado', itens: [
    { href: '/almoxarifado', rotulo: 'Painel do almoxarifado', curto: 'Almox.', icone: 'almox', papeis: ['admin', 'almoxarifado', 'compras', 'engenheiro'] },
    { href: '/suprimentos/estoque', rotulo: 'Estoque', icone: 'estoque', papeis: ['admin', 'engenheiro', 'compras', 'almoxarifado'] },
    { href: '/almoxarifado/retiradas', rotulo: 'Retiradas e devoluções', curto: 'Retiradas', icone: 'retiradas', papeis: ['admin', 'almoxarifado', 'compras', 'engenheiro'] },
    { href: '/almoxarifado/ferramentas', rotulo: 'Ferramentas emprestadas', curto: 'Ferramentas', icone: 'ferramentas', papeis: ['admin', 'almoxarifado', 'compras', 'engenheiro', 'seguranca', 'rh'] },
    { href: '/almoxarifado/inventario', rotulo: 'Inventário', icone: 'inventario', papeis: ['admin', 'almoxarifado', 'compras', 'engenheiro'] },
  ] },
  { titulo: 'Cadastros', itens: [
    { href: '/cadastros/funcionarios', rotulo: 'Funcionários', curto: 'Equipe', icone: 'funcionarios', papeis: ['admin', 'engenheiro', 'rh', 'seguranca', 'financeiro'] },
    { href: '/cadastros/espera', rotulo: 'Banco de espera', curto: 'Espera', icone: 'espera', papeis: ['admin', 'rh', 'engenheiro', 'seguranca'] },
    { href: '/cadastros/dossies', rotulo: 'Dossiês (pastas)', curto: 'Dossiês', icone: 'dossies', papeis: ['admin', 'engenheiro', 'rh', 'seguranca', 'financeiro'] },
    { href: '/cadastros/empregadores', rotulo: 'Empresas contratantes', curto: 'Empresas', icone: 'empresas', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/cadastros/funcoes', rotulo: 'Funções e salários', curto: 'Funções', icone: 'funcoes', papeis: ['admin', 'rh', 'financeiro'] },
    { href: '/cadastros/insumos', rotulo: 'Insumos', icone: 'insumos', papeis: ['admin', 'compras', 'almoxarifado', 'engenheiro'] },
    { href: '/cadastros/fornecedores', rotulo: 'Fornecedores', icone: 'fornecedores', papeis: ['admin', 'compras', 'financeiro'] },
    { href: '/usuarios', rotulo: 'Usuários', icone: 'usuarios', papeis: ['admin'] },
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
  almoxarifado: ['/almoxarifado', '/suprimentos/ordens', '/almoxarifado/ferramentas', '/materiais'],
  seguranca: ['/sst', '/dp/ponto', '/sst/epi', '/sst/dds'],
  rh: ['/dp/pagamentos', '/dp/ponto', '/dp/espelho', '/cadastros/funcionarios'],
  financeiro: ['/financeiro', '/financeiro/lancamentos', '/financeiro/medicoes', '/dp/folha'],
};
