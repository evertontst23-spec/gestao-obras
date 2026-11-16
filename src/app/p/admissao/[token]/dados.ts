import 'server-only';
import { criarClienteAdmin } from '@/lib/supabase/admin';

/** Tipos de documento que podem sair no link: só os de admissão.
 *  Atestado, ASO e certificados de treinamento ficam de fora (dado de saúde / não é documento de admissão). */
const TIPOS = ['RG (frente)', 'RG (verso)', 'RG / CPF', 'CPF', 'CTPS', 'Comprovante de residência',
  'Certidão de nascimento/casamento', 'Título de eleitor', 'Reservista', 'Comprovante de escolaridade',
  'Dados bancários', 'Ficha de registro', 'Foto', 'Outro'];

export type Documento = { tipo: string; em: string; url: string | undefined; imagem: boolean };
export type Pessoa = {
  id: string; nome: string; matricula: string | null; funcao: string; obra: string; admissao: string;
  salario: number; adicional_pct: number; cpf: string | null; rg: string | null; nascimento: string | null;
  telefone: string | null; endereco: string | null; documentos: Documento[];
};
export type Conteudo = { titulo: string; observacao: string | null; expira_em: string; pessoas: Pessoa[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lê o conteúdo de um link de admissão. O token de 64 caracteres é a credencial:
 * é conferido aqui (existe, não foi revogado e não venceu) antes de qualquer leitura de dados.
 * Fora desta conferência nada é devolvido.
 */
export async function conteudoDoLink(token: string): Promise<Conteudo | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const sb = criarClienteAdmin();
  const { data: link } = await sb.from('links_admissao').select('*').eq('token', token).is('revogado_em', null).maybeSingle();
  if (!link || new Date(link.expira_em) <= new Date()) return null;
  await sb.from('links_admissao').update({ ultimo_acesso: new Date().toISOString(), acessos: (link.acessos ?? 0) + 1 }).eq('token', token);

  const ids: string[] = link.funcionarios ?? [];
  if (!ids.length) return { titulo: link.titulo, observacao: link.observacao, expira_em: link.expira_em, pessoas: [] };

  const [{ data: funcs }, { data: docs }] = await Promise.all([
    sb.from('funcionarios')
      .select('id, nome, matricula, cpf, rg, data_nascimento, telefone, endereco, data_admissao, salario, adicional_pct, funcoes(nome, salario_base), obras(nome)')
      .in('id', ids),
    sb.from('funcionario_documentos').select('funcionario_id, tipo, caminho, criado_em').in('funcionario_id', ids).in('tipo', TIPOS).not('caminho', 'is', null),
  ]);

  const caminhos = (docs ?? []).map((d: any) => d.caminho as string);
  const { data: assinadas } = caminhos.length ? await sb.storage.from('anexos').createSignedUrls(caminhos, 60 * 60 * 12) : { data: [] };
  const url = new Map((assinadas ?? []).map((a: any) => [a.path, a.signedUrl ?? undefined]));

  const pessoas: Pessoa[] = (funcs ?? []).map((f: any) => ({
    id: f.id,
    nome: f.nome,
    matricula: f.matricula,
    funcao: f.funcoes?.nome ?? '(sem função)',
    obra: f.obras?.nome ?? 'Escritório',
    admissao: f.data_admissao,
    salario: Number(f.salario ?? f.funcoes?.salario_base ?? 0),
    adicional_pct: Number(f.adicional_pct ?? 0),
    cpf: f.cpf, rg: f.rg, nascimento: f.data_nascimento, telefone: f.telefone, endereco: f.endereco,
    documentos: (docs ?? []).filter((d: any) => d.funcionario_id === f.id)
      .map((d: any) => ({ tipo: d.tipo as string, em: String(d.criado_em).slice(0, 10), url: url.get(d.caminho), imagem: /\.(jpe?g|png|webp|gif|heic)$/i.test(d.caminho) }))
      .sort((a, b) => TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo) || a.em.localeCompare(b.em)),
  })).sort((a, b) => a.obra.localeCompare(b.obra, 'pt-BR') || a.funcao.localeCompare(b.funcao, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));

  return { titulo: link.titulo, observacao: link.observacao, expira_em: link.expira_em, pessoas };
}
