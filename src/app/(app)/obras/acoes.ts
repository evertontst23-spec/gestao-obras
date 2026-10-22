'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, txt } from '@/lib/acoes';

function dadosObra(f: FormData) {
  return {
    codigo: txt(f, 'codigo'),
    nome: txt(f, 'nome'),
    endereco: txt(f, 'endereco'),
    cliente: txt(f, 'cliente'),
    engenheiro_id: txt(f, 'engenheiro_id'),
    encarregado_id: txt(f, 'encarregado_id'),
    data_inicio: txt(f, 'data_inicio'),
    data_prevista_conclusao: txt(f, 'data_prevista_conclusao'),
    situacao: txt(f, 'situacao') ?? 'planejamento',
    exige_aprovacao_material: f.get('exige_aprovacao_material') === 'on',
  };
}

export async function criarObra(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const d = dadosObra(f);
  if (!d.codigo || !d.nome) return { erro: 'Informe código e nome da obra.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from('obras').insert(d).select('id').single();
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/obras');
  redirect(`/obras/${data.id}`);
}

export async function atualizarObra(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id')!;
  const d = dadosObra(f);
  if (!d.codigo || !d.nome) return { erro: 'Informe código e nome da obra.' };
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from('obras').update(d, { count: 'exact' }).eq('id', id);
  if (error) return { erro: mensagemErro(error) };
  if (!count) return { erro: 'Você não tem permissão para editar esta obra.' };
  revalidatePath(`/obras/${id}`);
  return { ok: 'Obra atualizada.' };
}

export async function adicionarEtapa(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const obra_id = txt(f, 'obra_id')!;
  const nome = txt(f, 'nome');
  if (!nome) return { erro: 'Informe o nome da etapa.' };
  const supabase = await criarClienteServidor();
  const { count: n } = await supabase.from('etapas').select('id', { count: 'exact', head: true }).eq('obra_id', obra_id);
  const { error } = await supabase.from('etapas').insert({
    obra_id, nome, ordem: (n ?? 0) + 1, inicio_previsto: txt(f, 'inicio_previsto'), fim_previsto: txt(f, 'fim_previsto'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/obras/${obra_id}`);
  return { ok: 'Etapa adicionada.' };
}

export async function adicionarMembro(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const obra_id = txt(f, 'obra_id')!;
  const usuario_id = txt(f, 'usuario_id');
  if (!usuario_id) return { erro: 'Selecione um colaborador.' };
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('obra_membros').insert({ obra_id, usuario_id, funcao: txt(f, 'funcao'), adicionado_por: user?.id });
  if (error) return { erro: error.code === '23505' ? 'Colaborador já faz parte da equipe.' : mensagemErro(error) };
  revalidatePath(`/obras/${obra_id}`);
  return { ok: 'Colaborador vinculado à obra.' };
}

export async function removerMembro(f: FormData) {
  const obra_id = txt(f, 'obra_id')!;
  const supabase = await criarClienteServidor();
  await supabase.from('obra_membros').delete().eq('obra_id', obra_id).eq('usuario_id', txt(f, 'usuario_id')!);
  revalidatePath(`/obras/${obra_id}`);
}
