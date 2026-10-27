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
export function UploadArquivo({ pasta, acao, children, rotuloBotao = 'Enviar', exigirArquivo = true, accept = 'image/*,application/pdf' }:
  { pasta: string; acao: (dados: Record<string, string | null>) => Promise<EstadoAcao>; children?: ReactNode;
    rotuloBotao?: string; exigirArquivo?: boolean; accept?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'livre' | 'enviando'>('livre');
  const [msg, setMsg] = useState<EstadoAcao>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    if (exigirArquivo && !arquivo) { setMsg({ erro: 'Tire a foto ou escolha o arquivo.' }); return; }
    setEstado('enviando');
    try {
      let caminho: string | null = null, mime: string | null = null;
      if (arquivo) {
        const blob = await comprimirImagem(arquivo);
        mime = blob === arquivo ? arquivo.type || 'application/octet-stream' : 'image/jpeg';
        const ext = mime === 'image/jpeg' ? 'jpg' : (arquivo.name.split('.').pop() || 'bin').toLowerCase();
        caminho = `${pasta}/${crypto.randomUUID()}.${ext}`;
        const up = await criarClienteNavegador().storage.from('anexos').upload(caminho, blob, { contentType: mime });
        if (up.error) throw up.error;
      }
      const dados: Record<string, string | null> = { caminho, tipo_mime: mime };
      new FormData(ref.current!).forEach((v, k) => { dados[k] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null; });
      const r = await acao(dados);
      setMsg(r);
      if (r?.ok) { ref.current?.reset(); setArquivo(null); router.refresh(); }
    } catch (er) {
      setMsg({ erro: textoFalha(er) });
    } finally { setEstado('livre'); }
  }

  return (
    <form ref={ref} onSubmit={enviar} className="space-y-3">
      {children}
      <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-concreto-300 bg-concreto-50 px-3 text-center text-sm font-semibold text-concreto-700 hover:border-sinal-400">
        <input type="file" accept={accept} className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        {arquivo ? `📎 ${arquivo.name}` : '📷 Tirar foto ou escolher arquivo'}
      </label>
      <button type="submit" disabled={estado !== 'livre'} className="min-h-[44px] w-full rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white disabled:opacity-60">
        {estado === 'enviando' ? 'Enviando…' : rotuloBotao}
      </button>
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-ok-50 px-3 py-2 text-sm font-medium text-ok-700">{msg.ok}</p>}
    </form>
  );
}
