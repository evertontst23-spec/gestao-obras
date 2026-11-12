'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { type EstadoAcao, dinheiro, mensagemErro, numero, paraNumero, txt } from '@/lib/acoes';

const rev = () => { revalidatePath('/suprimentos', 'layout'); revalidatePath('/materiais', 'layout'); };

export async function lancarEstoque(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const tipo = txt(f, 'tipo')!;
  const supabase = await criarClienteServidor();
  const transf = tipo === 'transferencia';
  const vu = transf ? dinheiro(f, 'valor_unitario') : null;
  if (transf && txt(f, 'valor_unitario') && vu === null) return { erro: 'Valor unitário inválido.' };
  const { data: valor, error } = await supabase.rpc('estoque_lancar', {
    p_obra: txt(f, 'obra_id'), p_insumo: txt(f, 'insumo_id'), p_tipo: transf ? 'saida' : tipo,
    p_quantidade: numero(f, 'quantidade'), p_observacao: txt(f, 'observacao'),
    p_destino: txt(f, 'destino_id'), p_transferir: transf, p_valor_unitario: vu,
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  if (transf) return { ok: `Transferência registrada. Valor do material transferido: ${valor == null ? 'sem valor' : Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` };
  return { ok: 'Lançamento registrado no estoque.' };
}

export async function criarCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const itens: Record<string, string | number>[] = f.getAll('solicitacao_item_id').map((v) => ({ solicitacao_item_id: String(v) }));
  const reposIns = f.getAll('repor_insumo').map(String), reposQtd = f.getAll('repor_qtd').map(String);
  reposIns.forEach((ins, i) => { const q = Number((reposQtd[i] ?? '').replace(',', '.')); if (ins && q > 0) itens.push({ insumo_id: ins, quantidade: q }); });
  if (!itens.length) return { erro: 'Selecione os itens pendentes ou informe insumos para reposição.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('cotacao_criar', {
    p_obra: txt(f, 'obra_id'), p_itens: itens, p_justificativa_estoque: txt(f, 'justificativa_estoque'), p_observacoes: txt(f, 'observacoes'),
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  redirect(`/suprimentos/cotacoes/${data}`);
}

export async function salvarProposta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const precos = f.getAll('item_id').map((id, i) => ({ cotacao_item_id: String(id), preco_unitario: (() => { const v = paraNumero(String(f.getAll('preco')[i] ?? '')); return v == null ? '' : String(v); })() }));
  const supabase = await criarClienteServidor();
  const forma = txt(f, 'forma');
  if (!forma) return { erro: 'Escolha a forma de pagamento (PIX, boleto, cartão de crédito ou dinheiro).' };
  const { data: prop, error } = await supabase.rpc('cotacao_proposta_salvar', {
    p_cotacao: cot, p_fornecedor: txt(f, 'fornecedor_id'), p_prazo: numero(f, 'prazo'), p_condicao: txt(f, 'condicao'),
    p_frete: dinheiro(f, 'frete') ?? 0, p_precos: precos, p_obs: txt(f, 'observacoes'),
  });
  if (error) return { erro: mensagemErro(error) };
  const { error: e2 } = await supabase.rpc('cotacao_proposta_complementar', { p_proposta: prop, p_forma: forma, p_anexo: txt(f, 'anexo') });
  if (e2) return { erro: mensagemErro(e2) };
  revalidatePath(`/suprimentos/cotacoes/${cot}`);
  return { ok: 'Proposta registrada.' };
}

export async function enviarAprovacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_enviar_aprovacao', { p_cotacao: cot, p_proposta: txt(f, 'proposta_id'), p_justificativa: txt(f, 'justificativa') });
  if (error) return { erro: mensagemErro(error) };
  if (f.get('direto') === '1') {
    // coordenador (até o limite) ou diretoria aprovam na mesma hora e a OC é emitida
    const { data: oc, error: e2 } = await supabase.rpc('cotacao_decidir', {
      p_cotacao: cot, p_aprovar: true, p_parecer: null, p_modalidade: txt(f, 'modalidade') ?? 'entrega', p_retirante: txt(f, 'retirante'),
    });
    rev();
    if (e2) return { erro: `${mensagemErro(e2)} A cotação ficou aguardando aprovação.` };
    redirect(`/suprimentos/ordens/${oc}`);
  }
  rev();
  return { ok: 'Enviado para aprovação.' };
}

