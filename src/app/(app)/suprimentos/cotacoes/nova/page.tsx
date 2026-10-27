import { SeloLocacao } from '@/components/Locacao';
import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { criarCotacao } from '../../acoes';
import { codSM } from '@/lib/dominio';
import { data, num } from '@/lib/formato';

export const metadata = { title: 'Nova cotação' };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function NovaCotacao() {
  const { supabase } = await exigirPapel('admin', 'compras');
  const [{ data: pend }, { data: saldos }, { data: insumos }] = await Promise.all([
    supabase.from('v_itens').select('*').eq('status', 'em_cotacao').is('cotacao_id', null).order('data_necessidade'),
    supabase.from('v_estoque').select('insumo_id, saldo, obra_codigo'),
    supabase.from('insumos').select('id, codigo, descricao, unidade').eq('ativo', true).order('codigo'),
  ]);
  const estoque = new Map<string, { total: number; locais: string[] }>();
  (saldos ?? []).forEach((s) => { if (Number(s.saldo) <= 0) return; const e = estoque.get(s.insumo_id) ?? { total: 0, locais: [] };
    e.total += Number(s.saldo); e.locais.push(`${s.obra_codigo ?? 'Central'}: ${num(s.saldo)}`); estoque.set(s.insumo_id, e); });
  const porObra = new Map<string, any[]>();
  (pend ?? []).forEach((i) => porObra.set(i.obra_id, [...(porObra.get(i.obra_id) ?? []), i]));

  return (
    <>
      <Cabecalho titulo="Nova cotação" sub="Selecione os itens pendentes de uma obra. Se já houver estoque do insumo, o sistema pede justificativa." />
      <AbasSuprimentos atual="cotacoes" />
      <div className="space-y-5">
        {!porObra.size && <Vazio>Nenhum item aguardando cotação. Os itens chegam aqui quando o almoxarifado informa que não há estoque.</Vazio>}
        {[...porObra.entries()].map(([obra, itens]) => {
          const comEstoque = itens.filter((i) => i.insumo_id && estoque.has(i.insumo_id));
          return (
            <Cartao key={obra} titulo={`${itens[0].obra_codigo} — ${itens[0].obra_nome}`}>
              <FormAcao acao={criarCotacao} className="space-y-3">
                <input type="hidden" name="obra_id" value={obra} />
                <div className="overflow-x-auto"><table className="tabela">
                  <thead><tr><th></th><th>Pedido</th><th>Material</th><th className="text-right">Qtd.</th><th>Necessário</th><th>Estoque existente</th></tr></thead>
                  <tbody>{itens.map((i) => (
                    <tr key={i.id}>
                      <td><input type="checkbox" name="solicitacao_item_id" value={i.id} defaultChecked className="h-5 w-5 accent-sinal-500" /></td>
                      <td><Link href={`/materiais/${i.solicitacao_id}`} className="link font-mono text-xs">{codSM(i.solicitacao_numero)}</Link></td>
                      <td>{i.material}{i.especificacao && <div className="text-xs text-concreto-500">{i.especificacao}</div>}<SeloLocacao i={i} /></td>
                      <td className="whitespace-nowrap text-right font-mono">{num(i.quantidade, 3)} {i.unidade}</td>
                      <td className={`whitespace-nowrap ${i.dias_para_necessidade <= 2 ? 'font-bold text-atraso-700' : ''}`}>{data(i.data_necessidade)}</td>
                      <td className="text-xs">{i.insumo_id && estoque.has(i.insumo_id)
                        ? <span className="font-bold text-atencao-700">⚠ {estoque.get(i.insumo_id)!.locais.join(' • ')}</span> : '—'}</td>
                    </tr>))}
                  </tbody>
                </table></div>
                {comEstoque.length > 0 && (
                  <Campo rotulo="Justificativa — já existe estoque destes itens *" dica="Ex.: estoque comprometido com outra obra; especificação diferente. Ou peça ao almoxarifado para dar baixa.">
                    <textarea name="justificativa_estoque" rows={2} className="entrada border-atencao-500" /></Campo>)}
                <Campo rotulo="Observações para os fornecedores"><input name="observacoes" className="entrada" /></Campo>
                <Botao>Criar cotação</Botao>
              </FormAcao>
            </Cartao>);
        })}
        <Cartao titulo="Reposição do depósito central (sem pedido de obra)">
          <FormAcao acao={criarCotacao} className="space-y-3">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="grid grid-cols-3 gap-2">
                <select name="repor_insumo" className="entrada col-span-2"><option value="">Insumo…</option>
                  {insumos?.map((i) => <option key={i.id} value={i.id}>{i.codigo} — {i.descricao} ({i.unidade}){estoque.has(i.id) ? ` • estoque ${num(estoque.get(i.id)!.total)}` : ''}</option>)}</select>
                <input name="repor_qtd" inputMode="decimal" placeholder="Qtd." className="entrada" />
              </div>))}
            <Campo rotulo="Justificativa (obrigatória se já houver estoque)"><input name="justificativa_estoque" className="entrada" /></Campo>
            <Botao variante="secundario">Criar cotação de reposição</Botao>
          </FormAcao>
        </Cartao>
      </div>
    </>
  );
}
