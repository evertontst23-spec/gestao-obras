'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

function dadosTarefa(f: FormData) {
  return {
    etapa_id: txt(f, 'etapa_id'),
    titulo: txt(f, 'titulo'),
    descricao: txt(f, 'descricao'),
    local: txt(f, 'local'),
    quantidade_prevista: numero(f, 'quantidade_prevista'),
    unidade: txt(f, 'unidade'),
    encarregado_id: txt(f, 'encarregado_id'),
    prioridade: txt(f, 'prioridade') ?? 'normal',
    observacoes: txt(f, 'observacoes'),
    ...(f.has('encarregado_func_id') ? { encarregado_func_id: txt(f, 'encarregado_func_id') } : {}),
    ...(f.has('planilha_item_id') ? { planilha_item_id: txt(f, 'planilha_item_id') } : {}),
  };
}

export async function criarTarefa(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const d = { ...dadosTarefa(f), obra_id: txt(f, 'obra_id'), inicio_previsto: txt(f, 'inicio_previsto'), fim_previsto: txt(f, 'fim_previsto') };
  if (!d.obra_id || !d.titulo || !d.encarregado_id || !d.inicio_previsto || !d.fim_previsto) {
    return { erro: 'Obra, serviço, encarregado responsável e prazos são obrigatórios.' };
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from('tarefas').insert(d).select('id').single();
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/tarefas');
  if (f.get('continuar') === '1') return { ok: 'Tarefa criada e encarregado notificado. Cadastre a próxima.' };
  redirect(`/tarefas/${data.id}`);
}

export async function editarTarefa(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id')!;
  const d = dadosTarefa(f);
  if (!d.titulo || !d.encarregado_id) return { erro: 'Serviço e responsável são obrigatórios.' };
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from('tarefas').update(d, { count: 'exact' }).eq('id', id);
  if (error) return { erro: mensagemErro(error) };
  if (!count) return { erro: 'Você não tem permissão para editar esta tarefa.' };
  revalidatePath(`/tarefas/${id}`);
  redirect(`/tarefas/${id}`);
}

async function chamar(nome: string, args: Record<string, unknown>, tarefa: string, ok: string): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc(nome, args);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/tarefas/${tarefa}`);
  revalidatePath('/campo');
  revalidatePath('/painel');
  return { ok };
}

// ---- Encarregado
export async function confirmarRecebimento(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_confirmar_recebimento', { p_tarefa: t }, t, 'Recebimento confirmado.');
}
export async function iniciarServico(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_iniciar', { p_tarefa: t, p_observacao: txt(f, 'observacao') }, t, 'Serviço iniciado.');
}
export async function atualizarAndamento(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  const pct = numero(f, 'percentual');
  return chamar('tarefa_atualizar_andamento',
    { p_tarefa: t, p_percentual: pct === null ? null : Math.round(pct), p_quantidade: numero(f, 'quantidade'), p_descricao: txt(f, 'descricao') },
    t, 'Andamento atualizado.');
}
export async function registrarImpedimento(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_registrar_impedimento',
    { p_tarefa: t, p_causa: txt(f, 'causa') ?? 'outro', p_descricao: txt(f, 'descricao'), p_paralisar: f.get('paralisar') === 'on' },
    t, 'Impedimento registrado e engenheiro avisado.');
}
export async function concluirServico(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_concluir', { p_tarefa: t, p_descricao: txt(f, 'descricao'), p_quantidade: numero(f, 'quantidade') },
    t, 'Conclusão informada. Aguardando validação do engenheiro.');
}
export async function solicitarNovoPrazo(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_solicitar_reprogramacao',
    { p_tarefa: t, p_inicio: txt(f, 'inicio'), p_fim: txt(f, 'fim'), p_causa: txt(f, 'causa') ?? 'outro', p_justificativa: txt(f, 'justificativa') },
    t, 'Pedido de revisão de prazo enviado ao engenheiro.');
}

// ---- Engenheiro
export async function validarServico(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  const aprovar = f.get('decisao') === 'aprovar';
  return chamar('tarefa_validar', { p_tarefa: t, p_aprovar: aprovar, p_parecer: txt(f, 'parecer') },
    t, aprovar ? 'Serviço aprovado e finalizado.' : 'Serviço devolvido ao encarregado.');
}
export async function reprogramarPrazo(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_reprogramar',
    { p_tarefa: t, p_inicio: txt(f, 'inicio'), p_fim: txt(f, 'fim'), p_causa: txt(f, 'causa') ?? 'outro',
      p_justificativa: txt(f, 'justificativa'), p_reprogramacao: txt(f, 'reprogramacao') },
    t, 'Prazo reprogramado e histórico registrado.');
}
export async function rejeitarNovoPrazo(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('reprogramacao_rejeitar', { p_reprogramacao: txt(f, 'reprogramacao'), p_parecer: txt(f, 'parecer') },
    t, 'Pedido de novo prazo recusado.');
}

// ---- Todos
export async function comentar(_: EstadoAcao, f: FormData) {
  const t = txt(f, 'tarefa')!;
  return chamar('tarefa_comentar', { p_tarefa: t, p_texto: txt(f, 'texto') }, t, 'Comentário registrado.');
}

// ---- Importação de planilha de tarefas por obra
export type LinhaImport = {
  titulo: string; descricao: string | null; local: string | null; quantidade_prevista: number | null; unidade: string | null;
  inicio_previsto: string; fim_previsto: string; encarregado_id: string; etapa_id: string | null; prioridade: string; observacoes: string | null;
};
export async function importarTarefas(obra: string, linhas: LinhaImport[]): Promise<EstadoAcao> {
  if (!obra) return { erro: 'Escolha a obra.' };
  if (!linhas.length) return { erro: 'Nenhuma tarefa para importar.' };
  if (linhas.length > 500) return { erro: 'Importe no máximo 500 tarefas por vez.' };
  const ruim = linhas.findIndex((l) => !l.titulo || l.titulo.trim().length < 3 || !l.inicio_previsto || !l.fim_previsto || l.fim_previsto < l.inicio_previsto || !l.encarregado_id);
  if (ruim >= 0) return { erro: `A tarefa ${ruim + 1} está incompleta (serviço, responsável e prazos são obrigatórios; o fim não pode ser antes do início).` };
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from('tarefas').insert(linhas.map((l) => ({
    obra_id: obra, titulo: l.titulo.trim().slice(0, 300), descricao: l.descricao, local: l.local, quantidade_prevista: l.quantidade_prevista,
    unidade: l.unidade, inicio_previsto: l.inicio_previsto, fim_previsto: l.fim_previsto, encarregado_id: l.encarregado_id,
    etapa_id: l.etapa_id, prioridade: ['baixa', 'normal', 'alta', 'urgente'].includes(l.prioridade) ? l.prioridade : 'normal', observacoes: l.observacoes,
  })), { count: 'exact' });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/tarefas'); revalidatePath('/campo'); revalidatePath('/painel'); revalidatePath(`/obras/${obra}`);
  return { ok: `${count ?? linhas.length} tarefa(s) importada(s). Os encarregados já foram avisados.` };
}