export async function decidirCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const aprovar = f.get('decisao') === 'aprovar';
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('cotacao_decidir', {
    p_cotacao: cot, p_aprovar: aprovar, p_parecer: txt(f, 'parecer'), p_modalidade: txt(f, 'modalidade') ?? 'entrega', p_retirante: txt(f, 'retirante'),
  });
  if (error) return { erro: mensagemErro(error) };
  rev();
  if (aprovar && data) redirect(`/suprimentos/ordens/${data}`);
  return { ok: 'Compra recusada e devolvida ao comprador.' };
}

export async function cancelarCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_cancelar', { p_cotacao: txt(f, 'cotacao_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Cotação cancelada. Os itens voltaram para a fila.' };
}

export async function anexarDocumentoOC(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data: docId, error } = await supabase.rpc('oc_anexar_documento', {
    p_oc: c.oc_id, p_tipo: c.tipo ?? 'outro', p_numero: c.numero ?? null, p_valor: c.valor ? Number(c.valor.replace(/\./g, '').replace(',', '.')) : null,
    // campo some quando não é boleto: precisa ir como null, senão a função não é encontrada
    p_vencimento: c.vencimento ?? null, p_caminho: c.caminho ?? null, p_mime: c.tipo_mime ?? null,
  });
  if (error) return { erro: mensagemErro(error) };
  // demais arquivos do mesmo envio (ex.: NF + boleto em PDFs separados, várias páginas)
  const extras = (c.arquivos ? JSON.parse(c.arquivos) as { caminho: string; tipo_mime: string }[] : []).slice(1);
  for (const a of extras) {
    const r = await supabase.rpc('oc_documento_arquivo_extra', { p_doc: docId, p_caminho: a.caminho, p_mime: a.tipo_mime ?? null });
    if (r.error) { rev(); return { erro: `O 1º arquivo foi anexado, mas houve erro nos demais: ${mensagemErro(r.error)}` }; }
  }
  rev();
  return { ok: extras.length ? `${extras.length + 1} arquivos anexados à OC.` : 'Documento anexado à OC.' };
}

export async function liberarColeta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_liberar_coleta', { p_oc: txt(f, 'oc_id'), p_pagamento: txt(f, 'pagamento'), p_retirante: txt(f, 'retirante'), p_previsao: txt(f, 'previsao'), p_fatura: txt(f, 'fatura') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'OC liberada — todos foram avisados.' };
}

export async function receberOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const itens = f.getAll('oc_item_id').map((id, i) => ({ oc_item_id: String(id), quantidade: String(f.getAll('qtd')[i] ?? '').replace(',', '.') }));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_receber', { p_oc: txt(f, 'oc_id'), p_itens: itens, p_observacao: txt(f, 'observacao') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Recebimento lançado: estoque atualizado e todos avisados.' };
}

export async function cancelarOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_cancelar', { p_oc: txt(f, 'oc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'OC cancelada; os itens voltaram para cotação.' };
}

export async function reabrirCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_reabrir', { p_cotacao: cot });
  if (error) return { erro: mensagemErro(error) };
  rev(); revalidatePath(`/suprimentos/cotacoes/${cot}`);
  return { ok: 'Cotação reaberta com os itens e as propostas. Corrija o que precisar.' };
}

export async function excluirProposta(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_proposta_excluir', { p_proposta: txt(f, 'proposta_id') });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/suprimentos/cotacoes/${cot}`);
  return { ok: 'Proposta excluída.' };
}

export async function voltarCorrecao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_voltar_correcao', { p_cotacao: cot, p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev(); revalidatePath(`/suprimentos/cotacoes/${cot}`);
  return { ok: 'Cotação de volta para o comprador corrigir.' };
}

export async function excluirCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_excluir', { p_cotacao: cot, p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev(); revalidatePath(`/suprimentos/cotacoes/${cot}`);
  redirect('/suprimentos/cotacoes');
}

export async function desfazerOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('oc_desfazer', { p_oc: txt(f, 'oc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  redirect(`/suprimentos/cotacoes/${data}`);
}

export async function voltarPagamentoOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_voltar_pagamento', { p_oc: txt(f, 'oc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Pagamento desfeito: a OC voltou a aguardar pagamento/faturamento.' };
}

export async function anularDocumentoOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_documento_anular', { p_doc: txt(f, 'doc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Documento excluído da OC (fica registrado no histórico).' };
}

export async function estornarRecebimentoOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_estornar_recebimento', { p_oc: txt(f, 'oc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Recebimento estornado: o material saiu do estoque e a OC voltou a aguardar entrega.' };
}

