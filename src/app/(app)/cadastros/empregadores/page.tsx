import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { salvarEmpregador } from '../acoes';

export const metadata = { title: 'Empresas contratantes' };
const TIPO: Record<string, string> = { propria: 'Equipe própria', fornecedora_mao_obra: 'Fornecedora de mão de obra', parceira: 'Empresa parceira (CLT dela)' };
const VINC: Record<string, string> = { clt: 'CLT', terceirizado: 'Terceirizado', clt_parceira: 'CLT de parceira', autonomo: 'Autônomo' };

/* eslint-disable @typescript-eslint/no-explicit-any */
function Campos({ e }: { e?: any }) {
  const n = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {e && <input type="hidden" name="id" value={e.id} />}
      <Campo rotulo="Nome *"><input name="nome" required defaultValue={e?.nome} className="entrada" placeholder="ex.: IDERES" /></Campo>
      <Campo rotulo="Razão social"><input name="razao_social" defaultValue={e?.razao_social ?? ''} className="entrada" /></Campo>
      <Campo rotulo="CNPJ"><input name="cnpj" defaultValue={e?.cnpj ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Tipo"><select name="tipo" defaultValue={e?.tipo ?? 'fornecedora_mao_obra'} className="entrada">{Object.entries(TIPO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      <Campo rotulo="Vínculo dos funcionários"><select name="vinculo_padrao" defaultValue={e?.vinculo_padrao ?? 'terceirizado'} className="entrada">{Object.entries(VINC).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      <Campo rotulo="Taxa administrativa"><select name="taxa_tipo" defaultValue={e?.taxa_tipo ?? 'nenhuma'} className="entrada">
        <option value="nenhuma">Sem taxa</option><option value="percentual_folha">% sobre a folha</option><option value="fixo_funcionario_mes">R$ por funcionário/mês</option></select></Campo>
      <Campo rotulo="Valor da taxa" dica="% ou R$, conforme o tipo"><input name="taxa_valor" inputMode="decimal" defaultValue={n(e?.taxa_valor)} className="entrada" /></Campo>
      <Campo rotulo="Adiantamento (%)"><input name="adiantamento_pct" inputMode="decimal" defaultValue={n(e?.adiantamento_pct ?? 40)} className="entrada" /></Campo>
      <Campo rotulo="Dia do adiantamento"><input name="dia_adiantamento" type="number" min={1} max={31} defaultValue={e?.dia_adiantamento ?? 20} className="entrada" /></Campo>
      <Campo rotulo="Dia do saldo"><input name="dia_saldo" type="number" min={1} max={31} defaultValue={e?.dia_saldo ?? 5} className="entrada" /></Campo>
      <Campo rotulo="Contato"><input name="contato" defaultValue={e?.contato ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Telefone"><input name="telefone" defaultValue={e?.telefone ?? ''} className="entrada" /></Campo>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="fechamento_externo" defaultChecked={e?.fechamento_externo} /> A própria empresa faz o fechamento da folha (o sistema só controla ponto e benefícios)</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="ponto_externo" defaultChecked={e?.ponto_externo} /> O ponto desta empresa é marcado fora do sistema (ex.: Ponto Diário) — sem ponto facial e sem falta automática</label>
      <Campo rotulo="Link do ponto externo" className="sm:col-span-2"><input name="ponto_externo_url" type="url" defaultValue={e?.ponto_externo_url ?? ''} className="entrada" placeholder="https://…" /></Campo>
      {e && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={e.ativo} /> Ativa</label>}
      <Campo rotulo="Observações" className="sm:col-span-2 lg:col-span-4"><input name="observacoes" defaultValue={e?.observacoes ?? ''} className="entrada" /></Campo>
      <div className="sm:col-span-2 lg:col-span-4"><Botao variante={e ? 'secundario' : 'primario'}>{e ? 'Salvar' : 'Cadastrar empresa'}</Botao></div>
    </div>
  );
}

export default async function Empregadores() {
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const pode = ['admin', 'rh', 'financeiro'].includes(perfil.papel);
  const [{ data: lista }, { data: funcs }] = await Promise.all([
    supabase.from('empregadores').select('*').order('ativo', { ascending: false }).order('nome'),
    supabase.from('funcionarios').select('empregador_id, ativo'),
  ]);
  const cont = new Map<string, number>();
  (funcs ?? []).filter((f) => f.ativo && f.empregador_id).forEach((f) => cont.set(f.empregador_id!, (cont.get(f.empregador_id!) ?? 0) + 1));
  const taxa = (e: any) => e.taxa_tipo === 'percentual_folha' ? `taxa ${String(e.taxa_valor).replace('.', ',')}% da folha` : e.taxa_tipo === 'fixo_funcionario_mes' ? `taxa R$ ${Number(e.taxa_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/funcionário/mês` : 'sem taxa';
  return (
    <>
      <Cabecalho titulo="Empresas contratantes" sub="De quem é cada funcionário: equipe própria, fornecedoras de mão de obra e CLTs de empresas parceiras." />
      {!lista?.length ? <Vazio>Nenhuma empresa cadastrada.</Vazio> : (
        <div className="mb-5 space-y-2">{lista.map((e) => (
          <details key={e.id} className={`rounded-lg border border-concreto-200 bg-white ${e.ativo ? '' : 'opacity-60'}`}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span><b>{e.nome}</b> <Selo cor="bg-concreto-100 text-concreto-700">{TIPO[e.tipo]}</Selo>{e.fechamento_externo && <Selo cor="bg-sky-100 text-sky-800">fechamento pela empresa</Selo>}{e.ponto_externo && <Selo cor="bg-atencao-100 text-atencao-800">ponto fora do sistema</Selo>}</span>
              <span className="text-xs text-concreto-600">{taxa(e)} • adiantamento {String(e.adiantamento_pct).replace('.', ',')}% dia {e.dia_adiantamento}, saldo dia {e.dia_saldo} • <Link className="link" href={`/cadastros/funcionarios?empresa=${e.id}`}>{cont.get(e.id) ?? 0} ativo(s)</Link></span>
            </summary>
            <div className="border-t border-concreto-100 p-4">{pode ? <FormAcao acao={salvarEmpregador}><Campos e={e} /></FormAcao> : <p className="text-sm">{e.observacoes}</p>}</div>
          </details>))}
        </div>)}
      {pode && <Cartao titulo="Nova empresa"><FormAcao acao={salvarEmpregador} limparAoConcluir><Campos /></FormAcao></Cartao>}
    </>
  );
}
