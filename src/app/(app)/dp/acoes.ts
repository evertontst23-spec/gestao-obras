'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

export async function fecharFolha(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('folha_fechar', { p_mes: `${txt(f, 'mes')}-01` });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/folha');
  return { ok: 'Folha fechada. Os valores ficam congelados para esta competência.' };
}

export async function registrarAtestado(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('atestado_registrar', {
    p_func: c.funcionario_id, p_tipo: c.tipo ?? 'medico', p_inicio: c.data_inicio, p_dias: c.dias ? Number(c.dias) : 1,
    p_horas: c.horas ? Number(c.horas.replace(',', '.')) : null, p_cid: c.cid, p_profissional: c.profissional, p_caminho: c.caminho, p_obs: c.observacoes,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/atestados');
  return { ok: 'Atestado registrado — os dias ficam abonados no espelho de ponto.' };
}

export async function salvarParametros(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  let faixas: unknown = null;
  try { faixas = JSON.parse(txt(f, 'inss_faixas') ?? 'null'); } catch { return { erro: 'Faixas do INSS em formato inválido.' }; }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('dp_salvar_parametros', { p: {
    percentual_he_util: numero(f, 'percentual_he_util'), percentual_he_domingo: numero(f, 'percentual_he_domingo'),
    jornada_sabado_horas: numero(f, 'jornada_sabado_horas'), tolerancia_minutos: numero(f, 'tolerancia_minutos'),
    salario_minimo: numero(f, 'salario_minimo'), desconto_vt_pct: numero(f, 'desconto_vt_pct'), valor_passagem: numero(f, 'valor_passagem'),
    ponto_inicio: txt(f, 'ponto_inicio') ?? '', inss_faixas: faixas } });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp', 'layout');
  return { ok: 'Parâmetros salvos.' };
}

export async function adicionarFeriado(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from('feriados').insert({ data: txt(f, 'data'), descricao: txt(f, 'descricao'), ambito: txt(f, 'ambito') ?? 'municipal' });
  if (error) return { erro: error.code === '23505' ? 'Já existe feriado nesta data.' : mensagemErro(error) };
  revalidatePath('/dp/parametros');
  return { ok: 'Feriado incluído.' };
}

// ---------------------------------------------------------------- Correção de ponto e acesso do funcionário
export async function corrigirPonto(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const incluir = [1, 2, 3, 4].map((i) => ({ hora: txt(f, `hora${i}`), tipo: txt(f, `tipo${i}`) })).filter((x) => x.hora);
  const desc = f.getAll('desconsiderar').map((v) => Number(v)).filter(Boolean);
  const { error } = await supabase.rpc('ponto_corrigir_dia', {
    p_func: txt(f, 'func'), p_data: txt(f, 'dia'), p_desconsiderar: desc, p_incluir: incluir,
    p_justificativa: txt(f, 'justificativa'), p_contestacao: txt(f, 'contestacao'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp', 'layout');
  return { ok: 'Ponto corrigido. As marcações originais ficam registradas (riscadas) no espelho.' };
}

export async function responderPedido(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('ponto_contestacao_responder', { p_id: txt(f, 'id'), p_status: txt(f, 'status') ?? 'indeferida', p_resposta: txt(f, 'resposta') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp', 'layout');
  return { ok: 'Resposta enviada — o funcionário vê no link do espelho.' };
}

export async function gerarLinkPonto(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('ponto_link_gerar', { p_func: txt(f, 'func') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/espelho');
  return { ok: 'Link criado. Envie ao funcionário pelo WhatsApp ou copie.' };
}

export async function revogarLinkPonto(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('ponto_link_revogar', { p_func: txt(f, 'func') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/espelho');
  return { ok: 'Link desativado.' };
}
