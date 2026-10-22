import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { Botao, FormAcao } from '@/components/formulario';
import { data, dataHora } from '@/lib/formato';
import { adicionarFeriado, salvarParametros } from '../acoes';

export const metadata = { title: 'Parâmetros do DP' };

export default async function Parametros() {
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const pode = ['admin', 'rh'].includes(perfil.papel);
  const ano = new Date().getFullYear();
  const [{ data: p }, { data: fer }] = await Promise.all([
    supabase.from('dp_parametros').select('*, perfis:atualizado_por(nome)').eq('id', 1).single(),
    supabase.from('feriados').select('*').gte('data', `${ano}-01-01`).lte('data', `${ano + 1}-12-31`).order('data'),
  ]);
  const n = (v: unknown) => String(v ?? '').replace('.', ',');
  return (
    <>
      <Cabecalho titulo="Parâmetros do DP" sub="Valores usados no cálculo do ponto e da folha. Os valores legais mudam todo ano — confira salário mínimo e faixas do INSS em janeiro." />
      <AbasDP atual="par" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Jornada, horas extras e encargos">
          <FormAcao acao={salvarParametros} className="space-y-3">
            <fieldset disabled={!pode} className="grid grid-cols-2 gap-3">
              <Campo rotulo="HE dias úteis/sábado (%)"><input name="percentual_he_util" defaultValue={n(p?.percentual_he_util)} className="entrada" /></Campo>
              <Campo rotulo="HE domingo/feriado (%)"><input name="percentual_he_domingo" defaultValue={n(p?.percentual_he_domingo)} className="entrada" /></Campo>
              <Campo rotulo="Jornada de sábado (h)" dica="0 = sábado todo é hora extra"><input name="jornada_sabado_horas" defaultValue={n(p?.jornada_sabado_horas)} className="entrada" /></Campo>
              <Campo rotulo="Tolerância (min/dia)" dica="CLT art. 58 §1º: até 10"><input name="tolerancia_minutos" defaultValue={n(p?.tolerancia_minutos)} className="entrada" /></Campo>
              <Campo rotulo="Salário mínimo (R$)" dica="Base da insalubridade"><input name="salario_minimo" defaultValue={n(p?.salario_minimo)} className="entrada" /></Campo>
              <Campo rotulo="Desconto de VT (%)"><input name="desconto_vt_pct" defaultValue={n(p?.desconto_vt_pct)} className="entrada" /></Campo>
              <Campo rotulo="Faixas do INSS (empregado)" className="col-span-2" dica='Lista: [{"ate": teto da faixa, "aliquota": %}] — cálculo progressivo'>
                <textarea name="inss_faixas" rows={5} defaultValue={JSON.stringify(p?.inss_faixas, null, 1)} className="entrada font-mono text-xs" /></Campo>
            </fieldset>
            {pode && <Botao>Salvar parâmetros</Botao>}
            <p className="text-xs text-concreto-500">Divisor de horas: {p?.divisor_horas_mes}. {p?.atualizado_por && <>Última alteração: {dataHora(p.atualizado_em)} por {(p.perfis as unknown as { nome: string })?.nome}.</>}</p>
          </FormAcao>
        </Cartao>
        <Cartao titulo={`Feriados ${ano}–${ano + 1}`}>
          <p className="mb-3 text-sm text-concreto-600">Trabalho em feriado conta como HE 100%. “Facultativo” não altera o cálculo.</p>
          {pode && (
            <FormAcao acao={adicionarFeriado} limparAoConcluir className="mb-4 flex flex-wrap gap-2">
              <input type="date" name="data" required className="entrada w-auto" />
              <input name="descricao" required placeholder="Descrição" className="entrada w-auto flex-1" />
              <select name="ambito" className="entrada w-auto"><option value="municipal">Municipal</option><option value="estadual">Estadual</option><option value="nacional">Nacional</option><option value="facultativo">Facultativo</option></select>
              <Botao variante="secundario">Incluir</Botao>
            </FormAcao>)}
          <div className="max-h-[420px] overflow-y-auto"><table className="tabela"><tbody>
            {fer?.map((f) => <tr key={f.data}><td className="whitespace-nowrap font-mono">{data(f.data)}</td><td>{f.descricao}</td><td className="text-xs text-concreto-500">{f.ambito}</td></tr>)}
          </tbody></table></div>
        </Cartao>
      </div>
    </>
  );
}
