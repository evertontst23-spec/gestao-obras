'use server';
import { revalidatePath } from 'next/cache';
import { criarClienteServidor } from '@/lib/supabase/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { type EstadoAcao, dinheiro, mensagemErro, txt } from '@/lib/acoes';
import type { Papel } from '@/lib/dominio';

const PAPEIS_VALIDOS: Papel[] = ['admin', 'engenheiro', 'encarregado', 'compras', 'almoxarifado', 'seguranca', 'rh', 'financeiro'];

async function exigirAdmin() {
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('perfis').select('papel, ativo').eq('id', user.id).single();
  return data?.papel === 'admin' && data.ativo ? supabase : null;
}

export async function cadastrarUsuario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  if (!(await exigirAdmin())) return { erro: 'Apenas a diretoria cadastra usuários.' };
  const email = txt(f, 'email')?.toLowerCase();
  const senha = (f.get('senha') as string) ?? '';
  const nome = txt(f, 'nome');
  const papel = txt(f, 'papel') as Papel;
  if (!email || !nome) return { erro: 'Informe nome e e-mail.' };
  if (senha.length < 8) return { erro: 'A senha inicial precisa ter pelo menos 8 caracteres.' };
  if (!PAPEIS_VALIDOS.includes(papel)) return { erro: 'Perfil inválido.' };

  const admin = criarClienteAdmin();
  const { error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { nome, telefone: txt(f, 'telefone') },
    app_metadata: { papel },   // lido pelo gatilho que cria o perfil
  });
  if (error) return { erro: error.message.includes('already') ? 'Já existe um usuário com este e-mail.' : error.message };
  revalidatePath('/usuarios');
  return { ok: `${nome} cadastrado. Entregue o e-mail e a senha inicial pessoalmente.` };
}

export async function atualizarUsuario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await exigirAdmin();
  if (!supabase) return { erro: 'Apenas a diretoria altera usuários.' };
  const id = txt(f, 'id')!;
  const papel = txt(f, 'papel') as Papel;
  if (!PAPEIS_VALIDOS.includes(papel)) return { erro: 'Perfil inválido.' };
  const { data: { user } } = await supabase.auth.getUser();
  const ativo = f.get('ativo') === 'on';
  if (id === user?.id && (!ativo || papel !== 'admin')) return { erro: 'Você não pode remover seu próprio acesso de administrador.' };
  const { error } = await supabase.from('perfis').update({ nome: txt(f, 'nome'), telefone: txt(f, 'telefone'), papel, ativo }).eq('id', id);
  if (error) return { erro: mensagemErro(error) };
  const { error: e2 } = await supabase.rpc('perfil_definir_coordenador', { p_usuario: id, p_coordenador: f.get('coordenador_compras') === 'on' });
  if (e2) return { erro: mensagemErro(e2) };
  // mantém o papel também no token de acesso
  await criarClienteAdmin().auth.admin.updateUserById(id, { app_metadata: { papel }, ban_duration: ativo ? 'none' : '876000h' });
  revalidatePath('/usuarios');
  return { ok: 'Usuário atualizado.' };
}

export async function redefinirSenha(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  if (!(await exigirAdmin())) return { erro: 'Apenas a diretoria redefine senhas.' };
  const senha = (f.get('senha') as string) ?? '';
  if (senha.length < 8) return { erro: 'A senha precisa ter pelo menos 8 caracteres.' };
  const { error } = await criarClienteAdmin().auth.admin.updateUserById(txt(f, 'id')!, { password: senha });
  if (error) return { erro: error.message };
  return { ok: 'Senha redefinida.' };
}

export async function definirLimiteCompras(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await exigirAdmin();
  if (!supabase) return { erro: 'Apenas a diretoria define o limite.' };
  const v = dinheiro(f, 'limite');
  if (v == null) return { erro: 'Informe o valor do limite.' };
  const { error } = await supabase.rpc('compras_definir_limite', { p_valor: v });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath('/usuarios'); revalidatePath('/suprimentos', 'layout');
  return { ok: `Limite do coordenador de compras: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.` };
}
