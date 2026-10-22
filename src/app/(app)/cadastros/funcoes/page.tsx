import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { salvarFuncao } from '../acoes';
import { reais } from '@/lib/dominio';

export const metadata = { title: 'Funções e salários' };

/* eslint-disable @typescript-eslint/no-explicit-any */
function CamposFuncao({ f }: { f?: any }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {f && <input type="hidden" name="id" value={f.id} />}
      <Campo rotulo="Função *" className="sm:col-span-2"><input name="nome" required defaultValue={f?.nome} className="entrada" placeholder="Pedreiro, Servente, Carpinteiro…" /></Campo>
      <Campo rotulo="CBO"><input name="cbo" defaultValue={f?.cbo ?? ''} className="entrada" placeholder="7152-10" /></Campo>
      <Campo rotulo="Salário base (R$)"><input name="salario_base" inputMode="decimal" defaultValue={f?.salario_base ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Jornada diária (h)"><input name="carga_diaria_horas" inputMode="decimal" defaultValue={f?.carga_diaria_horas ?? 8} className="entrada" /></Campo>
      <Campo rotulo="Vale-alimentação/dia"><input name="vale_alimentacao_dia" inputMode="decimal" defaultValue={f?.vale_alimentacao_dia ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Vale-transporte/dia"><input name="vale_transporte_dia" inputMode="decimal" defaultValue={f?.vale_transporte_dia ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Insalubridade (%)"><input name="adicional_insalubridade_pct" inputMode="decimal" defaultValue={f?.adicional_insalubridade_pct ?? 0} className="entrada" /></Campo>
      <Campo rotulo="EPIs obrigatórios" className="sm:col-span-2" dica="Separe por vírgula — usados na entrega de EPI e na Ordem de Serviço">
        <input name="epis_obrigatorios" defaultValue={(f?.epis_obrigatorios ?? []).join(', ')} className="entrada" placeholder="Capacete, Bota, Luva, Óculos" /></Campo>
      <Campo rotulo="Riscos da função" className="sm:col-span-2" dica="Separe por vírgula — usados na Ordem de Serviço (NR-01)">
        <input name="riscos" defaultValue={(f?.riscos ?? []).join(', ')} className="entrada" placeholder="Queda de nível, Ruído, Poeira" /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="adicional_periculosidade" defaultChecked={f?.adicional_periculosidade} className="accent-sinal-500" /> Periculosidade (30%)</label>
      {f && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={f.ativo} className="accent-sinal-500" /> Ativa</label>}
      <div className="sm:col-span-2 lg:col-span-4"><Botao variante={f ? 'secundario' : 'primario'}>{f ? 'Salvar' : 'Cadastrar função'}</Botao></div>
    </div>
  );
}

export default async function Funcoes() {
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const pode = perfil.papel === 'admin' || perfil.papel === 'rh';
  const [{ data: funcoes }, { data: qtd }] = await Promise.all([
    supabase.from('funcoes').select('*').order('ativo', { ascending: false }).order('nome'),
    supabase.from('funcionarios').select('funcao_id').eq('ativo', true),
  ]);
  const contagem = new Map<string, number>();
  (qtd ?? []).forEach((r) => contagem.set(r.funcao_id, (contagem.get(r.funcao_id) ?? 0) + 1));
  return (
    <>
      <Cabecalho titulo="Funções e tabela salarial" sub="Cadastro único por cargo: o funcionário herda salário, benefícios, EPIs e riscos da função." />
      {pode && <Cartao titulo="Nova função" className="mb-5"><FormAcao acao={salvarFuncao} limparAoConcluir><CamposFuncao /></FormAcao></Cartao>}
      {!funcoes?.length ? <Vazio>Nenhuma função cadastrada.</Vazio> : (
        <div className="space-y-2">
          {funcoes.map((f) => (
            <details key={f.id} className={`rounded-lg border border-concreto-200 bg-white ${f.ativo ? '' : 'opacity-60'}`}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span><b>{f.nome}</b> {f.cbo && <span className="text-xs text-concreto-500">CBO {f.cbo}</span>}</span>
                <span className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono font-bold">{reais(f.salario_base)}</span>
                  <span className="text-xs text-concreto-500">{f.carga_diaria_horas}h/dia • VA {reais(f.vale_alimentacao_dia)} • VT {reais(f.vale_transporte_dia)}</span>
                  {f.adicional_periculosidade && <Selo cor="bg-atraso-50 text-atraso-700">Periculosidade</Selo>}
                  {Number(f.adicional_insalubridade_pct) > 0 && <Selo cor="bg-atencao-50 text-atencao-700">Insalubridade {f.adicional_insalubridade_pct}%</Selo>}
                  <Selo cor="bg-concreto-100 text-concreto-700">{contagem.get(f.id) ?? 0} ativo(s)</Selo>
                </span>
              </summary>
              <div className="border-t border-concreto-100 p-4">
                {pode ? <FormAcao acao={salvarFuncao}><CamposFuncao f={f} /></FormAcao> : (
                  <p className="text-sm text-concreto-600">EPIs: {f.epis_obrigatorios.join(', ') || '—'} • Riscos: {f.riscos.join(', ') || '—'}</p>)}
              </div>
            </details>))}
        </div>
      )}
    </>
  );
}
