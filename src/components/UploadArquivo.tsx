'use client';
import { textoFalha } from '@/lib/falha';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { EstadoAcao } from '@/lib/acoes';

/** Reduz fotos no celular antes de enviar. PDFs vão como estão. */
export async function comprimirImagem(arquivo: File, max = 1800, qualidade = 0.82): Promise<Blob> {
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/heic') return arquivo;
  const bmp = await createImageBitmap(arquivo).catch(() => null);
  if (!bmp) return arquivo;
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? arquivo), 'image/jpeg', qualidade));
}

/**
 * Formulário genérico: envia o arquivo para o Storage (pasta `pasta`) e depois chama
 * a ação do servidor com os campos do formulário + caminho do arquivo.
 */
export function UploadArquivo({ pasta, acao, children, rotuloBotao = 'Enviar', exigirArquivo = true, accept = 'image/*,application/pdf', multiplo = false }:
  { pasta: string; acao: (dados: Record<string, string | null>) => Promise<EstadoAcao>; children?: ReactNode;
    rotuloBotao?: string; exigirArquivo?: boolean; accept?: string;
    /** permite escolher vários arquivos; o 1º vai em `caminho` e todos em `arquivos` (JSON [{caminho, tipo_mime}]) */
    multiplo?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const arquivo = arquivos[0] ?? null;
  const [estado, setEstado] = useState<'livre' | 'enviando'>('livre');
  const [msg, setMsg] = useState<EstadoAcao>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    if (exigirArquivo && !arquivo) { setMsg({ erro: 'Tire a foto ou escolha o arquivo.' }); return; }
    setEstado('enviando');
    try {
      const enviados: { caminho: string; tipo_mime: string }[] = [];
      for (const a of arquivos) {
        const blob = await comprimirImagem(a);
        const mime = blob === a ? a.type || 'application/octet-stream' : 'image/jpeg';
        const ext = mime === 'image/jpeg' ? 'jpg' : (a.name.split('.').pop() || 'bin').toLowerCase();
        const caminho = `${pasta}/${crypto.randomUUID()}.${ext}`;
        const up = await criarClienteNavegador().storage.from('anexos').upload(caminho, blob, { contentType: mime });
        if (up.error) throw up.error;
        enviados.push({ caminho, tipo_mime: mime });
      }
      const dados: Record<string, string | null> = { caminho: enviados[0]?.caminho ?? null, tipo_mime: enviados[0]?.tipo_mime ?? null,
        ...(multiplo ? { arquivos: enviados.length ? JSON.stringify(enviados) : null } : {}) };
      new FormData(ref.current!).forEach((v, k) => { dados[k] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null; });
      const r = await acao(dados);
      setMsg(r);
      if (r?.ok) { ref.current?.reset(); setArquivos([]); router.refresh(); }
    } catch (er) {
      setMsg({ erro: textoFalha(er) });
    } finally { setEstado('livre'); }
  }

  return (
    <form ref={ref} onSubmit={enviar} className="space-y-3">
      {children}
      <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-concreto-300 bg-concreto-50 px-3 text-center text-sm font-semibold text-concreto-700 hover:border-sinal-400">
        <input type="file" accept={accept} multiple={multiplo} className="hidden"
          onChange={(e) => { const novos = Array.from(e.target.files ?? []); setArquivos((atual) => (multiplo ? [...atual, ...novos] : novos.slice(0, 1))); e.target.value = ''; }} />
        {arquivos.length > 1 ? `📎 ${arquivos.length} arquivos — toque para adicionar mais`
          : arquivo ? `📎 ${arquivo.name}${multiplo ? ' — toque para adicionar mais' : ''}`
          : multiplo ? '📷 Tirar foto ou escolher arquivos (pode mais de um)' : '📷 Tirar foto ou escolher arquivo'}
      </label>
      {multiplo && arquivos.length > 0 && (
        <ul className="space-y-1 text-xs">{arquivos.map((a, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded bg-concreto-50 px-2 py-1">
            <span className="truncate">📎 {a.name}</span>
            <button type="button" onClick={() => setArquivos((atual) => atual.filter((_, k) => k !== i))} className="shrink-0 text-atraso-700 hover:underline">tirar</button>
          </li>))}</ul>)}
      <button type="submit" disabled={estado !== 'livre'} className="min-h-[44px] w-full rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white disabled:opacity-60">
        {estado === 'enviando' ? 'Enviando…' : rotuloBotao}
      </button>
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-ok-50 px-3 py-2 text-sm font-medium text-ok-700">{msg.ok}</p>}
    </form>
  );
}
