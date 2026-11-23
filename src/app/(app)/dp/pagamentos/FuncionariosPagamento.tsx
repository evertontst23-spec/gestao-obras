import { Cartao, Selo } from '@/components/ui';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { segurarFuncionario, devolverFuncionario } from './acoes';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Linha = { funcionario_id: string | null; valor: number; funcionarios: { nome: string; ativo: boolean } | null; obras: { codigo: string } | null; empregadores: { nome: string } | null };
const n = (v: unknown) => Number(v ?? 0);

/**
 * Lista todos os funcionários do pagamento com o valor a receber e um botão para
 * TIRAR (segurar p/ pagar depois) ou, no pagamento dos segurados, DEVOLVER.
 */
export async function FuncionariosPagamento({ supabase, pagamentoId, separadoDe, status, rh, titulo }:
  { supabase: SB; pagamentoId: string; separadoDe: string | null; status: string; rh: boolean; titulo?: string }) {
  const { data } = await supabase.from('pagamento_itens')
    .select('funcionario_id, valor, funcionarios(nome, ativo), obras(codigo), empregadores(nome)')
    .eq('pagamento_id', pagamentoId).eq('removido', false);
  const linhas = (data ?? []) as unknown as Linha[];

  // uma entrada por funcionário (linhas de empresa/taxa, sem funcionário, ficam de fora desta lista)
  const porFunc = new Map<string, { nome: string; ativo: boolean; onde: string; total: number }>();
  for (const i of linhas) {
    if (!i.funcionario_id) continue;
    const g = porFunc.get(i.funcionario_id) ?? { nome: i.funcionarios?.nome ?? '—', ativo: i.funcionarios?.ativo ?? true, onde: i.obras?.codigo ?? i.empregadores?.nome ?? 'sem obra', total: 0 };
    g.total += n(i.valor);
    porFunc.set(i.funcionario_id, g);
  }
  const gente = [...porFunc.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  if (!gente.length) return null;

  const pode = rh && status === 'rascunho';
  const ehSeg = !!separadoDe;
  const total = gente.reduce((t, [, g]) => t + g.total, 0);

  return (
    <Cartao titulo={titulo ?? `Funcionários deste pagamento — ${gente.length} pessoa(s) · ${reais(total)}`} className="nao-imprimir mb-4">
      {pode && (
        <p className="mb-3 text-sm text-concreto-600">{ehSeg
          ? 'Clique em devolver para mandar o funcionário de volta ao pagamento principal.'
          : 'Quem não vai receber agora: clique em tirar. Ele sai do total e vai para um pagamento à parte (segurados) para você pagar depois.'}</p>)}
      <div className="divide-y divide-concreto-100">
        {gente.map(([fid, g]) => (
          <div key={fid} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <div className="min-w-0">
              <span className="font-semibold">{g.nome}</span>
              {!g.ativo && <Selo cor="bg-atraso-50 text-atraso-700">desligado</Selo>}
              <span className="block text-[11px] text-concreto-500">{g.onde}</span>
            </div>
            <div className="flex items-center gap-3">
              <b className="font-mono">{reais(g.total)}</b>
              {pode && (ehSeg ? (
                <FormAcao acao={devolverFuncionario}><input type="hidden" name="id" value={pagamentoId} /><input type="hidden" name="funcionario_id" value={fid} />
                  <Botao variante="secundario" className="px-3 py-1 text-xs">← devolver</Botao></FormAcao>
              ) : (
                <FormAcao acao={segurarFuncionario}><input type="hidden" name="id" value={pagamentoId} /><input type="hidden" name="funcionario_id" value={fid} />
                  <button className="rounded-md border border-atencao-300 bg-atencao-50 px-3 py-1 text-xs font-semibold text-atencao-800 hover:border-atencao-500">⏸ tirar (segurar)</button></FormAcao>
              ))}
            </div>
          </div>))}
      </div>
    </Cartao>
  );
}
