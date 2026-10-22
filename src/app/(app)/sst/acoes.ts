'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro } from '@/lib/acoes';

export type RespostaPonto = { reconhecido: boolean; duplicado?: boolean; nome?: string; matricula?: string; tipo?: string; hora?: string; confianca?: number; hash?: string; erro?: string };

export async function pontoFacial(descritor: number[], obra: string | null, lat: number | null, lng: number | null, prec: number | null): Promise<RespostaPonto> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('ponto_registrar_facial', { p_descritor: descritor, p_obra: obra, p_lat: lat, p_lng: lng, p_precisao: prec });
  if (error) return { reconhecido: false, erro: mensagemErro(error) };
  revalidatePath('/dp/ponto');
  return data as RespostaPonto;
}

export async function pontoManual(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const data = String(f.get('data') ?? ''), hora = String(f.get('hora') ?? '');
  const { error } = await supabase.rpc('ponto_registrar_manual', {
    p_func: f.get('funcionario_id'), p_momento: `${data}T${hora}:00-03:00`, p_tipo: f.get('tipo'), p_justificativa: f.get('justificativa'), p_obra: f.get('obra_id') || null,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/dp/ponto');
  return { ok: 'Registro manual lançado (fica marcado como manual, com justificativa).' };
}

export async function cadastrarBiometria(func: string, descritor: number[], termo: string): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('biometria_cadastrar', { p_func: func, p_descritor: descritor, p_consentimento: true, p_termo: termo });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/cadastros/funcionarios/${func}`);
  return { ok: 'Biometria cadastrada com o consentimento registrado.' };
}

export async function removerBiometria(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const id = String(f.get('funcionario_id'));
  const { error } = await supabase.rpc('biometria_remover', { p_func: id, p_motivo: f.get('motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/cadastros/funcionarios/${id}`);
  return { ok: 'Biometria removida.' };
}

export async function entregarEPI(d: { funcionario: string; local: string | null; itens: { insumo_id: string; quantidade: number }[]; motivo: string;
  confirmacao: 'assinatura' | 'facial'; assinatura: string | null; descritor: number[] | null; obs: string | null }): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('epi_registrar_entrega', {
    p_func: d.funcionario, p_local: d.local, p_itens: d.itens, p_motivo: d.motivo, p_confirmacao: d.confirmacao,
    p_assinatura: d.assinatura, p_descritor: d.descritor, p_obs: d.obs,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/sst/epi', 'layout');
  return { ok: 'Entrega registrada na ficha de EPI.', id: data as string };
}

export async function registrarDDS(d: { obra: string; data: string; hora: string | null; duracao: number | null; tema: string; conteudo: string | null;
  local: string | null; participantes: string[]; foto: string | null; obs: string | null }): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('dds_registrar', {
    p_obra: d.obra, p_data: d.data, p_hora: d.hora, p_duracao: d.duracao, p_tema: d.tema, p_conteudo: d.conteudo,
    p_local: d.local, p_participantes: d.participantes, p_foto: d.foto, p_obs: d.obs,
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/sst/dds');
  return { ok: 'DDS registrado.', id: data as string };
}

export async function emitirOS(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const lista = (k: string) => String(f.get(k) ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('os_emitir', {
    p_func: f.get('funcionario_id'), p_atividades: f.get('atividades'), p_riscos: lista('riscos'), p_medidas: f.get('medidas'),
    p_epis: lista('epis'), p_proibicoes: f.get('proibicoes'), p_emergencia: f.get('emergencia'),
  });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/sst/os');
  return { ok: 'Ordem de Serviço emitida.', id: data as string };
}

export async function cienciaOS(os: string, assinatura: string): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('os_registrar_ciencia', { p_os: os, p_assinatura: assinatura });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/sst/os/${os}`);
  return { ok: 'Ciência registrada.' };
}
