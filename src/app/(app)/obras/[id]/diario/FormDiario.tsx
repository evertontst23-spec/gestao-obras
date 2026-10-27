import { Campo } from '@/components/ui';
import { Botao, FormAcao } from '@/components/formulario';
import { FrentesServico, type Frente } from '@/components/FrentesServico';
import { registrarDiario } from '@/app/(app)/financeiro/acoes';

type D = Partial<Record<'data' | 'clima' | 'servicos_executados' | 'ocorrencias' | 'paralisacoes' | 'necessidades_material' | 'observacoes', string | number | null>> & { frentes?: unknown };
export type FuncRdo = { id: string; nome: string; funcao: string | null; daObra: boolean };

export function FormDiario({ obraId, hoje, d = {}, funcionarios, tarefas }:
  { obraId: string; hoje: string; d?: D; funcionarios: FuncRdo[]; tarefas: { id: string; titulo: string }[] }) {
  const s = (k: keyof D) => (d[k] ?? '') as string;
  const frentes = Array.isArray(d.frentes) ? (d.frentes as Frente[]) : undefined;
  return (
    <FormAcao acao={registrarDiario} className="space-y-3">
      <input type="hidden" name="obra_id" value={obraId} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data"><input type="date" name="data" required defaultValue={s('data') || hoje} max={hoje} className="entrada" /></Campo>
        <Campo rotulo="Clima"><select name="clima" defaultValue={s('clima') || 'ensolarado'} className="entrada">
          <option value="ensolarado">☀ Ensolarado</option><option value="nublado">☁ Nublado</option><option value="chuva_leve">🌦 Chuva leve</option><option value="chuva_forte">🌧 Chuva forte (impraticável)</option></select></Campo>
      </div>
      <FrentesServico funcionarios={funcionarios} tarefas={tarefas} inicial={frentes} />
      <Campo rotulo="Resumo do dia" dica="Opcional — sem resumo, o relatório lista as frentes de serviço"><textarea name="servicos_executados" rows={3} defaultValue={s('servicos_executados').startsWith('• ') ? '' : s('servicos_executados')} className="entrada" /></Campo>
      <Campo rotulo="Ocorrências"><textarea name="ocorrencias" rows={2} defaultValue={s('ocorrencias')} placeholder="Visitas, acidentes, entregas, fiscalização…" className="entrada" /></Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Paralisações"><textarea name="paralisacoes" rows={2} defaultValue={s('paralisacoes')} className="entrada" /></Campo>
        <Campo rotulo="Material necessário"><textarea name="necessidades_material" rows={2} defaultValue={s('necessidades_material')} className="entrada" /></Campo>
      </div>
      <Campo rotulo="Observações"><textarea name="observacoes" rows={2} defaultValue={s('observacoes')} className="entrada" /></Campo>
      <Botao grande>Salvar diário e adicionar fotos</Botao>
    </FormAcao>
  );
}
