import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Indicador, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { AbasSuprimentos } from '@/components/AbasSuprimentos';
import { lancarEstoque } from '../acoes';
import { num, dataHora } from '@/lib/formato';

export const metadata = { title: 'Estoque' };

const ORIGEM: Record<string, string> = {
  recebimento_oc: 'Recebimento de OC', envio_solicitacao: 'Envio p/ frente de serviço', entrega_epi: 'Entrega de EPI', consumo: 'Consumo / baixa',
  ajuste_inventario: 'Ajuste de inventário', transferencia: 'Transferência', entrada_avulsa: 'Entrada avulsa',
};

export default async function Estoque({ searchParams }: { searchParams: Promise<{ local?: string; q?: string; minimo?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'engenheiro', 'compras', 'almoxarifado');
  const pode = perfil.papel === 'almoxarifado' || perfil.papel === 'admin';
  let q = supabase.from('v_estoque').select('*').order('codigo');
  if (sp.local) q = sp.local === 'central' ? q.is('obra_id', null) : q.eq('obra_id', sp.local);
  if (sp.minimo) q = q.eq('abaixo_minimo', true);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ''); q = q.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`); }
  const [{ data: saldos }, { data: obras }, { data: insumos }, { data: movs }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('insumos').select('id, codigo, descricao, unidade').eq('ativo', true).order('codigo'),
    supabase.from('estoque_movimentos').select('*, insumos(codigo, descricao, unidade), obras(codigo), perfis(nome)').order('criado_em', { ascending: false }).limit(40),
  ]);
  const lista = (saldos ?? []).filter((s) => Number(s.saldo) !== 0 || sp.minimo);
  return (
    <>
      <Cabecalho titulo="Estoque" sub="Saldo por local (depósito central e cada obra), calculado pelas entradas e saídas registradas." />
      <AbasSuprimentos atual="estoque" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Itens com saldo" valor={lista.length} />
        <Indicador rotulo="Abaixo do mínimo" valor={(saldos ?? []).filter((s) => s.abaixo_minimo).length} tom={(saldos ?? []).some((s) => s.abaixo_minimo) ? 'atraso' : 'ok'} href="/suprimentos/estoque?minimo=1" />
        <Indicador rotulo="Locais" valor={new Set((saldos ?? []).map((s) => s.obra_id ?? 'c')).size} />
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
            <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
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
