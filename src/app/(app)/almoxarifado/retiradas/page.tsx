import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Vazio } from '@/components/ui';
import { AbasAlmox } from '@/components/AbasAlmox';
import { Botao, FormAcao } from '@/components/formulario';
import { dataHora, num } from '@/lib/formato';
import { registrarRetirada } from '../acoes';

export const metadata = { title: 'Retiradas e devoluções' };

export default async function Retiradas({ searchParams }: { searchParams: Promise<{ obra?: string; func?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'almoxarifado', 'compras', 'engenheiro');
  const pode = ['admin', 'almoxarifado'].includes(perfil.papel);
  let q = supabase.from('estoque_movimentos').select('id, tipo, quantidade, origem, observacao, destino, criado_em, funcionario_id, insumos(codigo, descricao, unidade), obras(codigo), funcionarios(nome), perfis(nome)')
    .in('origem', ['retirada', 'devolucao']).order('criado_em', { ascending: false }).limit(100);
  if (sp.obra) q = sp.obra === 'central' ? q.is('obra_id', null) : q.eq('obra_id', sp.obra);
  if (sp.func) q = q.eq('funcionario_id', sp.func);
  const [{ data: movs }, { data: obras }, { data: saldos }, { data: funcs }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('v_estoque').select('insumo_id, obra_id, codigo, descricao, unidade, saldo, local_nome').gt('saldo', 0).order('descricao'),
    supabase.from('funcionarios').select('id, nome, obra_id').eq('ativo', true).order('nome'),
  ]);
  const nomeObra = new Map((obras ?? []).map((o) => [o.id, o.codigo]));
  return (
    <>
      <Cabecalho titulo="Retiradas e devoluções" sub="Material que sai do almoxarifado na mão do funcionário (com o serviço) e sobra que volta." />
      <AbasAlmox atual="retiradas" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form className="flex flex-wrap gap-2 text-sm">
            <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todos os locais</option><option value="central">Depósito central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
            <select name="func" defaultValue={sp.func ?? ''} className="entrada w-auto"><option value="">Todos os funcionários</option>{funcs?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            <button className="rounded-md bg-concreto-800 px-4 font-semibold text-white">Filtrar</button>
          </form>
          <Cartao titulo="Histórico">
            {!movs?.length ? <Vazio>Nenhuma retirada registrada.</Vazio> : (
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Quando</th><th>Material</th><th className="text-right">Qtd.</th><th>Funcionário</th><th>Serviço / obs.</th><th>Local</th></tr></thead>
                <tbody>{movs.map((m) => {
                  const ins = m.insumos as unknown as { codigo: string; descricao: string; unidade: string };
                  const dev = m.origem === 'devolucao';
                  return (
                    <tr key={m.id}><td className="whitespace-nowrap text-xs">{dataHora(m.criado_em)}</td><td>{ins?.descricao}<div className="text-xs text-concreto-500">{ins?.codigo}</div></td>
                      <td className={`whitespace-nowrap text-right font-mono font-bold ${dev ? 'text-ok-700' : 'text-atraso-700'}`}>{dev ? '+' : '−'}{num(Math.abs(Number(m.quantidade)), 3)} {ins?.unidade}</td>
                      <td className="text-sm">{(m.funcionarios as unknown as { nome: string } | null)?.nome ?? '—'}<div className="text-[11px] text-concreto-500">{dev ? 'devolveu' : 'retirou'} • lançado por {(m.perfis as unknown as { nome: string } | null)?.nome}</div></td>
                      <td className="text-xs">{m.destino ?? ''}{m.destino && <br />}<span className="text-concreto-500">{m.observacao}</span></td>
                      <td className="text-xs">{(m.obras as unknown as { codigo: string } | null)?.codigo ?? 'Depósito central'}</td></tr>);
                })}</tbody>
              </table></div>)}
          </Cartao>
        </div>
        {pode && (
          <Cartao titulo="Registrar">
            <FormAcao acao={registrarRetirada} limparAoConcluir className="space-y-3">
              <Campo rotulo="O que aconteceu"><select name="tipo" className="entrada"><option value="retirada">Retirada (saiu do estoque)</option><option value="devolucao">Devolução de sobra (voltou)</option></select></Campo>
              <Campo rotulo="Local (estoque)"><select name="obra_id" className="entrada"><option value="">Depósito central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
              <Campo rotulo="Material *" dica="Mostra o que tem saldo (local • saldo)"><select name="insumo_id" required className="entrada"><option value="">Selecionar…</option>
                {[...new Map((saldos ?? []).map((s) => [s.insumo_id, s])).values()].map((s) => (
                  <option key={s.insumo_id} value={s.insumo_id}>{s.codigo} — {s.descricao} ({(saldos ?? []).filter((x) => x.insumo_id === s.insumo_id).map((x) => `${x.obra_id ? nomeObra.get(x.obra_id) : 'central'}: ${num(x.saldo)}`).join(' • ')})</option>))}</select></Campo>
              <Campo rotulo="Quantidade *"><input name="quantidade" required inputMode="decimal" className="entrada" /></Campo>
              <Campo rotulo="Funcionário *"><select name="funcionario_id" required className="entrada"><option value="">Selecionar…</option>{funcs?.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.obra_id ? ` (${nomeObra.get(f.obra_id)})` : ''}</option>)}</select></Campo>
              <Campo rotulo="Para qual serviço" dica="Só na retirada"><input name="destino" className="entrada" placeholder="Ex.: calçada trecho 2, banheiro" /></Campo>
              <Campo rotulo="Observação"><input name="observacao" className="entrada" /></Campo>
              <Botao grande>Registrar</Botao>
            </FormAcao>
          </Cartao>)}
      </div>
    </>
  );
}
