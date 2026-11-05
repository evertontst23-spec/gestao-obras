import 'server-only';
import { chaveC6 } from './planilha';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Recebedor = { tipo: 'empresa' | 'funcionario'; id: string; nome: string; pixOriginal: string | null; chave: string | null; tipoChave: string | null;
  valor: number; pessoas: string[]; linhas: number[] };

const nomeMes = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').replace(' de ', '/');

/** Quem recebe os benefícios do mês: empresas que repassam (um Pix por empresa) e equipe própria (um Pix por pessoa). Só o que ainda não foi pago. */
export async function recebedoresBeneficios(supabase: SB, mes: string, incluirPagos = false) {
  const { data: comp } = await supabase.from('beneficio_competencias').select('id, competencia, status').eq('competencia', `${mes}-01`).maybeSingle();
  if (!comp) return { comp: null, recebedores: [] as Recebedor[], rotulo: nomeMes(mes) };
  const { data } = await supabase.from('beneficio_linhas')
    .select('id, funcionario_id, valor_total, pago_em, funcionarios(nome, pix, empregador_id, empregadores(nome, pix, beneficios_via_empresa))')
    .eq('competencia_id', comp.id).gt('valor_total', 0);
  type L = { id: number; funcionario_id: string; valor_total: number; pago_em: string | null;
    funcionarios: { nome: string; pix: string | null; empregador_id: string | null; empregadores: { nome: string; pix: string | null; beneficios_via_empresa: boolean } | null } | null };
  const mapa = new Map<string, Recebedor>();
  for (const l of (data ?? []) as L[]) {
    if (!incluirPagos && l.pago_em) continue;
    const f = l.funcionarios; const e = f?.empregadores;
    const viaEmp = !!e?.beneficios_via_empresa && !!f?.empregador_id;
    const k = viaEmp ? `e:${f!.empregador_id}` : `f:${l.funcionario_id}`;
    if (!mapa.has(k)) {
      const pix = viaEmp ? e!.pix : f?.pix ?? null;
      const ch = pix ? chaveC6(pix) : null;
      mapa.set(k, { tipo: viaEmp ? 'empresa' : 'funcionario', id: viaEmp ? f!.empregador_id! : l.funcionario_id, nome: viaEmp ? e!.nome : f?.nome ?? '',
        pixOriginal: pix, chave: ch && ch.tipo !== 'invalida' ? ch.chave : null, tipoChave: ch?.tipo ?? null, valor: 0, pessoas: [], linhas: [] });
    }
    const r = mapa.get(k)!;
    r.valor = Math.round((r.valor + Number(l.valor_total)) * 100) / 100;
    if (f?.nome && !r.pessoas.includes(f.nome)) r.pessoas.push(f.nome);
    r.linhas.push(l.id);
  }
  const recebedores = [...mapa.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
  return { comp, recebedores, rotulo: nomeMes(mes) };
}
