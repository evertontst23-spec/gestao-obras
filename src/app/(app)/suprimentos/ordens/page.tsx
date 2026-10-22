import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { STATUS_OC, codOC, reais } from '@/lib/dominio';
import { data } from '@/lib/formato';

export const metadata = { title: 'Ordens de compra' };

export default async function Ordens({ searchParams }: { searchParams: Promise<{ status?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await obterSessao();
  let q = supabase.from('v_ordens_compra').select('*').order('emitida_em', { ascending: false }).limit(300);
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.obra) q = q.eq('obra_id', sp.obra);
  const { data: lista } = await q;
  const { data: todas } = await supabase.from('v_ordens_compra').select('status, valor_total, nf_divergente, entrega_atrasada');
  const t = todas ?? [];
  const sup = ['admin', 'compras', 'almoxarifado', 'financeiro'].includes(perfil.papel);
  return (
    <>
      <Cabecalho titulo="Ordens de compra" sub="Geradas após aprovação da diretoria. Visíveis para todos que atuam na obra." />
      {sup && <AbasSuprimentos atual="ordens" />}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador rotulo="Aguardando pagamento" valor={t.filter((o) => o.status === 'emitida').length} href="/suprimentos/ordens?status=emitida" />
        <Indicador rotulo="Pronta p/ coleta" valor={t.filter((o) => o.status === 'pronta_coleta').length} tom="sinal" href="/suprimentos/ordens?status=pronta_coleta" />
        <Indicador rotulo="Recebida parcial" valor={t.filter((o) => o.status === 'recebida_parcial').length} href="/suprimentos/ordens?status=recebida_parcial" />
        <Indicador rotulo="NF divergente" valor={t.filter((o) => o.nf_divergente).length} tom={t.some((o) => o.nf_divergente) ? 'atraso' : 'ok'} />
        <Indicador rotulo="Entrega atrasada" valor={t.filter((o) => o.entrega_atrasada).length} tom={t.some((o) => o.entrega_atrasada) ? 'atraso' : 'ok'} />
      </div>
      {!lista?.length ? <Vazio>Nenhuma ordem de compra.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>OC</th><th>Obra</th><th>Fornecedor</th><th className="text-right">Valor</th><th>NF</th><th>Previsão</th><th>Status</th></tr></thead>
            <tbody>{lista.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/suprimentos/ordens/${o.id}`} className="link font-mono">{codOC(o.numero)}</Link></td>
                <td className="text-xs">{o.obra_codigo ?? 'Depósito central'}</td>
                <td>{o.fornecedor_nome}<div className="text-xs text-concreto-500">{o.modalidade === 'retirada' ? `Retirada${o.retirante ? ` — ${o.retirante}` : ''}` : 'Entrega na obra'}</div></td>
                <td className="text-right font-mono">{reais(o.valor_total)}</td>
                <td className="text-xs">{o.nf_numero ? <span className={o.nf_divergente ? 'font-bold text-atraso-700' : ''}>{o.nf_numero}{o.nf_divergente && ' ⚠'}</span> : '—'}</td>
                <td className={`whitespace-nowrap ${o.entrega_atrasada ? 'font-bold text-atraso-700' : ''}`}>{data(o.previsao_entrega)}</td>
                <td><Selo cor={STATUS_OC[o.status].cor}>{STATUS_OC[o.status].rotulo}</Selo></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
