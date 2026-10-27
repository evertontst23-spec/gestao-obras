'use client';
import { textoFalha } from '@/lib/falha';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/client';

/** Reduz a foto no próprio celular antes de enviar (economiza dados no canteiro). */
async function comprimir(arquivo: File, max = 1600, qualidade = 0.8): Promise<Blob> {
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/heic') return arquivo;
  const bmp = await createImageBitmap(arquivo).catch(() => null);
  if (!bmp) return arquivo;
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? arquivo), 'image/jpeg', qualidade));
}

export type CategoriaFoto = 'geral' | 'execucao' | 'correcao' | 'nao_conformidade';
export const CATEGORIAS_FOTO: Record<CategoriaFoto, string> = {
  execucao: 'Execução', correcao: 'Correção', nao_conformidade: 'Não conformidade', geral: 'Geral',
};

export function FotoUpload({ obraId, tarefaId, solicitacaoId, medicaoId, naoConformidadeId, diarioId, rotulo = '📷 Enviar foto',
  categoria = 'geral', escolherCategoria = false }:
  { obraId: string; tarefaId?: string; solicitacaoId?: string; medicaoId?: string; naoConformidadeId?: string; diarioId?: string; rotulo?: string;
    categoria?: CategoriaFoto; escolherCategoria?: boolean }) {
  const [cat, setCat] = useState<CategoriaFoto>(categoria);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [legenda, setLegenda] = useState('');

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro(null);
    const sb = criarClienteNavegador();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setErro('Sessão expirada. Entre novamente.'); return; }
    try {
      for (let i = 0; i < arquivos.length; i++) {
        const a = arquivos[i];
        setEstado(`Enviando ${i + 1} de ${arquivos.length}…`);
        const blob = await comprimir(a);
        const jpeg = blob !== a;
        const ext = jpeg ? 'jpg' : (a.name.split('.').pop() || 'bin').toLowerCase();
        const caminho = `${obraId}/${tarefaId ?? naoConformidadeId ?? medicaoId ?? solicitacaoId ?? (diarioId ? `diario/${diarioId}` : 'geral')}/${crypto.randomUUID()}.${ext}`;
        const tipo = jpeg ? 'image/jpeg' : a.type;
        const up = await sb.storage.from('anexos').upload(caminho, blob, { contentType: tipo, upsert: false });
        if (up.error) throw up.error;
        const ins = await sb.from('anexos').insert({
          obra_id: obraId, tarefa_id: tarefaId ?? null, solicitacao_id: solicitacaoId ?? null,
          medicao_id: medicaoId ?? null, nao_conformidade_id: naoConformidadeId ?? null, diario_id: diarioId ?? null, categoria: cat,
          caminho, nome: a.name, tipo_mime: tipo, tamanho: blob.size, legenda: legenda || null, enviado_por: user.id,
        });
        if (ins.error) throw ins.error;
      }
      setEstado('Enviado!'); setLegenda('');
      router.refresh();
      setTimeout(() => setEstado(null), 2000);
    } catch (e) {
      setEstado(null);
      setErro(textoFalha(e));
    } finally {
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {escolherCategoria && (
        <div className="grid grid-cols-3 gap-1 rounded-md bg-concreto-100 p-1 text-xs font-semibold" role="radiogroup" aria-label="Tipo de foto">
          {(['execucao', 'correcao', 'nao_conformidade'] as CategoriaFoto[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)}
              className={`min-h-[40px] rounded px-1 ${cat === c ? (c === 'nao_conformidade' ? 'bg-atraso-500 text-white' : c === 'correcao' ? 'bg-atencao-500 text-white' : 'bg-ok-500 text-white') : 'text-concreto-700'}`}>
              {CATEGORIAS_FOTO[c]}
            </button>))}
        </div>
      )}
      <input value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Legenda (opcional)" className="entrada" />
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
      <button type="button" onClick={() => ref.current?.click()} disabled={!!estado}
        className="min-h-[48px] w-full rounded-md border-2 border-dashed border-concreto-300 bg-concreto-50 px-4 text-sm font-semibold text-concreto-700 hover:border-sinal-400 disabled:opacity-60">
        {estado ?? rotulo}
      </button>
      {erro && <p className="text-sm text-atraso-700">{erro}</p>}
    </div>
  );
}
