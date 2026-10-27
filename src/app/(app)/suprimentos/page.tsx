import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, SeloMaterial, SeloPrioridade, Vazio } from '@/components/ui';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { codSM } from '@/lib/dominio';
import { SeloLocacao } from '@/components/Locacao';
import { FormAcao, Botao } from '@/components/formulario';
import { verificarEstoque } from '@/app/(app)/materiais/acoes';
import { data, num } from '@/lib/formato';

export const metadata = { title: 'Suprimentos' };

const FILAS = {
  estoque:  { titulo: 'Verificar estoque', status: ['aprovado'], dono: 'almoxarifado' },
  envio:    { titulo: 'Separar e enviar', status: ['disponivel_estoque', 'comprado', 'em_transporte', 'parcialmente_entregue'], dono: 'almoxarifado' },
  compras:  { titulo: 'Cotar / comprar', status: ['em_cotacao', 'compra_autorizada', 'comprado', 'em_transporte'], dono: 'compras' },
  aprovacao:{ titulo: 'Aguardando aprovação', status: ['aguardando_aprovacao'], dono: 'admin' },
} as const;
type Fila = keyof typeof FILAS | 'risco';

export default async function Suprimentos({ searchParams }: { searchParams: Promise<{ fila?: Fila; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('compras', 'almoxarifado', 'admin', 'financeiro');
  const padrao: Fila = perfil.papel === 'compras' ? 'compras' : 'estoque';
  const fila: Fila = sp.fila ?? padrao;

  let q = supabase.from('v_itens').select('*').not('status', 'in', '(entregue,cancelado)').order('data_necessidade').limit(500);
  if (sp.obra) q = q.eq('obra_id', sp.obra);
  const { data: itens } = await q;
  const todos = itens ?? [];
  const daFila = (f: Fila) => f === 'risco'
    ? todos.filter((i) => i.risco_atraso || i.entrega_atrasada || i.necessidade_vencida)
    : todos.filter((i) => (FILAS[f].status as readonly string[]).includes(i.status) && (f !== 'envio' || Number(i.quantidade_enviada) < Number(i.quantidade)));
  const lista = daFila(fila);
  // saldo de estoque dos itens a verificar (obra do pedido e depósito central)
  const insIds = fila === 'estoque' ? [...new Set(lista.map((i) => i.insumo_id).filter(Boolean))] as string[] : [];
  const { data: saldos } = insIds.length ? await supabase.from('v_estoque').select('insumo_id, obra_id, saldo').in('insumo_id', insIds) : { data: [] };
  const saldoDe = (i: { insumo_id: string | null; obra_id: string }) => {
    if (!i.insumo_id) return 0;
    const r = (saldos ?? []).filter((x) => x.insumo_id === i.insumo_id);
    return Math.max(Number(r.find((x) => x.obra_id === i.obra_id)?.saldo ?? 0), Number(r.find((x) => !x.obra_id)?.saldo ?? 0));
  };
  const podeVerificar = ['almoxarifado', 'admin'].includes(perfil.papel);
  const linkItem = (i: (typeof lista)[number]) => i.oc_id ? `/suprimentos/ordens/${i.oc_id}` : i.cotacao_id ? `/suprimentos/cotacoes/${i.cotacao_id}` : i.status === 'em_cotacao' ? '/suprimentos/cotacoes/nova' : `/materiais/${i.solicitacao_id}`;
  const [{ count: aConfirmar }, { count: cotAprovar }, { count: ocColeta }, { count: ocPagar }] = await Promise.all([
    supabase.from('entregas').select('id', { count: 'exact', head: true }).is('recebido_em', null),
    supabase.from('cotacoes').select('id', { count: 'exact', head: true }).eq('status', 'aguardando_aprovacao'),
    supabase.from('ordens_compra').select('id', { count: 'exact', head: true }).in('status', ['pronta_coleta', 'recebida_parcial']),
    supabase.from('ordens_compra').select('id', { count: 'exact', head: true }).eq('status', 'emitida'),
  ]);

  return (
    <>
      <Cabecalho titulo={perfil.papel === 'almoxarifado' ? 'Almoxarifado' : 'Suprimentos'} sub="Itens de material em aberto, por etapa do fluxo" />
      <AbasSuprimentos atual="filas" />
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Compras aguardando diretoria" valor={cotAprovar ?? 0} tom={cotAprovar ? 'sinal' : 'ok'} href="/suprimentos/cotacoes?status=aguardando_aprovacao" />
        <Indicador rotulo="OCs aguardando pagamento" valor={ocPagar ?? 0} href="/suprimentos/ordens?status=emitida" />
        <Indicador rotulo="OCs pagas — receber na obra" valor={ocColeta ?? 0} tom={ocColeta ? 'sinal' : 'ok'} href="/suprimentos/ordens?status=pronta_coleta" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        {(Object.keys(FILAS) as (keyof typeof FILAS)[]).map((k) => (
          <Indicador key={k} rotulo={FILAS[k].titulo} valor={daFila(k).length} href={`/suprimentos?fila=${k}`} tom={fila === k ? 'sinal' : 'neutro'} />
        ))}
        <Indicador rotulo="Risco / atraso" valor={daFila('risco').length} href="/suprimentos?fila=risco" tom={daFila('risco').length ? 'atraso' : 'ok'} />
        <Indicador rotulo="Aguard. confirmação da obra" valor={aConfirmar ?? 0} detalhe="entregas enviadas" />
      </div>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-concreto-600">{fila === 'risco' ? 'Risco de atraso / entregas atrasadas' : FILAS[fila].titulo}</h2>
      {!lista.length ? <Vazio>Nada pendente nesta fila. 👍</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Pedido</th><th>Material</th><th>Qtd.</th><th>Obra / serviço</th><th>Necessário</th>{fila !== 'estoque' && <><th>Previsão</th><th>Fornecedor</th></>}<th>Prior.</th><th>Status</th><th></th></tr></thead>
            <tbody>{lista.map((i) => (
              <tr key={i.id} className={i.risco_atraso || i.entrega_atrasada ? 'bg-atraso-50/40' : ''}>
                <td><Link href={`/materiais/${i.solicitacao_id}`} className="link whitespace-nowrap font-mono">{codSM(i.solicitacao_numero)}</Link></td>
                <td className="min-w-[180px] font-semibold"><Link href={linkItem(i)} className="hover:text-sinal-700 hover:underline">{i.material}</Link><div className="text-xs font-normal text-concreto-500">{i.especificacao}</div><SeloLocacao i={i} /></td>
                <td className="whitespace-nowrap font-mono">{num(i.quantidade)} {i.unidade}{Number(i.quantidade_enviada) > 0 && <div className="text-xs text-concreto-500">enviado {num(i.quantidade_enviada)}</div>}</td>
                <td className="text-xs">{i.obra_codigo}<div className="text-concreto-500">{i.tarefa_titulo ?? 'Uso geral'} • {i.solicitante_nome}</div></td>
                <td className={`whitespace-nowrap ${i.dias_para_necessidade <= 2 ? 'font-bold text-atraso-700' : ''}`}>{data(i.data_necessidade)}</td>
                {fila !== 'estoque' && <>
                  <td className={`whitespace-nowrap ${i.risco_atraso || i.entrega_atrasada ? 'font-bold text-atraso-700' : ''}`}>{data(i.previsao_entrega)}{i.risco_atraso && <div className="text-[10px]">após a necessidade</div>}</td>
                  <td className="text-xs">{i.fornecedor ?? '—'}</td>
                </>}
                <td><SeloPrioridade p={i.prioridade} /></td>
                <td><SeloMaterial s={i.status} /></td>
                <td className="min-w-[200px]">
                  {fila === 'estoque' && podeVerificar ? (() => {
                    const saldo = saldoDe(i);
                    return saldo > 0 ? (
                      <div className="space-y-1">
                        <div className="text-xs text-teal-800">Estoque: <b>{num(saldo)} {i.unidade}</b></div>
                        <Link href={`/materiais/${i.solicitacao_id}`} className="inline-block rounded bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white">Separar do estoque →</Link>
                      </div>
                    ) : (
                      <FormAcao acao={verificarEstoque} className="space-y-1">
                        <input type="hidden" name="solicitacao" value={i.solicitacao_id} /><input type="hidden" name="item" value={i.id} />
                        <input type="hidden" name="disponivel" value="0" />
                        <div className="text-xs font-semibold text-atraso-700">{i.insumo_id ? 'Sem estoque no sistema' : 'Sem estoque cadastrado'}</div>
                        <Botao variante="escuro">Sem estoque → cotação</Botao>
                        <Link href={`/materiais/${i.solicitacao_id}`} className="block text-[11px] text-concreto-500 underline">tem na obra? informar quantidade</Link>
                      </FormAcao>
                    );
                  })() : <Link href={linkItem(i)} className="whitespace-nowrap rounded border border-concreto-300 px-2 py-1 text-xs font-semibold hover:border-sinal-400">Abrir →</Link>}
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
