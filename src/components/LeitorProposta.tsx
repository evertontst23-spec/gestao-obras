'use client';
import { useState } from 'react';
import Link from 'next/link';
import { textoFalha } from '@/lib/falha';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { comprimirImagem } from './UploadArquivo';
import { FormAcao, Botao } from './formulario';
import { lerPropostaArquivo, salvarProposta, type LeituraProposta } from '@/app/(app)/suprimentos/acoes';
import { FORMA_PAGAMENTO } from '@/lib/dominio';
import { PrecosItens } from './PrecosItens';

type Item = { id: string; descricao: string; quantidade: number; unidade: string };
type Forn = { id: string; nome: string };
const br = (v: number | null | undefined, casas = 2) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 }).replace(/\./g, ''));

/** Sobe o PDF/foto do orçamento do fornecedor, lê os dados automaticamente e abre a proposta preenchida para conferir. */
export function LeitorProposta({ cotacao, itens, fornecedores }: { cotacao: string; itens: Item[]; fornecedores: Forn[] }) {
  const [estado, setEstado] = useState<'livre' | 'enviando' | 'lendo'>('livre');
  const [erro, setErro] = useState<string | null>(null);
  const [lido, setLido] = useState<(LeituraProposta & { caminho: string; nomeArquivo: string; url?: string }) | null>(null);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null); setLido(null); setEstado('enviando');
    try {
      const blob = await comprimirImagem(arquivo, 2000, 0.85);
      const mime = blob === arquivo ? arquivo.type || 'application/octet-stream' : 'image/jpeg';
      if (mime === 'image/heic' || mime === 'image/heif') throw new Error('Foto em HEIC: no iPhone, envie como JPG (ou tire print da tela).');
      const ext = mime === 'image/jpeg' ? 'jpg' : (arquivo.name.split('.').pop() || 'bin').toLowerCase();
      const caminho = `sup/cot/${cotacao}/${crypto.randomUUID()}.${ext}`;
      const sb = criarClienteNavegador();
      const up = await sb.storage.from('anexos').upload(caminho, blob, { contentType: mime });
      if (up.error) throw up.error;
      setEstado('lendo');
      const r = await lerPropostaArquivo(cotacao, caminho, mime);
      if (r.erro) { setErro(r.erro); setEstado('livre'); return; }
      const url = (await sb.storage.from('anexos').createSignedUrl(caminho, 3600)).data?.signedUrl;
      setLido({ ...r, caminho, nomeArquivo: arquivo.name, url });
    } catch (e) { setErro(textoFalha(e)); }
    setEstado('livre');
  }

  const faltando = lido ? itens.filter((i) => lido.precos?.[i.id] == null).length : 0;
  return (
    <div className="space-y-3">
      <label className={`flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 text-center text-sm font-semibold ${estado === 'livre' ? 'border-sinal-400 bg-sinal-50 text-sinal-800 hover:bg-sinal-100' : 'border-concreto-300 bg-concreto-50 text-concreto-600'}`}>
        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={estado !== 'livre'} onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }} />
        {estado === 'enviando' ? 'Enviando arquivo…' : estado === 'lendo' ? '🔎 Lendo o orçamento… (alguns segundos)' : lido ? '📄 Ler outro orçamento (PDF ou foto)' : '📄 Enviar orçamento do fornecedor (PDF ou foto) e preencher sozinho'}
      </label>
      {erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{erro}</p>}

      {lido && (
        <FormAcao acao={salvarProposta} className="space-y-3 rounded-md border-2 border-sinal-400 p-3">
          <input type="hidden" name="cotacao_id" value={cotacao} /><input type="hidden" name="anexo" value={lido.caminho} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <b>Confira o que foi lido e salve</b>
            {lido.url && <a href={lido.url} target="_blank" rel="noreferrer" className="link">📎 abrir {lido.nomeArquivo}</a>}
          </div>
          {(lido.avisos?.length ?? 0) > 0 && <ul className="list-disc rounded bg-atencao-50 py-2 pl-6 pr-3 text-xs text-atencao-800">{lido.avisos!.map((a, k) => <li key={k}>{a}</li>)}</ul>}
          <label className="block text-sm font-semibold">Fornecedor *{lido.fornecedor_nome && !lido.fornecedor_id && <span className="ml-1 font-normal text-atencao-800">— lido: “{lido.fornecedor_nome}”{lido.fornecedor_documento ? ` (${lido.fornecedor_documento})` : ''}, não está no cadastro</span>}
            <select name="fornecedor_id" required defaultValue={lido.fornecedor_id ?? ''} className="entrada mt-1"><option value="">Selecionar…</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            {!lido.fornecedor_id && <Link href="/cadastros/fornecedores" target="_blank" className="link text-xs font-normal">+ cadastrar fornecedor (abre em outra aba; depois volte e escolha)</Link>}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block text-sm font-semibold">Prazo (dias)<input name="prazo" required inputMode="numeric" defaultValue={lido.prazo_entrega_dias ?? ''} className="entrada mt-1" /></label>
            <label className="block text-sm font-semibold">Frete (R$)<input name="frete" inputMode="decimal" defaultValue={br(lido.frete ?? 0)} className="entrada mt-1" /></label>
            <label className="block text-sm font-semibold">Forma de pagamento *
              <select name="forma" required defaultValue={lido.forma_pagamento ?? ''} className="entrada mt-1"><option value="">Escolher…</option>
                {Object.entries(FORMA_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block text-sm font-semibold">Condição / parcelas<input name="condicao" defaultValue={lido.condicao ?? ''} className="entrada mt-1" /></label>
          </div>
          <PrecosItens key={lido.caminho} itens={itens}
            iniciais={Object.fromEntries(itens.filter((i) => lido.precos?.[i.id] != null).map((i) => [i.id, br(lido.precos![i.id])]))}
            faltando={Object.fromEntries(itens.map((i) => [i.id, lido.precos?.[i.id] == null]))} />
          {faltando > 0 && <p className="text-xs font-semibold text-atencao-800">{faltando} item(ns) sem preço no orçamento (em amarelo): preencha ou peça ao fornecedor.</p>}
          <label className="block text-sm font-semibold">Observações<input name="observacoes" defaultValue={lido.observacoes ?? ''} className="entrada mt-1" /></label>
          <Botao>Salvar proposta (com o arquivo anexado)</Botao>
          <p className="text-xs text-concreto-500">A leitura pode errar: confira os preços com o arquivo antes de salvar.</p>
        </FormAcao>)}
    </div>
  );
}
