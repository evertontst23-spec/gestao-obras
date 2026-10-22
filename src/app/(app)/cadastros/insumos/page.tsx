import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { salvarInsumo } from '../acoes';
import { CATEGORIAS_INSUMO, UNIDADES } from '@/lib/dominio';
import { num } from '@/lib/formato';

export const metadata = { title: 'Insumos' };

/* eslint-disable @typescript-eslint/no-explicit-any */
function Campos({ i }: { i?: any }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {i && <input type="hidden" name="id" value={i.id} />}
      <Campo rotulo="Código *"><input name="codigo" required defaultValue={i?.codigo} className="entrada font-mono uppercase" placeholder="CIM-01" /></Campo>
      <Campo rotulo="Descrição *" className="sm:col-span-1 lg:col-span-3"><input name="descricao" required defaultValue={i?.descricao} className="entrada" /></Campo>
      <Campo rotulo="Unidade *"><input name="unidade" required list="un-ins" defaultValue={i?.unidade ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Categoria"><select name="categoria" defaultValue={i?.categoria ?? 'Material'} className="entrada">{CATEGORIAS_INSUMO.map((c) => <option key={c}>{c}</option>)}</select></Campo>
      <Campo rotulo="Estoque mínimo" dica="Abaixo disso, compras e almoxarifado são avisados"><input name="estoque_minimo" inputMode="decimal" defaultValue={i?.estoque_minimo ?? 0} className="entrada" /></Campo>
      <Campo rotulo="CA (se EPI)"><input name="ca" defaultValue={i?.ca ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Validade do CA"><input type="date" name="ca_validade" defaultValue={i?.ca_validade ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Troca a cada (dias)" dica="EPI: periodicidade de substituição"><input name="vida_util_dias" inputMode="numeric" defaultValue={i?.vida_util_dias ?? ''} className="entrada" /></Campo>
      {i && <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={i.ativo} className="accent-sinal-500" /> Ativo</label>}
      <div className="sm:col-span-2 lg:col-span-6"><Botao variante={i ? 'secundario' : 'primario'}>{i ? 'Salvar' : 'Cadastrar insumo'}</Botao></div>
    </div>
  );
}

export default async function Insumos({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'compras', 'almoxarifado', 'engenheiro');
  const pode = perfil.papel === 'admin' || perfil.papel === 'compras';
  let q = supabase.from('insumos').select('*').order('categoria').order('codigo');
  if (sp.cat) q = q.eq('categoria', sp.cat);
  if (sp.q) { const t = sp.q.replace(/[%,()]/g, ''); q = q.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`); }
  const [{ data: lista }, { data: est }] = await Promise.all([q, supabase.from('v_estoque').select('insumo_id, saldo')]);
  const saldo = new Map<string, number>();
  (est ?? []).forEach((e) => saldo.set(e.insumo_id, (saldo.get(e.insumo_id) ?? 0) + Number(e.saldo)));
  return (
    <>
      <Cabecalho titulo="Insumos" sub="Código único por insumo — usado nos pedidos, cotações, estoque e EPI. Só o comprador cadastra." />
      <datalist id="un-ins">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      {pode && <Cartao titulo="Novo insumo" className="mb-5"><FormAcao acao={salvarInsumo} limparAoConcluir><Campos /></FormAcao></Cartao>}
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Código ou descrição…" className="entrada flex-1" />
        <select name="cat" defaultValue={sp.cat ?? ''} className="entrada w-auto"><option value="">Todas as categorias</option>{CATEGORIAS_INSUMO.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      {!lista?.length ? <Vazio>Nenhum insumo encontrado.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Descrição</th><th>Categoria</th><th>Un.</th><th className="text-right">Estoque total</th><th className="text-right">Mínimo</th><th></th></tr></thead>
            <tbody>{lista.map((i) => {
              const s = saldo.get(i.id) ?? 0;
              return (
                <tr key={i.id} className={i.ativo ? '' : 'opacity-50'}>
                  <td className="font-mono font-bold">{i.codigo}</td>
                  <td>{i.descricao}{i.ca && <span className="ml-1 text-xs text-concreto-500">CA {i.ca}</span>}</td>
                  <td><Selo cor={i.categoria === 'EPI' ? 'bg-sky-100 text-sky-800' : 'bg-concreto-100 text-concreto-700'}>{i.categoria}</Selo></td>
                  <td>{i.unidade}</td>
                  <td className={`text-right font-mono ${Number(i.estoque_minimo) > 0 && s < Number(i.estoque_minimo) ? 'font-bold text-atraso-700' : ''}`}>{num(s, 3)}</td>
                  <td className="text-right font-mono text-concreto-500">{num(i.estoque_minimo, 3)}</td>
                  <td>{pode && <details><summary className="link cursor-pointer text-xs">editar</summary>
                    <div className="mt-2 w-[min(80vw,900px)]"><FormAcao acao={salvarInsumo}><Campos i={i} /></FormAcao></div></details>}</td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
