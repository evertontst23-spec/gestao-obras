import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Vazio } from '@/components/ui';
import { AbasAlmox } from '@/components/AbasAlmox';
import { Botao, FormAcao } from '@/components/formulario';
import { dataHora, num } from '@/lib/formato';
import { salvarInventario } from '../acoes';

export const metadata = { title: 'Inventário' };

export default async function Inventario({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'almoxarifado', 'compras', 'engenheiro');
  const pode = ['admin', 'almoxarifado'].includes(perfil.papel);
  const local = sp.local ?? 'central';
  const obraId = local === 'central' ? null : local;
  let q = supabase.from('v_estoque').select('insumo_id, codigo, descricao, unidade, categoria, saldo, ultimo_movimento').order('descricao');
  q = obraId ? q.eq('obra_id', obraId) : q.is('obra_id', null);
  const [{ data: saldos }, { data: obras }, { data: ajustes }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('estoque_movimentos').select('id, quantidade, observacao, criado_em, insumos(descricao, unidade), obras(codigo)').eq('origem', 'ajuste_inventario').order('criado_em', { ascending: false }).limit(20),
  ]);
  const lista = (saldos ?? []).filter((s) => Number(s.saldo) !== 0);
  const nomeLocal = obraId ? (obras ?? []).find((o) => o.id === obraId)?.nome ?? '' : 'Depósito central';
  return (
    <>
      <Cabecalho titulo="Inventário" sub="Conte o que tem fisicamente, digite a quantidade e salve: o sistema ajusta só o que estiver diferente." />
      <AbasAlmox atual="inventario" />
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <select name="local" defaultValue={local} className="entrada w-auto"><option value="central">Depósito central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <button className="rounded-md bg-concreto-800 px-4 font-semibold text-white">Abrir contagem</button>
      </form>
      <Cartao titulo={`Contagem — ${nomeLocal}`} acoes={<span className="text-xs text-concreto-500">deixe em branco o que não contou</span>}>
        {!lista.length ? <Vazio>Nenhum item com saldo neste local.</Vazio> : (
          <FormAcao acao={salvarInventario} className="space-y-3"><input type="hidden" name="obra_id" value={obraId ?? ''} />
            <div className="overflow-x-auto"><table className="tabela">
              <thead><tr><th>Item</th><th className="text-right">No sistema</th><th>Contado</th><th>Último movimento</th></tr></thead>
              <tbody>{lista.map((s) => (
                <tr key={s.insumo_id}><td>{s.descricao}<div className="text-xs text-concreto-500">{s.codigo} • {s.categoria}</div></td>
                  <td className="whitespace-nowrap text-right font-mono">{num(s.saldo, 3)} {s.unidade}</td>
                  <td><input type="hidden" name="insumo_id" value={s.insumo_id} /><input name="contado" inputMode="decimal" disabled={!pode} className="entrada w-28 py-1" aria-label={`Contado de ${s.descricao}`} /></td>
                  <td className="whitespace-nowrap text-xs text-concreto-500">{dataHora(s.ultimo_movimento)}</td></tr>))}</tbody>
            </table></div>
            {pode && <div className="flex flex-wrap items-end gap-2"><Campo rotulo="Observação"><input name="observacao" className="entrada" placeholder="Ex.: inventário de sexta" /></Campo><Botao>Salvar inventário</Botao></div>}
          </FormAcao>)}
      </Cartao>
      <Cartao titulo="Últimos ajustes de inventário" className="mt-5">
        {!ajustes?.length ? <Vazio>Nenhum ajuste ainda.</Vazio> : (
          <ul className="divide-y divide-concreto-100 text-sm">{ajustes.map((a) => {
            const ins = a.insumos as unknown as { descricao: string; unidade: string };
            return <li key={a.id} className="py-2"><b className={Number(a.quantidade) < 0 ? 'text-atraso-700' : 'text-ok-700'}>{Number(a.quantidade) > 0 ? '+' : ''}{num(a.quantidade, 3)} {ins?.unidade}</b> {ins?.descricao} • {(a.obras as unknown as { codigo: string } | null)?.codigo ?? 'Depósito central'}<span className="block text-xs text-concreto-500">{a.observacao} • {dataHora(a.criado_em)}</span></li>;
          })}</ul>)}
      </Cartao>
    </>
  );
}
