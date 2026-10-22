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
