'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, mensagemErro, numero, txt } from '@/lib/acoes';

const lista = (f: FormData, k: string) => (txt(f, k) ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

function erroCadastro(e: { message?: string; code?: string }) {
  if (e.code === '23505') return e.message?.includes('cpf') ? 'Já existe funcionário com este CPF.'
    : e.message?.includes('documento') ? 'Já existe fornecedor com este CNPJ/CPF.'
    : e.message?.includes('codigo') ? 'Já existe insumo com este código.'
    : e.message?.includes('nome') ? 'Já existe um cadastro com este nome.' : 'Registro duplicado.';
  return mensagemErro(e);
}

// ---------------- Funções / tabela salarial
export async function salvarFuncao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id');
  const d = {
    nome: txt(f, 'nome'), cbo: txt(f, 'cbo'), salario_base: numero(f, 'salario_base') ?? 0,
    carga_diaria_horas: numero(f, 'carga_diaria_horas') ?? 8, vale_alimentacao_dia: numero(f, 'vale_alimentacao_dia') ?? 0,
    vale_transporte_dia: numero(f, 'vale_transporte_dia') ?? 0, adicional_insalubridade_pct: numero(f, 'adicional_insalubridade_pct') ?? 0,
    adicional_periculosidade: f.get('adicional_periculosidade') === 'on', epis_obrigatorios: lista(f, 'epis_obrigatorios'),
    riscos: lista(f, 'riscos'), ativo: id ? f.get('ativo') === 'on' : true,
  };
  if (!d.nome) return { erro: 'Informe o nome da função.' };
  const supabase = await criarClienteServidor();
  const { error } = id ? await supabase.from('funcoes').update(d).eq('id', id) : await supabase.from('funcoes').insert(d);
  if (error) return { erro: erroCadastro(error) };
  revalidatePath('/cadastros/funcoes');
  return { ok: id ? 'Função atualizada — os funcionários desta função passam a usar os novos valores.' : 'Função cadastrada.' };
}

