import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Indicador, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { lancarEstoque } from '../acoes';
import { num, data, dataHora } from '@/lib/formato';
import { reais } from '@/lib/dominio';

export const metadata = { title: 'Estoque' };

const ORIGEM: Record<string, string> = {
  recebimento_oc: 'Recebimento de OC', envio_solicitacao: 'Envio p/ frente de serviço', entrega_epi: 'Entrega de EPI', consumo: 'Consumo / baixa',
  ajuste_inventario: 'Ajuste de inventário', transferencia: 'Transferência', entrada_avulsa: 'Entrada avulsa',
  retirada: 'Retirada pelo funcionário', devolucao: 'Devolução de sobra', cautela: 'Ferramenta emprestada', devolucao_cautela: 'Ferramenta devolvida',
};

export default async function Estoque({ searchParams }: { searchParams: Promise<{ local?: string; q?: string; minimo?: string; transf?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'engenheiro', 'compras', 'almoxarifado');
  const pode = perfil.papel === 'almoxarifado' || perfil.papel === 'admin';
  let q = supabase.from('v_estoque').select('*').order('codigo');
  if (sp.local) q = sp.local === 'central' ? q.is('obra_id', null) : q.eq('obra_id', sp.local);
  if (sp.minimo) q = q.eq('abaixo_minimo', true);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ''); q = q.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`); }
  let qT = supabase.from('v_transferencias').select('*').order('criado_em', { ascending: false }).limit(60);
  if (sp.local) qT = sp.local === 'central' ? qT.or('origem_id.is.null,destino_id.is.null') : qT.or(`origem_id.eq.${sp.local},destino_id.eq.${sp.local}`);
  const [{ data: saldos }, { data: obras }, { data: insumos }, { data: movs }, { data: transfs }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('insumos').select('id, codigo, descricao, unidade').eq('ativo', true).order('codigo'),
    supabase.from('estoque_movimentos').select('*, insumos(codigo, descricao, unidade), obras(codigo), perfis(nome)').order('criado_em', { ascending: false }).limit(40),
    qT,
  ]);
  const tl = transfs ?? [];
  const totalTransf = tl.reduce((t, x) => t + Number(x.valor_total ?? 0), 0);
  // saldo por obra: valor recebido (+) e enviado (−) em transferências
  const porLocal = new Map<string, { nome: string; enviado: number; recebido: number }>();
  for (const x of tl) {
    const o = porLocal.get(x.origem_nome) ?? { nome: x.origem_nome, enviado: 0, recebido: 0 }; o.enviado += Number(x.valor_total ?? 0); porLocal.set(x.origem_nome, o);
    const d = porLocal.get(x.destino_nome) ?? { nome: x.destino_nome, enviado: 0, recebido: 0 }; d.recebido += Number(x.valor_total ?? 0); porLocal.set(x.destino_nome, d);
  }
  const FONTE: Record<string, string> = { oc_obra: 'custo médio das compras da obra de origem', oc_geral: 'custo médio das compras (todas as obras)', cotacao: 'última cotação', informado: 'valor informado na transferência' };
  const lista = (saldos ?? []).filter((s) => Number(s.saldo) !== 0 || sp.minimo);
  return (
    <>
      <Cabecalho titulo="Estoque" sub="Saldo por local (depósito central e cada obra), calculado pelas entradas e saídas registradas." />
      <AbasSuprimentos atual="estoque" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Itens com saldo" valor={lista.length} />
        <Indicador rotulo="Abaixo do mínimo" valor={(saldos ?? []).filter((s) => s.abaixo_minimo).length} tom={(saldos ?? []).some((s) => s.abaixo_minimo) ? 'atraso' : 'ok'} href="/suprimentos/estoque?minimo=1" />
        <Indicador rotulo="Locais" valor={new Set((saldos ?? []).map((s) => s.obra_id ?? 'c')).size} />
        <Indicador rotulo="Material transferido entre obras" valor={reais(totalTransf)} detalhe={`${tl.length} transferência(s)${sp.local ? ' neste local' : ''}`} tom={tl.length ? 'sinal' : 'neutro'} href="#transferencias" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form className="flex flex-wrap gap-2">
            <input name="q" defaultValue={sp.q} placeholder="Código ou descrição…" className="entrada min-w-[180px] flex-1" />
            <select name="local" defaultValue={sp.local ?? ''} className="entrada w-auto"><option value="">Todos os locais</option><option value="central">Depósito central</option>
              {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
            <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
          </form>
          {!lista.length ? <Vazio>Nenhum saldo encontrado.</Vazio> : (
            <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-superficie">
              <table className="tabela">
                <thead><tr><th>Código</th><th>Insumo</th><th>Local</th><th className="text-right">Saldo</th><th className="text-right">Mínimo</th></tr></thead>
                <tbody>{lista.map((s) => (
                  <tr key={`${s.insumo_id}-${s.obra_id}`} className={s.abaixo_minimo ? 'bg-atraso-50/50' : ''}>
                    <td className="font-mono font-bold">{s.codigo}</td><td>{s.descricao}{s.categoria === 'EPI' && <span className="ml-1"><Selo cor="bg-sky-100 text-sky-800">EPI</Selo></span>}</td>
                    <td className="text-xs">{s.obra_codigo ?? 'Depósito central'}</td>
                    <td className={`text-right font-mono font-bold ${s.abaixo_minimo ? 'text-atraso-700' : ''}`}>{num(s.saldo, 3)} {s.unidade}</td>
                    <td className="text-right font-mono text-concreto-500">{num(s.estoque_minimo, 3)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <Cartao titulo="Transferências entre obras (centros de custo)" className="scroll-mt-4" acoes={<span className="text-sm font-semibold">{reais(totalTransf)}</span>}>
            <div id="transferencias" />
            {!tl.length ? <p className="text-sm text-concreto-500">Nenhuma transferência{sp.local ? ' neste local' : ''}.</p> : (<>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">{[...porLocal.values()].map((l) => (
                <div key={l.nome} className="rounded-md border border-concreto-200 px-3 py-2 text-sm">
                  <b>{l.nome}</b>
                  <div className="mt-1 flex justify-between text-xs"><span className="text-atraso-700">enviou {reais(l.enviado)}</span><span className="text-ok-700">recebeu {reais(l.recebido)}</span></div>
                </div>))}</div>
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Data</th><th>Material</th><th>De → Para</th><th className="text-right">Qtd.</th><th className="text-right">Valor unit.</th><th className="text-right">Valor</th></tr></thead>
                <tbody>{tl.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap text-xs">{data(x.criado_em)}</td>
                    <td><b>{x.descricao}</b><span className="block text-xs text-concreto-500">{x.codigo}{x.observacao ? ` • ${x.observacao}` : ''}</span></td>
                    <td className="text-xs">{x.origem_nome} → <b>{x.destino_nome}</b></td>
                    <td className="whitespace-nowrap text-right font-mono">{num(x.quantidade, 3)} {x.unidade}</td>
                    <td className="whitespace-nowrap text-right font-mono" title={x.custo_fonte ? FONTE[x.custo_fonte] : undefined}>{x.valor_unitario == null ? '—' : reais(x.valor_unitario)}</td>
                    <td className="whitespace-nowrap text-right font-mono font-bold">{x.valor_total == null ? <span className="text-atencao-700">sem preço</span> : reais(x.valor_total)}
                      {x.valor_estimado && x.valor_total != null && <span className="block text-[11px] font-normal text-concreto-500">estimado (custo atual)</span>}</td>
                  </tr>))}</tbody>
              </table></div>
              <p className="mt-3 text-xs text-concreto-500">Valor = quantidade × custo médio das compras (OC) do material na obra de origem; sem compra lá, usa a média de todas as obras, depois a última cotação. Passe o mouse no valor unitário para ver de onde veio.</p>
            </>)}
          </Cartao>
          <Cartao titulo="Últimas movimentações">
            {!movs?.length ? <p className="text-sm text-concreto-500">Nenhuma movimentação.</p> : (
              <ul className="divide-y divide-concreto-100 text-sm">{movs.map((m) => {
                const ins = m.insumos as unknown as { codigo: string; descricao: string; unidade: string };
                const saida = m.tipo === 'saida' || Number(m.quantidade) < 0;
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><b className={saida ? 'text-atraso-700' : 'text-ok-700'}>{saida ? '−' : '+'}{num(Math.abs(Number(m.quantidade)), 3)} {ins?.unidade}</b> {ins?.codigo} — {ins?.descricao}
                      <span className="block text-xs text-concreto-500">{ORIGEM[m.origem] ?? m.origem} • {(m.obras as unknown as { codigo: string })?.codigo ?? 'Depósito central'} • {m.observacao}</span></span>
                    <span className="text-xs text-concreto-500">{(m.perfis as unknown as { nome: string })?.nome} • {dataHora(m.criado_em)}</span>
                  </li>);
              })}</ul>)}
          </Cartao>
        </div>
        {pode && (
          <Cartao titulo="Lançar no estoque">
            <FormAcao acao={lancarEstoque} limparAoConcluir className="space-y-3">
              <Campo rotulo="Tipo"><select name="tipo" className="entrada">
                <option value="entrada">Entrada (inventário inicial, devolução)</option><option value="saida">Saída / baixa por consumo</option>
                <option value="ajuste">Ajuste de inventário (+/−)</option><option value="transferencia">Transferência entre locais</option></select></Campo>
              <Campo rotulo="Insumo"><select name="insumo_id" required className="entrada"><option value="">Selecionar…</option>
                {insumos?.map((i) => <option key={i.id} value={i.id}>{i.codigo} — {i.descricao} ({i.unidade})</option>)}</select></Campo>
              <Campo rotulo="Local"><select name="obra_id" className="entrada"><option value="">Depósito central</option>
                {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
              <Campo rotulo="Destino (só transferência)"><select name="destino_id" className="entrada"><option value="">Depósito central</option>
                {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
              <Campo rotulo="Valor unitário (só transferência)" dica="Opcional: em branco, o sistema calcula pelo custo médio das compras do material."><input name="valor_unitario" inputMode="decimal" placeholder="R$ 0,00" className="entrada" /></Campo>
              <Campo rotulo="Quantidade" dica="No ajuste, use negativo para reduzir"><input name="quantidade" required inputMode="decimal" className="entrada" /></Campo>
              <Campo rotulo="Motivo / documento *"><input name="observacao" required className="entrada" placeholder="Inventário 10/2026, consumo na laje…" /></Campo>
              <Botao grande>Registrar</Botao>
            </FormAcao>
          </Cartao>
        )}
      </div>
    </>
  );
}
