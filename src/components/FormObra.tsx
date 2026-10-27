import { Campo } from './ui';
import { Botao } from './formulario';
import { SITUACOES_OBRA, type Perfil } from '@/lib/dominio';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CamposObra({ obra, engenheiros, encarregados, rotulo }:
  { obra?: any; engenheiros: Perfil[]; encarregados: Perfil[]; rotulo: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {obra && <input type="hidden" name="id" value={obra.id} />}
      <Campo rotulo="Código *"><input name="codigo" required defaultValue={obra?.codigo} className="entrada" placeholder="OB-2026-01" /></Campo>
      <Campo rotulo="Nome da obra *" className="sm:col-span-2"><input name="nome" required defaultValue={obra?.nome} className="entrada" /></Campo>
      <Campo rotulo="Endereço" className="sm:col-span-2"><input name="endereco" defaultValue={obra?.endereco ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Cliente"><input name="cliente" defaultValue={obra?.cliente ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Engenheiro responsável" dica="Em branco: quem cadastra (se engenheiro)">
        <select name="engenheiro_id" defaultValue={obra?.engenheiro_id ?? ''} className="entrada">
          <option value="">—</option>
          {engenheiros.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Responsável pela obra (encarregado)" dica="Recebe as tarefas da planilha e os avisos da obra">
        <select name="encarregado_id" defaultValue={obra?.encarregado_id ?? ''} className="entrada">
          <option value="">—</option>
          {encarregados.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.papel !== 'encarregado' ? ` (${p.papel === 'admin' ? 'diretoria' : 'engenheiro'})` : ''}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Situação">
        <select name="situacao" defaultValue={obra?.situacao ?? 'planejamento'} className="entrada">
          {Object.entries(SITUACOES_OBRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Data de início"><input type="date" name="data_inicio" defaultValue={obra?.data_inicio ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Conclusão prevista"><input type="date" name="data_prevista_conclusao" defaultValue={obra?.data_prevista_conclusao ?? ''} className="entrada" /></Campo>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="exige_aprovacao_material" defaultChecked={obra?.exige_aprovacao_material ?? true} className="h-4 w-4 accent-sinal-500" />
        Pedidos de material exigem aprovação do engenheiro
      </label>
      <div className="sm:col-span-2 lg:col-span-3"><Botao>{rotulo}</Botao></div>
    </div>
  );
}
