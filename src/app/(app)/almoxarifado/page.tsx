import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Vazio } from '@/components/ui';
import { AbasAlmox } from '@/components/AbasAlmox';
import { codOC, codSM } from '@/lib/dominio';
import { data, dataHora, num } from '@/lib/formato';

export const metadata = { title: 'Almoxarifado' };

const ETAPAS = [
  ['Material chega', 'OC coletada ou entregue pelo fornecedor'],
  ['Conferir e dar entrada', 'quantidade × NF × OC; entra no estoque da obra'],
  ['Guardar', 'saldo por obra e depósito central'],
  ['Separar o pedido', 'o que a obra pediu (SM)'],
  ['Enviar à frente de serviço', 'registrar o envio'],
  ['Encarregado confirma', 'recebeu tudo? divergência volta ao almoxarifado'],
] as const;

export default async function Almoxarifado({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'almoxarifado', 'compras', 'engenheiro');
  const obraF = sp.obra || null;
  let qOc = supabase.from('ordens_compra').select('id, numero, status, coletado_em, coletado_por, obra_id, obras(codigo), fornecedores(nome)')
    .in('status', ['emitida', 'pronta_coleta', 'recebida_parcial']).order('numero');
  let qIt = supabase.from('v_itens').select('*').in('status', ['disponivel_estoque', 'parcialmente_entregue']).order('data_necessidade').limit(200);
  let qCau = supabase.from('v_cautelas').select('*').eq('situacao', 'emprestada').order('retirada_em');
  let qMin = supabase.from('v_estoque').select('*').eq('abaixo_minimo', true);
  let qMov = supabase.from('estoque_movimentos').select('id, tipo, quantidade, origem, observacao, criado_em, destino, insumos(codigo, descricao, unidade), obras(codigo)')
    .in('origem', ['retirada', 'devolucao', 'cautela', 'devolucao_cautela', 'recebimento_oc', 'envio_solicitacao', 'ajuste_inventario']).order('criado_em', { ascending: false }).limit(12);
  if (obraF) { qOc = qOc.eq('obra_id', obraF); qIt = qIt.eq('obra_id', obraF); qCau = qCau.eq('obra_id', obraF); qMin = qMin.eq('obra_id', obraF); qMov = qMov.eq('obra_id', obraF); }
  const [{ data: ocs }, { data: itens }, { data: cau }, { data: minimo }, { data: movs }, { data: obras }, { data: entregas }] = await Promise.all([
    qOc, qIt, qCau, qMin, qMov, supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('entregas').select('id, enviado_em, quantidade_enviada, solicitacao_itens(material, unidade, solicitacoes(id, numero, obra_id, obras(codigo)))').is('recebido_em', null).order('enviado_em'),
  ]);
  const receber = (ocs ?? []).filter((o) => o.coletado_em || o.status === 'recebida_parcial');
  const aguardando = (ocs ?? []).filter((o) => !o.coletado_em && o.status !== 'recebida_parcial');
  const separar = (itens ?? []).filter((i) => Number(i.quantidade_enviada) < Number(i.quantidade));
  type Ent = { id: string; enviado_em: string; quantidade_enviada: number; solicitacao_itens: { material: string; unidade: string; solicitacoes: { id: string; numero: number; obra_id: string; obras: { codigo: string } | null } } };
  const confirmar = ((entregas ?? []) as unknown as Ent[]).filter((e) => !obraF || e.solicitacao_itens?.solicitacoes?.obra_id === obraF);
  const atrasadas = (cau ?? []).filter((c) => c.atrasada);

  return (
    <>
      <Cabecalho titulo="Almoxarifado" sub="Do material que chega à entrega na frente de serviço — mais retiradas, ferramentas emprestadas e inventário." />
      <AbasAlmox atual="painel" />
      <form className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <button className="rounded-md bg-concreto-800 px-4 py-2 font-semibold text-white">Ver</button>
      </form>

      <Cartao titulo="Fluxo do almoxarifado" className="mb-5">
        <ol className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
          {ETAPAS.map(([t, d], k) => (
            <li key={t} className="relative rounded-md border border-concreto-200 bg-concreto-50 p-2">
              <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sinal-500 text-[11px] font-bold text-white">{k + 1}</span>
              <b>{t}</b><div className="text-[11px] text-concreto-500">{d}</div>
            </li>))}
        </ol>
        <div className="mt-3 grid gap-2 text-xs text-concreto-600 md:grid-cols-3">
          <div className="rounded-md border border-dashed border-concreto-300 p-2"><b>Retirada no balcão:</b> funcionário pega material → registrar quem retirou e para qual serviço. Sobra volta como devolução.</div>
          <div className="rounded-md border border-dashed border-concreto-300 p-2"><b>Ferramenta emprestada:</b> empresta com previsão de devolução → devolve em bom estado (volta ao estoque) ou registra dano/perda (compras é avisado).</div>
          <div className="rounded-md border border-dashed border-concreto-300 p-2"><b>Inventário:</b> contagem física por local (sugestão: toda sexta) → diferenças viram ajuste com motivo.</div>
        </div>
      </Cartao>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Indicador rotulo="1 · Chegou — dar entrada" valor={receber.length} tom={receber.length ? 'sinal' : 'ok'} />
        <Indicador rotulo="A caminho (OC sem coleta)" valor={aguardando.length} />
        <Indicador rotulo="4 · Separar e enviar" valor={separar.length} tom={separar.length ? 'sinal' : 'ok'} />
        <Indicador rotulo="6 · Aguardando a obra confirmar" valor={confirmar.length} />
        <Indicador rotulo="Ferramentas emprestadas" valor={(cau ?? []).length} detalhe={atrasadas.length ? `${atrasadas.length} atrasada(s)` : 'nenhuma atrasada'} tom={atrasadas.length ? 'atraso' : 'neutro'} href="/almoxarifado/ferramentas" />
        <Indicador rotulo="Abaixo do mínimo" valor={(minimo ?? []).length} tom={(minimo ?? []).length ? 'atraso' : 'ok'} href="/suprimentos/estoque?minimo=1" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="1 · Chegou na obra — conferir e dar entrada">
          {!receber.length ? <Vazio>Nenhum material aguardando entrada.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{receber.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span><b className="font-mono">{codOC(o.numero)}</b> • {(o.fornecedores as unknown as { nome: string } | null)?.nome}
                  <span className="block text-xs text-concreto-500">{(o.obras as unknown as { codigo: string } | null)?.codigo ?? 'Depósito central'}{o.coletado_em ? ` • coletado ${dataHora(o.coletado_em)}${o.coletado_por ? ` por ${o.coletado_por}` : ''}` : ' • recebido em parte'}</span></span>
                <Link href={`/suprimentos/ordens/${o.id}`} className="rounded bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white">Dar entrada →</Link>
              </li>))}</ul>)}
          {aguardando.length > 0 && <p className="mt-2 text-xs text-concreto-500">A caminho: {aguardando.map((o) => codOC(o.numero)).join(', ')} — entram aqui quando a coleta for registrada.</p>}
        </Cartao>

        <Cartao titulo="4 · Separar e enviar para a frente de serviço">
          {!separar.length ? <Vazio>Nada para separar.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{separar.slice(0, 30).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <span><b>{i.material}</b> — {num(Number(i.quantidade) - Number(i.quantidade_enviada))} {i.unidade}
                  <span className="block text-xs text-concreto-500">{codSM(i.solicitacao_numero)} • {i.obra_codigo} • {i.solicitante_nome} • precisa {data(i.data_necessidade)}</span></span>
                <Link href={`/materiais/${i.solicitacao_id}`} className="rounded border border-concreto-300 px-3 py-1.5 text-xs font-semibold hover:border-sinal-400">Separar e enviar →</Link>
              </li>))}</ul>)}
        </Cartao>

        <Cartao titulo="6 · Enviado — aguardando o encarregado confirmar">
          {!confirmar.length ? <Vazio>Nenhuma entrega pendente de confirmação.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{confirmar.map((e) => (
              <li key={e.id} className="py-2"><b>{e.solicitacao_itens?.material}</b> — {num(e.quantidade_enviada)} {e.solicitacao_itens?.unidade}
                <span className="block text-xs text-concreto-500"><Link className="link" href={`/materiais/${e.solicitacao_itens?.solicitacoes?.id}`}>{codSM(e.solicitacao_itens?.solicitacoes?.numero ?? 0)}</Link> • {e.solicitacao_itens?.solicitacoes?.obras?.codigo} • enviado {dataHora(e.enviado_em)}</span></li>))}</ul>)}
        </Cartao>

        <Cartao titulo="Ferramentas emprestadas" acoes={<Link className="link text-sm" href="/almoxarifado/ferramentas">abrir →</Link>}>
          {!(cau ?? []).length ? <Vazio>Nenhuma ferramenta fora do almoxarifado.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{(cau ?? []).slice(0, 12).map((c) => (
              <li key={c.id} className={`py-2 ${c.atrasada ? 'text-atraso-700' : ''}`}><b>{c.descricao}</b> — {num(c.quantidade)} {c.unidade} com <b>{c.funcionario_nome}</b>
                <span className="block text-xs text-concreto-500">{c.obra_codigo ?? 'Depósito central'} • desde {data(c.retirada_em)}{c.previsao_devolucao && ` • devolver até ${data(c.previsao_devolucao)}`}{c.atrasada && ' • ATRASADA'}</span></li>))}</ul>)}
        </Cartao>
      </div>

      <Cartao titulo="Últimos movimentos do almoxarifado" className="mt-5">
        {!movs?.length ? <Vazio>Nenhum movimento ainda.</Vazio> : (
          <ul className="divide-y divide-concreto-100 text-sm">{movs.map((m) => {
            const ins = m.insumos as unknown as { codigo: string; descricao: string; unidade: string };
            const saida = m.tipo === 'saida' || Number(m.quantidade) < 0;
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b className={saida ? 'text-atraso-700' : 'text-ok-700'}>{saida ? '−' : '+'}{num(Math.abs(Number(m.quantidade)), 3)} {ins?.unidade}</b> {ins?.descricao}
                  <span className="block text-xs text-concreto-500">{(m.obras as unknown as { codigo: string } | null)?.codigo ?? 'Depósito central'} • {m.observacao}</span></span>
                <span className="text-xs text-concreto-500">{dataHora(m.criado_em)}</span>
              </li>);
          })}</ul>)}
      </Cartao>
    </>
  );
}
