import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { salvarFornecedor } from '../acoes';
import { reais } from '@/lib/dominio';

export const metadata = { title: 'Fornecedores' };

/* eslint-disable @typescript-eslint/no-explicit-any */
function Campos({ f }: { f?: any }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {f && <input type="hidden" name="id" value={f.id} />}
      <Campo rotulo="Razão social / nome *" className="sm:col-span-2"><input name="nome" required defaultValue={f?.nome} className="entrada" /></Campo>
      <Campo rotulo="CNPJ / CPF"><input name="documento" defaultValue={f?.documento ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Categoria"><input name="categoria" list="cat-forn" defaultValue={f?.categoria ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Contato"><input name="contato" defaultValue={f?.contato ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Telefone / WhatsApp"><input name="telefone" inputMode="tel" defaultValue={f?.telefone ?? ''} className="entrada" /></Campo>
      <Campo rotulo="E-mail"><input name="email" type="email" defaultValue={f?.email ?? ''} className="entrada" /></Campo>
      <Campo rotulo="PIX"><input name="pix" defaultValue={f?.pix ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Endereço" className="sm:col-span-2 lg:col-span-3"><input name="endereco" defaultValue={f?.endereco ?? ''} className="entrada" /></Campo>
      {f && <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={f.ativo} className="accent-sinal-500" /> Ativo</label>}
      <div className="sm:col-span-2 lg:col-span-4"><Botao variante={f ? 'secundario' : 'primario'}>{f ? 'Salvar' : 'Cadastrar fornecedor'}</Botao></div>
    </div>
  );
}

export default async function Fornecedores({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'compras', 'financeiro', 'almoxarifado', 'engenheiro');
  const pode = ['admin', 'compras', 'financeiro'].includes(perfil.papel);
  let qf = supabase.from('fornecedores').select('*').order('ativo', { ascending: false }).order('nome');
  if (q) qf = qf.or(`nome.ilike.%${q.replace(/[%,()]/g, '')}%,documento.ilike.%${q.replace(/[%,()]/g, '')}%,categoria.ilike.%${q.replace(/[%,()]/g, '')}%`);
  const [{ data: lista }, { data: ocs }] = await Promise.all([qf, supabase.from('ordens_compra').select('fornecedor_id, valor_total').neq('status', 'cancelada')]);
  const total = new Map<string, { n: number; v: number }>();
  (ocs ?? []).forEach((o) => { const t = total.get(o.fornecedor_id) ?? { n: 0, v: 0 }; t.n++; t.v += Number(o.valor_total); total.set(o.fornecedor_id, t); });
  return (
    <>
      <Cabecalho titulo="Fornecedores" sub={`${lista?.length ?? 0} cadastrado(s)`} />
      <datalist id="cat-forn">{['Materiais', 'Aço', 'Concreto', 'Agregados', 'Elétrica', 'Hidráulica', 'EPI', 'Locação de equipamentos', 'Serviços', 'Transporte'].map((c) => <option key={c} value={c} />)}</datalist>
      {pode && <Cartao titulo="Novo fornecedor" className="mb-5"><FormAcao acao={salvarFornecedor} limparAoConcluir><Campos /></FormAcao></Cartao>}
      <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por nome, CNPJ ou categoria…" className="entrada flex-1" /><button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Buscar</button></form>
      {!lista?.length ? <Vazio>Nenhum fornecedor encontrado.</Vazio> : (
        <div className="space-y-2">{lista.map((f) => (
          <details key={f.id} className={`rounded-lg border border-concreto-200 bg-white ${f.ativo ? '' : 'opacity-60'}`}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span><b>{f.nome}</b> <span className="text-xs text-concreto-500">{f.documento} {f.categoria && `• ${f.categoria}`}</span></span>
              <span className="text-xs text-concreto-600">{f.telefone} {total.get(f.id) && <>• {total.get(f.id)!.n} OC(s) • <b>{reais(total.get(f.id)!.v)}</b></>}</span>
            </summary>
            <div className="border-t border-concreto-100 p-4">{pode ? <FormAcao acao={salvarFornecedor}><Campos f={f} /></FormAcao>
              : <p className="text-sm">{f.contato} • {f.email} • {f.endereco}</p>}</div>
          </details>))}
        </div>
      )}
    </>
  );
}