export async function registrarEnvioCotacao(cotacao: string, fornecedor: string | null, telefone: string | null) {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_registrar_envio', { p_cotacao: cotacao, p_fornecedor: fornecedor, p_telefone: telefone });
  if (!error) revalidatePath(`/suprimentos/cotacoes/${cotacao}`);
  return error ? { erro: mensagemErro(error) } : { ok: 'Envio registrado.' };
}

export async function anexarArquivoProposta(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('cotacao_proposta_complementar', { p_proposta: c.proposta_id, p_anexo: c.caminho });
  if (error) return { erro: mensagemErro(error) };
  revalidatePath(`/suprimentos/cotacoes/${c.cotacao_id}`);
  return { ok: 'PDF/foto da proposta anexado.' };
}

export async function tirarItensCotacao(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const cot = txt(f, 'cotacao_id')!;
  const itens = f.getAll('itens').map(String);
  if (!itens.length) return { erro: 'Marque os itens que vão voltar para a fila.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('cotacao_remover_itens', { p_cotacao: cot, p_itens: itens, p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev(); revalidatePath(`/suprimentos/cotacoes/${cot}`);
  return { ok: `${data} item(ns) voltaram para a fila de cotação.` };
}

export type LeituraProposta = {
  erro?: string;
  fornecedor_nome?: string | null; fornecedor_documento?: string | null; fornecedor_id?: string | null;
  prazo_entrega_dias?: number | null; frete?: number | null; forma_pagamento?: string | null; condicao?: string | null;
  observacoes?: string | null; precos?: Record<string, number | null>; avisos?: string[];
};

/** Lê o PDF/foto do orçamento do fornecedor e devolve os dados para conferir antes de salvar a proposta. */
export async function lerPropostaArquivo(cotacao: string, caminho: string, mime: string | null): Promise<LeituraProposta> {
  // No Netlify, a IA vem pelo AI Gateway do próprio plano (chave e endereço injetados automaticamente; cobra em créditos do Netlify)
  const chave = process.env.ANTHROPIC_API_KEY;
  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  if (!chave) return { erro: 'A leitura automática não está disponível agora. Lance os preços à mão.' };
  const supabase = await criarClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('perfis').select('papel').eq('id', user?.id ?? '').maybeSingle();
  if (!perfil || !['compras', 'admin'].includes(perfil.papel)) return { erro: 'Apenas o comprador ou a diretoria usam a leitura automática.' };

  const [{ data: itens }, { data: forns }, arq] = await Promise.all([
    supabase.from('cotacao_itens').select('id, descricao, quantidade, unidade').eq('cotacao_id', cotacao).is('removido_em', null).order('descricao'),
    supabase.from('fornecedores').select('id, nome, documento').eq('ativo', true),
    supabase.storage.from('anexos').download(caminho),
  ]);
  if (arq.error || !arq.data) return { erro: 'Não consegui abrir o arquivo enviado. Tente de novo.' };
  if (!itens?.length) return { erro: 'Cotação sem itens.' };
  const tipo = (mime || arq.data.type || '').toLowerCase();
  const base64 = Buffer.from(await arq.data.arrayBuffer()).toString('base64');
  const bloco = tipo === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(tipo)
      ? { type: 'image', source: { type: 'base64', media_type: tipo, data: base64 } }
      : null;
  if (!bloco) return { erro: 'Formato não suportado para leitura: envie PDF ou foto (JPG/PNG).' };

  const lista = itens.map((i, k) => `${k + 1}. ${i.descricao} — ${Number(i.quantidade)} ${i.unidade}`).join('\n');
  const prompt = `Este arquivo é o orçamento/proposta de um fornecedor de materiais de construção, em resposta a esta cotação:\n${lista}\n\n`
    + 'Extraia os dados chamando a ferramenta registrar_proposta. Regras: preco_unitario é o preço por unidade do item da cotação, em reais '
    + '(se o orçamento só trouxer o total da linha, divida pela quantidade; se a unidade for diferente, converta e avise em "avisos"). '
    + 'Use o número do item da lista da cotação. Item que o fornecedor não cotou: preco_unitario null. Não invente valores. '
    + 'forma_pagamento só pode ser pix, boleto, cartao_credito ou dinheiro (null se não estiver escrito). prazo_entrega_dias em dias corridos.';
  const ferramenta = {
    name: 'registrar_proposta', description: 'Registra os dados lidos do orçamento do fornecedor',
    input_schema: { type: 'object', properties: {
      fornecedor_nome: { type: ['string', 'null'] }, fornecedor_documento: { type: ['string', 'null'], description: 'CNPJ ou CPF' },
      prazo_entrega_dias: { type: ['number', 'null'] }, frete: { type: ['number', 'null'], description: 'valor do frete em reais; 0 se grátis' },
      forma_pagamento: { type: ['string', 'null'], enum: ['pix', 'boleto', 'cartao_credito', 'dinheiro', null] },
      condicao: { type: ['string', 'null'], description: 'ex.: à vista, 28 dias, 3x' },
      observacoes: { type: ['string', 'null'], description: 'validade da proposta e outras condições importantes' },
      itens: { type: 'array', items: { type: 'object', properties: { numero: { type: 'integer' }, preco_unitario: { type: ['number', 'null'] } }, required: ['numero', 'preco_unitario'] } },
      avisos: { type: 'array', items: { type: 'string' }, description: 'dúvidas para o comprador conferir' },
    }, required: ['itens'] },
  };
  let r: Response;
  try {
    r = await fetch(`${base.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODELO || 'claude-haiku-5-5', max_tokens: 2000, tools: [ferramenta],
        tool_choice: { type: 'tool', name: 'registrar_proposta' }, messages: [{ role: 'user', content: [bloco, { type: 'text', text: prompt }] }] }),
    });
  } catch { return { erro: 'Não consegui falar com o serviço de leitura agora. Tente de novo ou lance à mão.' }; }
  if (!r.ok) {
    const det = await r.text().catch(() => '');
    console.error('leitura proposta', r.status, det.slice(0, 500));
    return { erro: r.status === 429 ? 'Muitas leituras seguidas: espere um minuto e tente de novo.' : `A leitura automática falhou (${r.status}). Tente de novo ou lance os preços à mão.` };
  }
  const j = await r.json();
  const dados = (j.content ?? []).find((c: { type: string }) => c.type === 'tool_use')?.input as Record<string, unknown> | undefined;
  if (!dados) return { erro: 'Não consegui ler o orçamento. Confira se a foto está nítida ou lance à mão.' };

  const precos: Record<string, number | null> = {};
  for (const it of (dados.itens as { numero: number; preco_unitario: number | null }[]) ?? []) {
    const alvo = itens[it.numero - 1];
    if (alvo) precos[alvo.id] = typeof it.preco_unitario === 'number' && it.preco_unitario >= 0 ? Math.round(it.preco_unitario * 10000) / 10000 : null;
  }
  const so = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  const doc = String(dados.fornecedor_documento ?? '').replace(/\D/g, '');
  const nome = so(dados.fornecedor_nome);
  const achado = (forns ?? []).find((f) => doc && (f.documento ?? '').replace(/\D/g, '') === doc)
    ?? (nome.length >= 4 ? (forns ?? []).find((f) => { const n = so(f.nome); return n && (n.includes(nome) || nome.includes(n)); }) : undefined);
  const forma = ['pix', 'boleto', 'cartao_credito', 'dinheiro'].includes(String(dados.forma_pagamento)) ? String(dados.forma_pagamento) : null;
  return {
    fornecedor_nome: (dados.fornecedor_nome as string) ?? null, fornecedor_documento: (dados.fornecedor_documento as string) ?? null,
    fornecedor_id: achado?.id ?? null, prazo_entrega_dias: typeof dados.prazo_entrega_dias === 'number' ? Math.round(dados.prazo_entrega_dias) : null,
    frete: typeof dados.frete === 'number' ? dados.frete : null, forma_pagamento: forma, condicao: (dados.condicao as string) ?? null,
    observacoes: (dados.observacoes as string) ?? null, precos, avisos: (dados.avisos as string[]) ?? [],
  };
}

export async function registrarColetaOC(c: Record<string, string | null>): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const quando = c.quando ? new Date(`${c.quando}:00-03:00`).toISOString() : null;
  const { error } = await supabase.rpc('oc_registrar_coleta', { p_oc: c.oc_id, p_quem: c.quem, p_quando: quando, p_obs: c.obs, p_foto: c.caminho });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Coleta registrada. Agora é só dar entrada no estoque quando o material chegar.' };
}

export async function desfazerColetaOC(_: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('oc_desfazer_coleta', { p_oc: txt(f, 'oc_id'), p_motivo: txt(f, 'motivo') });
  if (error) return { erro: mensagemErro(error) };
  rev();
  return { ok: 'Coleta desfeita.' };
}
