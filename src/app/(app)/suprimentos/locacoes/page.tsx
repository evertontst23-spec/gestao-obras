import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, Vazio } from '@/components/ui';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { SITUACAO_LOCACAO } from '@/components/Locacao';
import { ControleLocacao } from '@/components/ControleLocacao';
import { codSM } from '@/lib/dominio';
import { data, hojeISO, num } from '@/lib/formato';

export const metadata = { title: 'Controle de locações' };

const ABERTAS = ['a_contratar', 'ativa', 'vencendo', 'vencida'];

export default async function Locacoes({ searchParams }: { searchParams: Promise<{ sit?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('compras', 'almoxarifado', 'admin', 'financeiro', 'engenheiro');
  const hoje = hojeISO();
  let q = supabase.from('v_itens').select('*').eq('modalidade', 'locacao').order('locacao_fim').limit(1000);
  if (sp.obra) q = q.eq('obra_id', sp.obra);
  const [{ data: itens }, { data: obras }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
  ]);
  const todos = itens ?? [];
  const conta = (s: string) => todos.filter((i) => i.locacao_situacao === s).length;
  const sit = sp.sit ?? 'abertas';
  const lista = todos.filter((i) => (sit === 'abertas' ? ABERTAS.includes(i.locacao_situacao) : i.locacao_situacao === sit));
  const naObra = todos.filter((i) => ['ativa', 'vencendo', 'vencida'].includes(i.locacao_situacao));
  const podeControlar = ['compras', 'almoxarifado', 'admin', 'engenheiro'].includes(perfil.papel);
  const url = (s: string) => `/suprimentos/locacoes?sit=${s}${sp.obra ? `&obra=${sp.obra}` : ''}`;

  return (
    <>
      <Cabecalho titulo="Controle de locações" sub="Equipamentos e materiais locados: período, vencimento, prorrogação e devolução" />
      <AbasSuprimentos atual="locacoes" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador rotulo="Na obra" valor={naObra.length} detalhe="locações em andamento" href={url('abertas')} tom={sit === 'abertas' ? 'sinal' : 'neutro'} />
        <Indicador rotulo="Vencendo (até 3 dias)" valor={conta('vencendo')} tom={conta('vencendo') ? 'atencao' : 'ok'} href={url('vencendo')} />
        <Indicador rotulo="Vencidas — devolver ou prorrogar" valor={conta('vencida')} tom={conta('vencida') ? 'atraso' : 'ok'} href={url('vencida')} />
        <Indicador rotulo="A contratar" valor={conta('a_contratar')} detalhe="em estoque, cotação ou compra" href={url('a_contratar')} />
        <Indicador rotulo="Devolvidas" valor={conta('devolvida')} href={url('devolvida')} />
      </div>
      <form className="mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="sit" value={sit} />
        <label className="text-xs text-concreto-500">Obra
          <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-64">
            <option value="">Todas</option>{(obras ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
          </select></label>
        <button className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">Filtrar</button>
      </form>
      {!lista.length ? <Vazio>Nenhuma locação {sit === 'abertas' ? 'em aberto' : 'nesta situação'}. Para pedir uma locação, use “Solicitar material” e escolha <b>Locação</b> no item.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Equipamento / material</th><th>Qtd.</th><th>Obra</th><th>Período</th><th>Restam</th><th>Fornecedor</th><th>Situação</th>{podeControlar && <th>Devolver / prorrogar</th>}</tr></thead>
            <tbody>{lista.map((i) => {
              const s = SITUACAO_LOCACAO[i.locacao_situacao] ?? SITUACAO_LOCACAO.a_contratar;
              return (
                <tr key={i.id} className={i.locacao_situacao === 'vencida' ? 'bg-atraso-50/40' : i.locacao_situacao === 'vencendo' ? 'bg-atencao-50/40' : ''}>
                  <td className="min-w-[180px] font-semibold"><Link href={`/materiais/${i.solicitacao_id}`} className="hover:text-sinal-700 hover:underline">{i.material}</Link>
                    <div className="text-xs font-normal text-concreto-500">{codSM(i.solicitacao_numero)}{i.tarefa_titulo ? ` • ${i.tarefa_titulo}` : ' • uso geral'}</div></td>
                  <td className="whitespace-nowrap font-mono">{num(i.quantidade)} {i.unidade}</td>
                  <td className="text-xs">{i.obra_codigo}</td>
                  <td className="whitespace-nowrap text-xs">{data(i.locacao_inicio)} a <b>{data(i.locacao_fim)}</b><div className="text-concreto-500">{i.locacao_dias} dia(s)</div></td>
                  <td className={`whitespace-nowrap text-sm ${i.locacao_situacao === 'vencida' ? 'font-bold text-atraso-700' : ''}`}>
                    {i.locacao_situacao === 'devolvida' ? <span className="text-xs">devolvido {data(i.devolvido_em)}</span>
                      : i.locacao_dias_restantes < 0 ? `${-i.locacao_dias_restantes} dia(s) vencida` : `${i.locacao_dias_restantes} dia(s)`}</td>
                  <td className="text-xs">{i.fornecedor ?? '—'}{i.oc_id && <div><Link href={`/suprimentos/ordens/${i.oc_id}`} className="link">ver OC</Link></div>}</td>
                  <td><span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.cor}`}>{s.rotulo}</span></td>
                  {podeControlar && <td className="min-w-[320px]">{['ativa', 'vencendo', 'vencida'].includes(i.locacao_situacao)
                    ? <ControleLocacao item={i.id} solicitacao={i.solicitacao_id} fim={i.locacao_fim} hoje={hoje} compacto />
                    : <span className="text-xs text-concreto-500">{i.locacao_situacao === 'a_contratar' ? 'Libera quando chegar na obra' : '—'}</span>}</td>}
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
