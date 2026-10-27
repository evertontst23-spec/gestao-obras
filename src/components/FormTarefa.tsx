import { Campo } from './ui';
import { PRIORIDADES, UNIDADES, type Perfil } from '@/lib/dominio';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CamposTarefa({ tarefa, etapas, encarregados, comPrazo, itens = [] }:
  { tarefa?: any; etapas: { id: string; nome: string }[]; encarregados: Perfil[]; comPrazo: boolean;
    itens?: { id: string; codigo: string | null; descricao: string; unidade: string | null; saldo: number }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {itens.length > 0 && (
        <Campo rotulo="Item da planilha da obra" className="sm:col-span-2 lg:col-span-4"
          dica="Ao vincular, a quantidade executada na tarefa vira avanço do item. Quantidade e unidade são preenchidas pelo saldo do item, se deixadas em branco.">
          <select name="planilha_item_id" defaultValue={tarefa?.planilha_item_id ?? ''} className="entrada">
            <option value="">— sem vínculo —</option>
            {itens.map((i) => <option key={i.id} value={i.id}>{i.codigo ? `${i.codigo} — ` : ''}{i.descricao.slice(0, 90)} (saldo {Number(i.saldo).toLocaleString('pt-BR')} {i.unidade ?? ''})</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Serviço *" className="sm:col-span-2 lg:col-span-4">
        <input name="titulo" required minLength={3} defaultValue={tarefa?.titulo} className="entrada" placeholder="Ex.: Execução de alvenaria do 2º pavimento" />
      </Campo>
      <Campo rotulo="Etapa">
        <select name="etapa_id" defaultValue={tarefa?.etapa_id ?? ''} className="entrada">
          <option value="">—</option>{etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Local de execução" className="lg:col-span-2" dica="Bloco, pavimento, apartamento, ambiente ou setor">
        <input name="local" defaultValue={tarefa?.local ?? ''} className="entrada" placeholder="Bloco A • 2º pavimento" />
      </Campo>
      <Campo rotulo="Prioridade">
        <select name="prioridade" defaultValue={tarefa?.prioridade ?? 'normal'} className="entrada">
          {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Responsável *" className="sm:col-span-2">
        <select name="encarregado_id" required defaultValue={tarefa?.encarregado_id ?? ''} className="entrada">
          <option value="" disabled>Selecionar…</option>
          {encarregados.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Quantidade prevista">
        <input name="quantidade_prevista" inputMode="decimal" defaultValue={tarefa?.quantidade_prevista ?? ''} className="entrada" />
      </Campo>
      <Campo rotulo="Unidade">
        <input name="unidade" list="unidades" defaultValue={tarefa?.unidade ?? ''} className="entrada" />
        <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      </Campo>
      {comPrazo && (<>
        <Campo rotulo="Início previsto *"><input type="date" name="inicio_previsto" required className="entrada" /></Campo>
        <Campo rotulo="Data limite de conclusão *"><input type="date" name="fim_previsto" required className="entrada" /></Campo>
      </>)}
      <Campo rotulo="Descrição / critérios de execução" className="sm:col-span-2 lg:col-span-4">
        <textarea name="descricao" rows={3} defaultValue={tarefa?.descricao ?? ''} className="entrada" placeholder="Executar conforme projeto, garantindo alinhamento, prumo e qualidade." />
      </Campo>
      <Campo rotulo="Observações" className="sm:col-span-2 lg:col-span-4">
        <textarea name="observacoes" rows={2} defaultValue={tarefa?.observacoes ?? ''} className="entrada" />
      </Campo>
    </div>
  );
}
