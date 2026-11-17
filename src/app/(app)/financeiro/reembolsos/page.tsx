import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { FormReembolso } from '@/components/FormReembolso';
import { BaixarCSV } from '@/components/BaixarCSV';
import { FormAcao, Botao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { cancelarLancamento, darBaixaReembolso } from '../acoes';

export const metadata = { title: 'Reembolsos' };
export const dynamic = 'force-dynamic';
type F = { mes?: string; obra?: string; cancelados?: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function Reembolsos({ searchParams }: { searchParams: Promise<F> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'financeiro');
  const hoje = hojeISO();
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const [a, m] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);

  let q = supabase.from('lancamentos')
    .select('id, competencia, vencimento, favorecido, descricao, valor, status, liquidado_em, forma_pagamento, caminho, comprovante_caminho, categoria, obras(codigo, nome)')
    .eq('origem', 'reembolso').gte('competencia', `${mes}-01`).lte('competencia', fim)
    .order('competencia', { ascending: false }).order('criado_em', { ascending: false });
  if (sp.obra) q = q.eq('obra_id', sp.obra);
  if (!sp.cancelados) q = q.neq('status', 'cancelado');

  const [{ data: lista }, { data: obras }, { data: pessoas }] = await Promise.all([
    q,
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('funcionarios').select('nome').eq('ativo', true).order('nome'),
  ]);
  const ls = (lista ?? []) as any[];
  const vivos = ls.filter((r) => r.status !== 'cancelado');
  const total = vivos.reduce((s, r) => s + Number(r.valor), 0);
  const aPagar = vivos.filter((r) => r.status === 'aberto').reduce((s, r) => s + Number(r.valor), 0);
  const pago = vivos.filter((r) => r.status === 'liquidado').reduce((s, r) => s + Number(r.valor), 0);
  const nomes = [...new Set((pessoas ?? []).map((p: any) => p.nome))].map((n) => ({ nome: n }));

  return (
    <>
      <Cabecalho titulo="Reembolsos"
        sub="Quando alguém paga do próprio bolso (gasolina, material, almoço da equipe…) e a empresa precisa devolver. Cada reembolso vira uma conta a pagar no financeiro, no nome de quem vai receber, com o comprovante anexado."
        acoes={<BaixarCSV nome={`reembolsos-${mes}`} cabecalho={['Data do gasto', 'Quem recebe', 'Descrição', 'Obra', 'Valor', 'Situação', 'Pago em', 'Forma']}
          linhas={ls.map((r) => [data(r.competencia), r.favorecido ?? '', r.descricao, r.obras?.codigo ?? 'Administração', Number(r.valor), r.status, r.liquidado_em ? data(r.liquidado_em) : '', r.forma_pagamento ?? ''])} />} />
      <AbasFinanceiro atual="reemb" />

      <form className="mb-4 flex flex-wrap gap-2">
        <input type="month" name="mes" defaultValue={mes} className="entrada w-auto" />
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="cancelados" value="1" defaultChecked={!!sp.cancelados} /> mostrar cancelados</label>
        <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Indicador rotulo="Total do mês" valor={reais(total)} detalhe={`${vivos.length} reembolso(s)`} />
        <Indicador rotulo="A pagar" valor={reais(aPagar)} />
        <Indicador rotulo="Já reembolsado" valor={reais(pago)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {!ls.length ? <Vazio>Nenhum reembolso neste mês.</Vazio> : (
            <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-superficie"><table className="tabela">
              <thead><tr><th>Data</th><th>Quem recebe / o quê</th><th>Obra</th><th className="text-right">Valor</th><th /></tr></thead>
              <tbody>{ls.map((r) => (
                <tr key={r.id} className={r.status === 'cancelado' ? 'opacity-50' : ''}>
                  <td className="whitespace-nowrap font-mono text-sm">{data(r.competencia)}</td>
                  <td><b>{r.favorecido ?? '—'}</b> <span className="text-concreto-600">— {r.descricao}</span>
                    <div className="text-xs text-concreto-500">
                      {r.status === 'liquidado' ? `pago ${r.liquidado_em ? data(r.liquidado_em) : ''}${r.forma_pagamento ? ` (${r.forma_pagamento})` : ''}`
                        : r.status === 'cancelado' ? <>cancelado</> : `a pagar — vence ${data(r.vencimento)}`}
                      {(r.caminho || r.comprovante_caminho) && <> • <Link className="link" href={`/financeiro/lancamentos/${r.id}`}>📎 comprovante</Link></>}
                    </div></td>
                  <td className="whitespace-nowrap text-xs">{r.obras?.codigo ?? 'Administração'}</td>
                  <td className="whitespace-nowrap text-right font-mono font-semibold">{reais(r.valor)}</td>
                  <td className="whitespace-nowrap text-xs">
                    <Link className="link mr-2" href={`/financeiro/lancamentos/${r.id}`}>abrir</Link>
                    {r.status === 'aberto' && (
                      <details className="inline-block"><summary className="cursor-pointer font-semibold text-ok-700">dar baixa</summary>
                        <FormAcao acao={darBaixaReembolso} className="mt-1 flex items-center gap-1">
                          <input type="hidden" name="id" value={r.id} /><input type="hidden" name="data" value={hoje} />
                          <select name="forma" className="entrada w-auto py-1 text-xs"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>TED</option></select>
                          <Botao variante="sucesso">pago</Botao></FormAcao></details>)}
                    {r.status !== 'cancelado' && (
                      <details className="ml-2 inline-block"><summary className="cursor-pointer text-atraso-700">cancelar</summary>
                        <FormAcao acao={cancelarLancamento} className="mt-1 flex gap-1"><input type="hidden" name="id" value={r.id} />
                          <input name="motivo" required minLength={3} placeholder="motivo" className="entrada w-36 py-1 text-xs" /><Botao variante="perigo">ok</Botao></FormAcao></details>)}
                  </td>
                </tr>))}
                <tr className="bg-concreto-50 font-semibold"><td colSpan={3}>Total</td><td className="text-right font-mono">{reais(total)}</td><td /></tr>
              </tbody>
            </table></div>)}
        </div>

        <Cartao titulo="Registrar reembolso">
          <FormReembolso obras={obras ?? []} pessoas={nomes} hoje={hoje} />
        </Cartao>
      </div>
    </>
  );
}
