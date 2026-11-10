import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { Botao, FormAcao } from '@/components/formulario';
import { CATEGORIAS_DESPESA, reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { cancelarTransferenciaCusto, transferirCusto } from './acoes';

export const metadata = { title: 'Transferência de custo entre obras' };
const nomeMes = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;

export default async function Transferencias({ searchParams }: { searchParams: Promise<{ canceladas?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'financeiro');
  let q = supabase.from('v_transferencias_custo').select('*').order('criado_em', { ascending: false }).limit(200);
  if (!sp.canceladas) q = q.eq('status', 'ativa');
  const [{ data: lista }, { data: obras }, { data: mats }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('v_transferencias').select('id, criado_em, descricao, quantidade, unidade, origem_nome, destino_nome, valor_total').order('criado_em', { ascending: false }).limit(20),
  ]);
  const ls = lista ?? [];
  const ativas = ls.filter((t) => t.status === 'ativa');
  const total = ativas.reduce((s, t) => s + Number(t.valor), 0);
  const hoje = hojeISO();

  return (
    <>
      <Cabecalho titulo="Transferência de custo entre obras"
        sub="Passa um valor do custo de uma obra para outra (ex.: equipe de uma obra que trabalhou em outra). Não é conta a pagar: o caixa e o total da empresa não mudam — só muda qual obra arca com o custo no centro de custo." />
      <AbasFinanceiro atual="transf" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Valor transferido (ativas)" valor={reais(total)} detalhe={`${ativas.length} transferência(s)`} tom="sinal" />
        <Indicador rotulo="Material transferido (estoque)" valor={reais((mats ?? []).reduce((s, m) => s + Number(m.valor_total ?? 0), 0))} detalhe="últimas 20, pelo custo médio" href="/suprimentos/estoque#transferencias" />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Cartao titulo="Transferências de valor" acoes={<Link className="link text-sm" href={sp.canceladas ? '/financeiro/transferencias' : '/financeiro/transferencias?canceladas=1'}>{sp.canceladas ? 'esconder canceladas' : 'mostrar canceladas'}</Link>}>
            {!ls.length ? <Vazio>Nenhuma transferência de custo.</Vazio> : (
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Nº</th><th>Competência</th><th>De → Para</th><th>Categoria</th><th className="text-right">Valor</th><th /></tr></thead>
                <tbody>{ls.map((t) => (
                  <tr key={t.id} className={t.status === 'cancelada' ? 'opacity-50' : ''}>
                    <td className="font-mono text-xs">TC-{String(t.numero).padStart(4, '0')}</td>
                    <td className="whitespace-nowrap">{nomeMes(t.competencia)}</td>
                    <td>{t.origem_nome} → <b>{t.destino_nome}</b><span className="block text-xs text-concreto-500">{t.motivo} • {t.criado_por_nome} em {data(t.criado_em)}</span>
                      {t.status === 'cancelada' && <span className="block text-xs"><Selo cor="bg-concreto-100 text-concreto-600">cancelada</Selo> {t.motivo_cancelamento}</span>}</td>
                    <td className="text-xs">{CATEGORIAS_DESPESA[t.categoria]}</td>
                    <td className="whitespace-nowrap text-right font-mono font-bold">{reais(t.valor)}</td>
                    <td className="text-xs">{t.status === 'ativa' && (
                      <details><summary className="cursor-pointer text-atraso-700">cancelar</summary>
                        <FormAcao acao={cancelarTransferenciaCusto} className="mt-1 flex gap-1"><input type="hidden" name="id" value={t.id} />
                          <input name="motivo" required minLength={5} placeholder="motivo" className="entrada w-36 py-1 text-xs" /><Botao variante="perigo">ok</Botao></FormAcao></details>)}</td>
                  </tr>))}</tbody>
              </table></div>)}
          </Cartao>
          {(mats ?? []).length > 0 && (
            <Cartao titulo="Material transferido pelo estoque" acoes={<Link className="link text-sm" href="/suprimentos/estoque#transferencias">abrir →</Link>}>
              <ul className="divide-y divide-concreto-100 text-sm">{(mats ?? []).map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{m.descricao} — {Number(m.quantidade).toLocaleString('pt-BR')} {m.unidade}<span className="block text-xs text-concreto-500">{m.origem_nome} → {m.destino_nome} • {data(m.criado_em)}</span></span>
                  <b className="font-mono">{m.valor_total == null ? 'sem preço' : reais(m.valor_total)}</b></li>))}</ul>
            </Cartao>)}
        </div>
        <Cartao titulo="Nova transferência de custo">
          <FormAcao acao={transferirCusto} limparAoConcluir className="space-y-3">
            <Campo rotulo="Sai do custo de"><select name="origem" className="entrada"><option value="">Administração central (sem obra)</option>
              {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
            <Campo rotulo="Entra no custo de"><select name="destino" className="entrada"><option value="">Administração central (sem obra)</option>
              {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Valor (R$)"><input name="valor" required inputMode="decimal" placeholder="0,00" className="entrada" /></Campo>
              <Campo rotulo="Competência"><input type="month" name="competencia" required defaultValue={hoje.slice(0, 7)} className="entrada" /></Campo>
            </div>
            <Campo rotulo="Categoria do custo"><select name="categoria" className="entrada" defaultValue="mao_de_obra">
              {Object.entries(CATEGORIAS_DESPESA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo rotulo="Motivo *"><textarea name="motivo" required minLength={5} rows={2} className="entrada" placeholder="Ex.: equipe da Praça da Foice trabalhou 3 dias na Praça da Bandeira" /></Campo>
            <Botao grande>Transferir custo</Botao>
            <p className="text-xs text-concreto-500">Aparece no Centro de custo e no financeiro das duas obras. Para material do estoque, use a transferência no Estoque (o valor é calculado sozinho).</p>
          </FormAcao>
        </Cartao>
      </div>
    </>
  );
}
