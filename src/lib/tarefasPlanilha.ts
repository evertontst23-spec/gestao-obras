// Leitura de planilha de tarefas (Excel/CSV): detecta o cabeçalho e interpreta cada linha.
import { lerNumero, normalizar } from './planilha';

type Celula = string | number | boolean | Date | null | undefined;
export type CampoTarefa = 'titulo' | 'descricao' | 'local' | 'quantidade' | 'unidade' | 'inicio' | 'fim' | 'responsavel' | 'etapa' | 'prioridade' | 'observacoes';
export const ROTULOS_TAREFA: Record<CampoTarefa, string> = {
  titulo: 'Serviço / tarefa *', descricao: 'Descrição', local: 'Local', quantidade: 'Quantidade', unidade: 'Unidade',
  inicio: 'Início', fim: 'Fim / prazo', responsavel: 'Responsável', etapa: 'Etapa', prioridade: 'Prioridade', observacoes: 'Observações',
};
const PALAVRAS: [CampoTarefa, RegExp][] = [
  ['titulo', /^(servico|servicos|tarefa|tarefas|atividade|atividades|descricao do servico|descricao da atividade|o que fazer|item de servico)$/],
  ['inicio', /^(inicio|data de inicio|data inicio|data inicial|comeco|inicio previsto|de)$/],
  ['fim', /^(fim|termino|data de termino|data fim|data final|conclusao|prazo|entrega|fim previsto|ate)$/],
  ['quantidade', /^(quant|quantidade|qtd|qtde|qde|quant prevista)$/],
  ['unidade', /^(un|und|unid|unidade)$/],
  ['local', /^(local|ambiente|trecho|setor|frente|onde)$/],
  ['responsavel', /^(responsavel|encarregado|resp|quem)$/],
  ['etapa', /^(etapa|fase|grupo|disciplina)$/],
  ['prioridade', /^(prioridade|urgencia)$/],
  ['observacoes', /^(obs|observacao|observacoes|comentario|comentarios)$/],
  ['descricao', /^(descricao|detalhe|detalhes|descricao detalhada|especificacao)$/],
];
export type MapaTarefas = { linha: number; colunas: Partial<Record<CampoTarefa, number>> };

export function detectarCabecalhoTarefas(linhas: Celula[][]): MapaTarefas | null {
  for (let l = 0; l < Math.min(linhas.length, 25); l++) {
    const colunas: Partial<Record<CampoTarefa, number>> = {};
    (linhas[l] ?? []).forEach((c, i) => {
      const t = normalizar(c);
      if (!t) return;
      for (const [campo, re] of PALAVRAS) if (colunas[campo] === undefined && re.test(t)) { colunas[campo] = i; break; }
    });
    // "Descrição" sozinha (sem coluna de serviço) é o próprio serviço
    if (colunas.titulo === undefined && colunas.descricao !== undefined) { colunas.titulo = colunas.descricao; delete colunas.descricao; }
    if (colunas.titulo !== undefined && Object.keys(colunas).length >= 2) return { linha: l, colunas };
  }
  return null;
}

const iso = (a: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
/** Datas: célula de data do Excel, "25/10/2026", "25/10/26", "25/10" (ano atual), "2026-10-25" ou número de série do Excel */
export function lerData(v: Celula, anoPadrao: number): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const d = new Date(v.getTime() + 12 * 3600e3);   // o Excel às vezes entrega 23:59 do dia anterior
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.toISOString().slice(0, 10); }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) { const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anoPadrao; return iso(a, +m[2], +m[1]); }
  return null;
}
export function lerPrioridade(v: Celula): 'baixa' | 'normal' | 'alta' | 'urgente' | null {
  const t = normalizar(v);
  if (!t) return null;
  if (/urgent|critic|imediat/.test(t)) return 'urgente';
  if (/alta|alto|^a$/.test(t)) return 'alta';
  if (/baixa|baixo|^b$/.test(t)) return 'baixa';
  if (/normal|media|medio|^m$|^n$/.test(t)) return 'normal';
  return null;
}
export { lerNumero, normalizar };
