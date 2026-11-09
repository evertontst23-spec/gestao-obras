import {
  AlarmClock, ArrowDownUp, ArrowLeftRight, Banknote, Boxes, Building2, Bus, CalendarDays, CalendarClock, Check, ClipboardCheck,
  ClipboardList, Download, FileSpreadsheet, FileText, Flag, FolderOpen, Gauge, Hammer, HardHat, HeartPulse, Hourglass, Inbox,
  LayoutDashboard, ListChecks, Lock, Mail, MessageSquare, NotebookPen, Package, PencilLine, Printer, Receipt, RefreshCw, Repeat,
  Scale, Settings, ShieldCheck, ShoppingCart, SquareCheckBig, Truck, UserCog, Users, UserRoundPlus, Utensils, Wallet, Warehouse,
  type LucideIcon,
} from 'lucide-react';

/** Conjunto único de ícones do sistema (traço fino, mesmo tamanho e cor em qualquer aparelho). */
const ICONES = {
  painel: LayoutDashboard, tarefas: ListChecks, obras: Building2, plano: ClipboardList, diario: NotebookPen, qualidade: Flag,
  caixa: Wallet, contas: ArrowLeftRight, notas: Receipt, centroCusto: Scale, medicoes: Gauge,
  sst: ShieldCheck, epi: HardHat, dds: MessageSquare, os: FileText,
  ponto: AlarmClock, pagamentos: Banknote, beneficios: Utensils, folha: FileSpreadsheet, espelho: CalendarDays, correcoes: PencilLine,
  horasExtras: CalendarClock, atestados: HeartPulse, admissoes: UserRoundPlus, parametros: Settings,
  pedidos: ClipboardCheck, filas: Inbox, cotacoes: Repeat, ordens: ShoppingCart, locacoes: RefreshCw,
  almox: Warehouse, estoque: Boxes, retiradas: ArrowDownUp, ferramentas: Hammer, inventario: SquareCheckBig,
  funcionarios: Users, espera: Hourglass, dossies: FolderOpen, empresas: Building2, funcoes: Banknote, insumos: Package,
  fornecedores: Truck, usuarios: UserCog,
  alimentacao: Utensils, passagem: Bus, imprimir: Printer, baixar: Download, cadeado: Lock, ok: Check, email: Mail,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, className = 'h-4 w-4' }: { nome: NomeIcone | string; className?: string }) {
  const C = ICONES[nome as NomeIcone] ?? Package;
  return <C aria-hidden className={`shrink-0 ${className}`} strokeWidth={1.75} />;
}

/** Etiqueta padrão de benefício — mesma cor e ícone em todas as telas. */
export const COR_BENEFICIO = {
  alimentacao: { rotulo: 'Alimentação', cor: 'bg-amber-50 text-amber-800 ring-amber-200', texto: 'text-amber-800' },
  passagem: { rotulo: 'Passagem', cor: 'bg-sky-50 text-sky-800 ring-sky-200', texto: 'text-sky-800' },
} as const;

export function TagBeneficio({ tipo, curto = false }: { tipo: string; curto?: boolean }) {
  const t = tipo === 'passagem' ? 'passagem' : 'alimentacao';
  const c = COR_BENEFICIO[t];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${c.cor}`}>
      <Icone nome={t} className="h-3.5 w-3.5" />{!curto && c.rotulo}
    </span>
  );
}
