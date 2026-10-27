import { FormAcao, Botao } from './formulario';
import { devolverLocacao, prorrogarLocacao } from '@/app/(app)/materiais/acoes';
import { data } from '@/lib/formato';

/** Devolver ou prorrogar um item locado que está na obra. */
export function ControleLocacao({ item, solicitacao, fim, hoje, compacto = false }:
  { item: string; solicitacao: string; fim: string; hoje: string; compacto?: boolean }) {
  return (
    <div className={`grid gap-2 ${compacto ? '' : 'rounded border border-sky-200 bg-sky-50 p-2 sm:grid-cols-2'}`}>
      <FormAcao acao={devolverLocacao} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="solicitacao" value={solicitacao} /><input type="hidden" name="item" value={item} />
        <label className="text-[11px] text-concreto-500">Devolvido em<input type="date" name="data" required max={hoje} defaultValue={hoje} className="entrada w-36" /></label>
        {!compacto && <input name="observacao" placeholder="Estado, nº da nota…" className="entrada w-auto min-w-0 flex-1" />}
        <Botao variante="sucesso">Registrar devolução</Botao>
      </FormAcao>
      <FormAcao acao={prorrogarLocacao} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="solicitacao" value={solicitacao} /><input type="hidden" name="item" value={item} />
        <label className="text-[11px] text-concreto-500">{compacto ? 'Prorrogar até' : `Prorrogar até (fim atual ${data(fim)})`}<input type="date" name="fim" required min={fim} className="entrada w-36" /></label>
        {!compacto && <input name="observacao" placeholder="Motivo" className="entrada w-auto min-w-0 flex-1" />}
        <Botao variante="secundario">Prorrogar</Botao>
      </FormAcao>
    </div>
  );
}