// ---------------- Funcionários
function dadosFuncionario(f: FormData) {
  return {
    nome: txt(f, 'nome'), cpf: txt(f, 'cpf'), rg: txt(f, 'rg'), data_nascimento: txt(f, 'data_nascimento'),
    telefone: txt(f, 'telefone'), endereco: txt(f, 'endereco'), funcao_id: txt(f, 'funcao_id'), obra_id: txt(f, 'obra_id'),
    salario: numero(f, 'salario'), data_admissao: txt(f, 'data_admissao') ?? undefined, banco: txt(f, 'banco'),
    agencia: txt(f, 'agencia'), conta: txt(f, 'conta'), pix: txt(f, 'pix'), observacoes: txt(f, 'observacoes'),
    empregador_id: txt(f, 'empregador_id'), vinculo: txt(f, 'vinculo'), adicional_pct: numero(f, 'adicional_pct') ?? 0,
    alimentacao_dia: numero(f, 'alimentacao_dia'), passagens_dia: numero(f, 'passagens_dia'), passagem_semanal: numero(f, 'passagem_semanal'),
    pendencias: txt(f, 'pendencias'),
  };
}
export async function criarFuncionario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const d = dadosFuncionario(f);
  if (!d.nome || !d.funcao_id) return { erro: 'Nome e função são obrigatórios.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from('funcionarios').insert(d).select('id').single();
  if (error) return { erro: erroCadastro(error) };
  revalidatePath('/cadastros/funcionarios');
  redirect(`/cadastros/funcionarios/${data.id}`);
}
export async function atualizarFuncionario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id')!;
  const supabase = await criarClienteServidor();
  const { error, count } = await supabase.from('funcionarios').update(dadosFuncionario(f), { count: 'exact' }).eq('id', id);
  if (error) return { erro: erroCadastro(error) };
  if (!count) return { erro: 'Sem permissão para editar este funcionário.' };
  revalidatePath(`/cadastros/funcionarios/${id}`);
  return { ok: 'Dados atualizados.' };
}
export async function desligarFuncionario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('funcionario_desligar', { p_func: id, p_data: txt(f, 'data'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/cadastros/funcionarios/${id}`); revalidatePath('/cadastros/funcionarios');
  return { ok: 'Funcionário desligado. O dossiê continua preservado.' };
}
export async function reativarFuncionario(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('funcionario_reativar', { p_func: id });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/cadastros/funcionarios/${id}`);
  return { ok: 'Funcionário reativado.' };
}
export async function registrarDocumento(c: Record<string, string | null>): Promise<EstadoAcao> {
  const d = { funcionario_id: c.funcionario_id!, tipo: c.tipo ?? 'Outro', descricao: c.descricao, emissao: c.emissao,
    validade: c.validade, caminho: c.caminho, tipo_mime: c.tipo_mime };
  if (!d.funcionario_id || !d.caminho) return { erro: 'Anexe o arquivo do documento.' };
  const supabase = await criarClienteServidor();
  // documento novo do mesmo tipo substitui o anterior (histórico preservado)
  await supabase.from('funcionario_documentos').update({ substituido: true }).eq('funcionario_id', d.funcionario_id).eq('tipo', d.tipo).eq('substituido', false);
  const { error } = await supabase.from('funcionario_documentos').insert(d);
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/cadastros/funcionarios/${d.funcionario_id}`);
  return { ok: 'Documento anexado ao dossiê.' };
}

// ---------------- Fornecedores
export async function salvarFornecedor(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id');
  const d = { nome: txt(f, 'nome'), documento: txt(f, 'documento'), categoria: txt(f, 'categoria'), contato: txt(f, 'contato'),
    telefone: txt(f, 'telefone'), email: txt(f, 'email'), endereco: txt(f, 'endereco'), pix: txt(f, 'pix'),
    ...(id ? { ativo: f.get('ativo') === 'on' } : {}) };
  if (!d.nome) return { erro: 'Informe o nome do fornecedor.' };
  const supabase = await criarClienteServidor();
  const { error } = id ? await supabase.from('fornecedores').update(d).eq('id', id) : await supabase.from('fornecedores').insert(d);
  if (error) return { erro: erroCadastro(error) };
  revalidatePath('/cadastros/fornecedores');
  return { ok: id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.' };
}

// ---------------- Insumos
export async function salvarInsumo(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id');
  const d = { codigo: txt(f, 'codigo')?.toUpperCase(), descricao: txt(f, 'descricao'), unidade: txt(f, 'unidade'),
    categoria: txt(f, 'categoria') ?? 'Material', estoque_minimo: numero(f, 'estoque_minimo') ?? 0, ca: txt(f, 'ca'),
    ca_validade: txt(f, 'ca_validade'), vida_util_dias: numero(f, 'vida_util_dias'), ...(id ? { ativo: f.get('ativo') === 'on' } : {}) };
  if (!d.codigo || !d.descricao || !d.unidade) return { erro: 'Código, descrição e unidade são obrigatórios.' };
  const supabase = await criarClienteServidor();
  const { error } = id ? await supabase.from('insumos').update(d).eq('id', id) : await supabase.from('insumos').insert(d);
  if (error) return { erro: erroCadastro(error) };
  revalidatePath('/cadastros/insumos');
  return { ok: id ? 'Insumo atualizado.' : `Insumo ${d.codigo} cadastrado.` };
}

// ---------------- Empresas contratantes
export async function salvarEmpregador(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const id = txt(f, 'id');
  const d = {
    nome: txt(f, 'nome'), razao_social: txt(f, 'razao_social'), cnpj: txt(f, 'cnpj'), tipo: txt(f, 'tipo') ?? 'propria',
    vinculo_padrao: txt(f, 'vinculo_padrao') ?? 'clt', taxa_tipo: txt(f, 'taxa_tipo') ?? 'nenhuma', taxa_valor: numero(f, 'taxa_valor') ?? 0,
    adiantamento_pct: numero(f, 'adiantamento_pct') ?? 40, dia_adiantamento: numero(f, 'dia_adiantamento') ?? 20, dia_saldo: numero(f, 'dia_saldo') ?? 5,
    fechamento_externo: f.get('fechamento_externo') === 'on', ponto_externo: f.get('ponto_externo') === 'on', ponto_externo_url: txt(f, 'ponto_externo_url'), contato: txt(f, 'contato'), telefone: txt(f, 'telefone'), observacoes: txt(f, 'observacoes'),
    ...(id ? { ativo: f.get('ativo') === 'on' } : {}),
  };
  if (!d.nome) return { erro: 'Informe o nome da empresa.' };
  const supabase = await criarClienteServidor();
  const { error } = id ? await supabase.from('empregadores').update(d).eq('id', id) : await supabase.from('empregadores').insert(d);
  if (error) return { erro: erroCadastro(error) };
  revalidatePath('/cadastros/empregadores');
  return { ok: id ? 'Empresa atualizada.' : 'Empresa cadastrada.' };
}
