import type { SupabaseClient } from '@supabase/supabase-js';
import type { FuncRdo } from './FormDiario';
import { TAREFA_ABERTA } from '@/lib/dominio';

/** Funcionários (equipe da obra primeiro) e serviços em aberto, para montar as frentes do RDO */
export async function dadosRdo(supabase: SupabaseClient, obra: string) {
  const [{ data: fs }, { data: ts }] = await Promise.all([
    supabase.from('v_funcionarios').select('id, nome, funcao_nome, obra_id').eq('ativo', true).order('nome'),
    supabase.from('tarefas').select('id, titulo').eq('obra_id', obra).in('status', TAREFA_ABERTA).order('numero'),
  ]);
  const funcionarios: FuncRdo[] = (fs ?? []).map((f) => ({ id: f.id, nome: f.nome, funcao: f.funcao_nome, daObra: f.obra_id === obra }));
  return { funcionarios, tarefas: (ts ?? []) as { id: string; titulo: string }[] };
}
