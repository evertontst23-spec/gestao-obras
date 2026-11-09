import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasAlmox } from '@/components/AbasAlmox';
import { Botao, FormAcao } from '@/components/formulario';
import { data, dataHora, hojeISO, num } from '@/lib/formato';
import { devolverFerramenta, emprestarFerramenta } from '../acoes';

export const metadata = { title: 'Ferramentas emprestadas' };
const SIT: Record<string, { r: string; c: string }> = {
  emprestada: { r: 'Emprestada', c: 'bg-atencao-50 text-atencao-800' }, devolvida: { r: 'Devolvida', c: 'bg-ok-50 text-ok-700' },
  danificada: { r: 'Danificada', c: 'bg-atraso-50 text-atraso-700' }, perdida: { r: 'Perdida', c: 'bg-atraso-50 text-atraso-700' },
};

export default async function Ferramentas({ searchParams }: { searchParams: Promise<{ obra?: string; ver?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'almoxarifado', 'compras', 'engenheiro', 'seguranca', 'rh');
  const pode = ['admin', 'almoxarifado'].includes(perfil.papel);
  let q = supabase.from('v_cautelas').select('*').order('retirada_em', { ascending: false }).limit(300);
  if (sp.obra) q = sp.obra === 'central' ? q.is('obra_id', null) : q.eq('obra_id', sp.obra);
  if (sp.ver !== 'todas') q = q.eq('situacao', 'emprestada');
  const [{ data: lista }, { data: obras }, { data: saldos }, { data: funcs }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('v_estoque').select('insumo_id, obra_id, codigo, descricao, saldo').gt('saldo', 0).neq('categoria', 'EPI').order('descricao'),
    supabase.from('funcionarios').select('id, nome, obra_id').eq('ativo', true).order('nome'),
  ]);
  const nomeObra = new Map((obras ?? []).map((o) => [o.id, o.codigo]));
  const abertas = (lista ?? []).filter((c) => c.situacao === 'emprestada');
  const porPessoa = new Map<string, number>();
  abertas.forEach((c) => porPessoa.set(c.funcionario_nome, (porPessoa.get(c.funcionario_nome) ?? 0) + 1));
  return (
    <>
      <Cabecalho titulo="Ferramentas emprestadas" sub="Cautela: cada ferramenta que sai fica no nome do funcionário até voltar. Dano ou perda avisa o comprador." />
      <AbasAlmox atual="ferramentas" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Fora do almoxarifado" valor={abertas.length} />
        <Indicador rotulo="Atrasadas" valor={abertas.filter((c) => c.atrasada).length} tom={abertas.some((c) => c.atrasada) ? 'atraso' : 'ok'} />
        <Indicador rotulo="Funcionários com ferramenta" valor={porPessoa.size} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form className="flex flex-wrap gap-2 text-sm">
            <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todos os locais</option><option value="central">Depósito central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
            <select name="ver" defaultValue={sp.ver ?? ''} className="entrada w-auto"><option value="">Só as emprestadas</option><option value="todas">Todas (com devolvidas)</option></select>
            <button className="rounded-md bg-concreto-800 px-4 font-semibold text-white">Filtrar</button>
          </form>
          {!lista?.length ? <Vazio>Nenhuma ferramenta emprestada.</Vazio> : (
            <div className="space-y-2">{lista.map((c) => (
              <div key={c.id} className={`rounded-lg border bg-superficie p-3 text-sm ${c.atrasada ? 'border-atraso-300' : 'border-concreto-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{c.descricao}</b> — {num(c.quantidade)} {c.unidade} • <b>{c.funcionario_nome}</b>
                    <span className="block text-xs text-concreto-500">nº {c.id} • {c.obra_codigo ?? 'Depósito central'} • saiu {dataHora(c.retirada_em)}{c.previsao_devolucao && ` • devolver até ${data(c.previsao_devolucao)}`}{c.observacao && ` • ${c.observacao}`}</span>
                    {c.devolvido_em && <span className="block text-xs text-concreto-500">voltou {dataHora(c.devolvido_em)}: {num(c.quantidade_devolvida)} em bom estado{c.obs_devolucao && ` — ${c.obs_devolucao}`}</span>}</span>
                  <span className="flex items-center gap-2">{c.atrasada && <Selo cor="bg-atraso-600 text-white">Atrasada</Selo>}<Selo cor={SIT[c.situacao].c}>{SIT[c.situacao].r}</Selo></span>
                </div>
                {pode && c.situacao === 'emprestada' && (
                  <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-sinal-700">registrar devolução</summary>
                    <FormAcao acao={devolverFerramenta} className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-concreto-50 p-2"><input type="hidden" name="cautela" value={c.id} />
                      <Campo rotulo="Voltou em bom estado"><input name="boa" defaultValue={String(Number(c.quantidade)).replace('.', ',')} inputMode="decimal" className="entrada w-24" /></Campo>
                      <Campo rotulo="O restante"><select name="resto" className="entrada w-auto"><option value="danificada">voltou danificado</option><option value="perdida">foi perdido</option></select></Campo>
                      <Campo rotulo="Observação" dica="Obrigatória se não voltou tudo"><input name="observacao" className="entrada" /></Campo>
                      <Botao variante="sucesso">Devolver</Botao>
                    </FormAcao></details>)}
              </div>))}</div>)}
        </div>
        {pode && (
          <Cartao titulo="Emprestar ferramenta">
            <FormAcao acao={emprestarFerramenta} limparAoConcluir className="space-y-3">
              <Campo rotulo="Local (estoque)"><select name="obra_id" className="entrada"><option value="">Depósito central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
              <Campo rotulo="Ferramenta *"><select name="insumo_id" required className="entrada"><option value="">Selecionar…</option>
                {[...new Map((saldos ?? []).map((s) => [s.insumo_id, s])).values()].map((s) => (
                  <option key={s.insumo_id} value={s.insumo_id}>{s.codigo} — {s.descricao} ({(saldos ?? []).filter((x) => x.insumo_id === s.insumo_id).map((x) => `${x.obra_id ? nomeObra.get(x.obra_id) : 'central'}: ${num(x.saldo)}`).join(' • ')})</option>))}</select></Campo>
              <Campo rotulo="Quantidade *"><input name="quantidade" required defaultValue="1" inputMode="decimal" className="entrada" /></Campo>
              <Campo rotulo="Funcionário *"><select name="funcionario_id" required className="entrada"><option value="">Selecionar…</option>{funcs?.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.obra_id ? ` (${nomeObra.get(f.obra_id)})` : ''}</option>)}</select></Campo>
              <Campo rotulo="Devolver até"><input type="date" name="previsao" min={hojeISO()} className="entrada" /></Campo>
              <Campo rotulo="Observação"><input name="observacao" className="entrada" placeholder="Ex.: estado, nº de série" /></Campo>
              <Botao grande>Emprestar</Botao>
            </FormAcao>
          </Cartao>)}
      </div>
    </>
  );
}
