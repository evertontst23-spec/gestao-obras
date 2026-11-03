import { notFound } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { codCot } from '@/lib/dominio';
import { data, num } from '@/lib/formato';

export const metadata = { title: 'Pedido de cotação (PDF)' };
const th = 'border border-concreto-400 bg-concreto-100 px-2 py-1 text-left';
const td = 'border border-concreto-400 px-2 py-2 align-top';

/** Pedido de cotação para o fornecedor preencher — imprimir ou salvar em PDF e mandar pelo WhatsApp */
export default async function PedidoCotacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirPapel('admin', 'compras', 'financeiro');
  const { data: c } = await supabase.from('v_cotacoes').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [{ data: itens }, { data: emp }] = await Promise.all([
    supabase.from('cotacao_itens').select('id, descricao, unidade, quantidade, solicitacao_itens!cotacao_itens_solicitacao_item_id_fkey(data_necessidade, especificacao)').eq('cotacao_id', id).order('descricao'),
    supabase.from('empregadores').select('razao_social, cnpj').eq('nome', 'CAD').maybeSingle(),
  ]);
  const nec = (itens ?? []).map((i) => (i.solicitacao_itens as unknown as { data_necessidade?: string } | null)?.data_necessidade).filter(Boolean).sort()[0];
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-sm text-concreto-900">
      <div className="nao-imprimir mb-4 flex justify-end"><BotaoImprimir rotulo="🖨 Imprimir / salvar PDF" /></div>
      <div className="mb-4 flex items-start justify-between border-b-2 border-concreto-800 pb-3">
        <div><div className="text-lg font-black">{emp?.razao_social ?? 'CAD ENGENHARIA'}</div>{emp?.cnpj && <div className="text-xs">CNPJ {emp.cnpj}</div>}</div>
        <div className="text-right"><div className="text-xs font-bold uppercase tracking-widest">Pedido de cotação</div>
          <div className="font-mono text-xl font-black">{codCot(c.numero)}</div><div className="text-xs">{data(c.criado_em)}</div></div>
      </div>
      <p className="mb-1"><b>Obra / entrega:</b> {c.obra_nome ?? 'Depósito central'}</p>
      {nec && <p className="mb-1"><b>Precisamos do material até:</b> {data(nec)}</p>}
      <p className="mb-4"><b>Fornecedor:</b> ______________________________________________</p>
      <table className="mb-4 w-full border-collapse">
        <thead><tr><th className={th}>#</th><th className={th}>Item</th><th className={`${th} text-right`}>Qtd.</th><th className={th}>Un.</th><th className={th}>Preço unit. (R$)</th><th className={th}>Total (R$)</th></tr></thead>
        <tbody>{(itens ?? []).map((i, k) => (
          <tr key={i.id}><td className={td}>{k + 1}</td>
            <td className={td}>{i.descricao}{(i.solicitacao_itens as unknown as { especificacao?: string } | null)?.especificacao && <div className="text-xs text-concreto-600">{(i.solicitacao_itens as unknown as { especificacao: string }).especificacao}</div>}</td>
            <td className={`${td} text-right font-mono`}>{num(i.quantidade, 3)}</td><td className={td}>{i.unidade}</td><td className={td} /><td className={td} /></tr>))}
          <tr><td className={td} colSpan={5}>Frete</td><td className={td} /></tr>
          <tr className="font-bold"><td className={td} colSpan={5}>TOTAL</td><td className={td} /></tr>
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-3">
        <p>Prazo de entrega: ________ dias</p>
        <p>Forma de pagamento: ☐ PIX ☐ Boleto ☐ Cartão de crédito ☐ Dinheiro</p>
        <p>Condição / parcelas: __________________</p>
        <p>Validade da proposta: ________ dias</p>
      </div>
      <p className="mt-6 text-xs text-concreto-600">Responda com este pedido preenchido (foto ou PDF) pelo WhatsApp do setor de compras. Obrigado!</p>
    </div>
  );
}
