import { Campo } from '@/components/ui';
import { Botao, FormAcao } from '@/components/formulario';
import { registrarDiario } from '@/app/(app)/financeiro/acoes';

type D = Partial<Record<'data' | 'clima' | 'equipe_presente' | 'equipe_descricao' | 'servicos_executados' | 'ocorrencias' | 'paralisacoes' | 'necessidades_material' | 'observacoes', string | number | null>>;
export function FormDiario({ obraId, hoje, d = {}, equipeSugerida }: { obraId: string; hoje: string; d?: D; equipeSugerida?: number }) {
  const s = (k: keyof D) => (d[k] ?? '') as string;
  return (
    <FormAcao acao={registrarDiario} className="space-y-3">
      <input type="hidden" name="obra_id" value={obraId} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data"><input type="date" name="data" required defaultValue={s('data') || hoje} max={hoje} className="entrada" /></Campo>
        <Campo rotulo="Clima"><select name="clima" defaultValue={s('clima') || 'ensolarado'} className="entrada">
          <option value="ensolarado">☀ Ensolarado</option><option value="nublado">☁ Nublado</option><option value="chuva_leve">🌦 Chuva leve</option><option value="chuva_forte">🌧 Chuva forte (impraticável)</option></select></Campo>
        <Campo rotulo="Equipe presente" dica={equipeSugerida ? `${equipeSugerida} pelo ponto de hoje` : undefined}><input type="number" min={0} name="equipe_presente" defaultValue={s('equipe_presente') || (equipeSugerida ?? '')} className="entrada" /></Campo>
        <Campo rotulo="Composição da equipe"><input name="equipe_descricao" defaultValue={s('equipe_descricao')} placeholder="ex.: 3 pedreiros, 4 serventes" className="entrada" /></Campo>
      </div>
      <Campo rotulo="Serviços executados"><textarea name="servicos_executados" required rows={4} defaultValue={s('servicos_executados')} className="entrada" /></Campo>
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
