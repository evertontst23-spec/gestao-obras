import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { Vazio } from '@/components/ui';
import { STATUS_MATERIAL, STATUS_SOLICITACAO, codSM, type StatusMaterial } from '@/lib/dominio';
import { data, dataHora, hojeISO, num } from '@/lib/formato';

export const metadata = { title: 'Pedido de material (PDF)' };

const th = 'border border-concreto-300 bg-concreto-100 px-2 py-1 text-left';
const td = 'border border-concreto-300 px-2 py-1 align-top';
type Item = { id: string; solicitacao_id: string; material: string; especificacao: string | null; unidade: string; quantidade: number;
  quantidade_recebida: number; data_necessidade: string; status: StatusMaterial };

/** Pedido de material de uma obra (ou de uma solicitação) pronto para imprimir / salvar em PDF */
export default async function PedidoPDF({ searchParams }: { searchParams: Promise<{ obra?: string; sm?: string; status?: string; de?: string; ate?: string; consolidar?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await obterSessao();
  const { data: obras } = await supabase.from('obras').select('id, codigo, nome, endereco, cliente').order('codigo');
  let q = supabase.from('v_solicitacoes').select('*').order('numero');
  if (perfil.papel === 'encarregado') q = q.eq('solicitante_id', perfil.id);
  if (sp.sm) q = q.eq('id', sp.sm);
  else {
    if (sp.obra) q = q.eq('obra_id', sp.obra);
    if (sp.status === 'todas') { /* todas */ } else if (sp.status) q = q.eq('status', sp.status);
    else q = q.not('status', 'in', '(concluida,cancelada,rejeitada)');
    if (sp.de) q = q.gte('criado_em', `${sp.de}T00:00:00-03:00`);
    if (sp.ate) q = q.lte('criado_em', `${sp.ate}T23:59:59-03:00`);
  }
  const { data: sms } = sp.sm || sp.obra ? await q.limit(300) : { data: [] };
  const ids = (sms ?? []).map((s) => s.id);
  const { data: itensQ } = ids.length
    ? await supabase.from('v_itens').select('id, solicitacao_id, material, especificacao, unidade, quantidade, quantidade_recebida, data_necessidade, status').in('solicitacao_id', ids).order('criado_em')
    : { data: [] };
  const itens = (itensQ ?? []) as Item[];
  const obraId = sp.obra ?? sms?.[0]?.obra_id;
  const obra = obras?.find((o) => o.id === obraId);
  const consolidar = sp.consolidar === '1';
  // soma por material + especificação + unidade (lista única para o fornecedor)
  const somados = new Map<string, { material: string; esp: string | null; un: string; qtd: number; sms: Set<number>; nec: string }>();
  for (const i of itens.filter((x) => x.status !== 'cancelado')) {
    const s = sms!.find((x) => x.id === i.solicitacao_id)!;
    const k = `${i.material.trim().toLowerCase()}|${(i.especificacao ?? '').trim().toLowerCase()}|${i.unidade}`;
    const g = somados.get(k) ?? { material: i.material, esp: i.especificacao, un: i.unidade, qtd: 0, sms: new Set<number>(), nec: i.data_necessidade };
    g.qtd += Number(i.quantidade); g.sms.add(s.numero); if (i.data_necessidade < g.nec) g.nec = i.data_necessidade;
    somados.set(k, g);
  }
  const titulo = sp.sm && sms?.[0] ? `Pedido ${codSM(sms[0].numero)}` : 'Pedido de material';

  return (
    <>
      <div className="nao-imprimir mb-4 space-y-3">
        <Link href={sp.sm ? `/materiais/${sp.sm}` : `/materiais${sp.obra ? `?obra=${sp.obra}` : ''}`} className="link text-sm">← Voltar</Link>
        {!sp.sm && (
          <form className="flex flex-wrap items-end gap-2 rounded-lg border border-concreto-200 bg-white p-3 text-sm">
            <label className="text-xs text-concreto-600">Obra<select name="obra" defaultValue={sp.obra ?? ''} required className="entrada block w-auto min-w-[220px]"><option value="">Escolha a obra…</option>
              {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></label>
            <label className="text-xs text-concreto-600">Situação<select name="status" defaultValue={sp.status ?? ''} className="entrada block w-auto"><option value="">Em aberto</option><option value="todas">Todas</option>
              {Object.entries(STATUS_SOLICITACAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></label>
            <label className="text-xs text-concreto-600">Pedidos de<input type="date" name="de" defaultValue={sp.de ?? ''} className="entrada block w-auto" /></label>
            <label className="text-xs text-concreto-600">até<input type="date" name="ate" defaultValue={sp.ate ?? ''} className="entrada block w-auto" /></label>
            <label className="flex items-center gap-2 px-1 pb-2 text-sm"><input type="checkbox" name="consolidar" value="1" defaultChecked={consolidar} className="accent-sinal-500" /> Somar itens iguais</label>
            <button className="rounded-md bg-concreto-800 px-4 py-2 font-semibold text-white">Ver</button>
          </form>)}
        {(sms ?? []).length > 0 && <div className="flex justify-end"><BotaoImprimir rotulo="🖨 Imprimir / salvar PDF" /></div>}
      </div>

      {!sp.sm && !sp.obra ? <Vazio>Escolha a obra para montar o pedido em PDF.</Vazio> : !(sms ?? []).length ? <Vazio>Nenhum pedido de material encontrado com esses filtros.</Vazio> : (
        <article className="mx-auto max-w-4xl rounded-lg border border-concreto-200 bg-white p-6 text-sm print:border-0 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-concreto-800 pb-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sinal-700">CAD Engenharia e Segurança do Trabalho</div>
              <h1 className="text-2xl font-black">{titulo}</h1>
              <div className="text-xs text-concreto-600">Emitido em {dataHora(new Date().toISOString())} • {(sms ?? []).length} solicitação(ões) • {itens.length} item(ns)</div>
            </div>
            <div className="text-right"><div className="font-bold">{obra ? `${obra.codigo} — ${obra.nome}` : ''}</div>
              <div className="text-xs text-concreto-600">{obra?.endereco ?? ''}</div>{obra?.cliente && <div className="text-xs text-concreto-600">Cliente: {obra.cliente}</div>}</div>
          </div>

          {consolidar ? (
            <table className="mt-4 w-full border-collapse text-xs">
              <thead><tr><th className={th}>#</th><th className={th}>Material</th><th className={`${th} text-right`}>Quantidade</th><th className={th}>Necessário até</th><th className={th}>Pedidos</th></tr></thead>
              <tbody>{[...somados.values()].sort((a, b) => a.material.localeCompare(b.material)).map((g, k) => (
                <tr key={k}><td className={td}>{k + 1}</td><td className={td}><b>{g.material}</b>{g.esp && <div className="text-concreto-600">{g.esp}</div>}</td>
                  <td className={`${td} whitespace-nowrap text-right font-mono`}>{num(g.qtd, 3)} {g.un}</td><td className={td}>{data(g.nec)}</td>
                  <td className={td}>{[...g.sms].map(codSM).join(', ')}</td></tr>))}</tbody>
            </table>
          ) : (sms ?? []).map((s) => {
            const its = itens.filter((i) => i.solicitacao_id === s.id);
            return (
              <section key={s.id} className="mt-4">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <div><b className="font-mono">{codSM(s.numero)}</b> • {s.tarefa_titulo ?? 'Uso geral'} • pedido por {s.solicitante_nome} em {dataHora(s.criado_em)}</div>
                  <div className="text-xs">Necessário até <b>{data(s.data_necessidade)}</b> • {STATUS_SOLICITACAO[s.status]?.rotulo ?? s.status}</div>
                </div>
                <table className="w-full border-collapse text-xs">
                  <thead><tr><th className={th}>Material</th><th className={`${th} text-right`}>Quantidade</th><th className={`${th} text-right`}>Recebido</th><th className={th}>Situação</th></tr></thead>
                  <tbody>{its.map((i) => (
                    <tr key={i.id} className={i.status === 'cancelado' ? 'text-concreto-400 line-through' : ''}>
                      <td className={td}><b>{i.material}</b>{i.especificacao && <div className="text-concreto-600">{i.especificacao}</div>}</td>
                      <td className={`${td} whitespace-nowrap text-right font-mono`}>{num(i.quantidade, 3)} {i.unidade}</td>
                      <td className={`${td} whitespace-nowrap text-right font-mono`}>{Number(i.quantidade_recebida) > 0 ? num(i.quantidade_recebida, 3) : '—'}</td>
                      <td className={td}>{STATUS_MATERIAL[i.status]?.rotulo ?? i.status}</td></tr>))}</tbody>
                </table>
                {s.justificativa && <p className="mt-1 text-xs"><b>Justificativa:</b> {s.justificativa}</p>}
                {s.observacoes && <p className="text-xs"><b>Obs.:</b> {s.observacoes}</p>}
              </section>);
          })}

          <div className="mt-12 grid grid-cols-3 gap-8 text-center text-xs">
            <div className="border-t border-concreto-800 pt-1">Solicitante (encarregado)</div>
            <div className="border-t border-concreto-800 pt-1">Engenheiro responsável</div>
            <div className="border-t border-concreto-800 pt-1">Compras / almoxarifado</div>
          </div>
          <p className="mt-4 text-[10px] text-concreto-500">Documento gerado pelo sistema de gestão de obras em {data(hojeISO())}.</p>
        </article>)}
    </>
  );
}
