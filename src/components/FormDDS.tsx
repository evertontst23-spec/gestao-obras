'use client';
import { textoFalha } from '@/lib/falha';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { comprimirImagem } from './UploadArquivo';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { registrarDDS } from '@/app/(app)/sst/acoes';

const TEMAS = ['Uso correto de EPI', 'Trabalho em altura — NR-35', 'Escavações e valas', 'Andaimes e plataformas', 'Ordem e limpeza no canteiro',
  'Riscos elétricos — NR-10', 'Máquinas e ferramentas — NR-12', 'Prevenção de incêndio', 'Ergonomia e levantamento de cargas', 'Calor e hidratação',
  'Proteção de periferia e aberturas', 'Içamento de cargas', 'Primeiros socorros', 'Uso de betoneira', 'Sinalização de segurança'];

export function FormDDS({ obra, equipe, hoje }: { obra: string; equipe: { id: string; nome: string; funcao: string }[]; hoje: string }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<string[]>([]);
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string; id?: string } | null>(null);
  const alternar = (id: string) => setMarcados((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg(null);
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      let caminho: string | null = null;
      if (foto) {
        const b = await comprimirImagem(foto);
        caminho = `sst/dds/${obra}/${crypto.randomUUID()}.jpg`;
        const up = await criarClienteNavegador().storage.from('anexos').upload(caminho, b, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
      }
      const s = (k: string) => { const v = String(f.get(k) ?? '').trim(); return v || null; };
      const r = await registrarDDS({ obra, data: s('data')!, hora: s('hora'), duracao: Number(s('duracao')) || null, tema: s('tema') ?? '',
        conteudo: s('conteudo'), local: s('local'), participantes: marcados, foto: caminho, obs: s('obs') });
      if (r?.ok && r.id) { router.push(`/sst/dds/${r.id}`); return; }
      setMsg(r);
    } catch (er) { setMsg({ erro: textoFalha(er) }); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <datalist id="temas-dds">{TEMAS.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-4"><span className="mb-1 block text-sm font-semibold">Tema *</span><input name="tema" required list="temas-dds" className="entrada" /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Data</span><input type="date" name="data" defaultValue={hoje} max={hoje} className="entrada" /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Hora</span><input type="time" name="hora" defaultValue="07:00" className="entrada" /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Duração (min)</span><input name="duracao" inputMode="numeric" defaultValue="15" className="entrada" /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Local</span><input name="local" defaultValue="Canteiro" className="entrada" /></label>
        <label className="block sm:col-span-4"><span className="mb-1 block text-sm font-semibold">Assuntos abordados</span><textarea name="conteudo" rows={3} className="entrada" /></label>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Presentes ({marcados.length}/{equipe.length})</span>
          <button type="button" className="text-sm font-semibold text-sinal-700" onClick={() => setMarcados(marcados.length === equipe.length ? [] : equipe.map((e) => e.id))}>
            {marcados.length === equipe.length ? 'desmarcar todos' : 'marcar todos'}</button></div>
        <div className="grid gap-2 sm:grid-cols-2">{equipe.map((e) => (
          <label key={e.id} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md border px-3 ${marcados.includes(e.id) ? 'border-ok-500 bg-ok-50' : 'border-concreto-200 bg-white'}`}>
            <input type="checkbox" checked={marcados.includes(e.id)} onChange={() => alternar(e.id)} className="h-5 w-5 accent-ok-500" />
            <span className="text-sm"><b>{e.nome}</b><span className="block text-xs text-concreto-500">{e.funcao}</span></span>
          </label>))}</div>
      </div>
      <label className="flex min-h-[52px] cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-concreto-300 bg-concreto-50 text-sm font-semibold">
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        {foto ? `📷 ${foto.name}` : '📷 Foto do DDS (recomendado)'}
      </label>
      <label className="block"><span className="mb-1 block text-sm font-semibold">Observações</span><input name="obs" className="entrada" /></label>
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{msg.erro}</p>}
      <button type="submit" disabled={enviando} className="min-h-[52px] w-full rounded-md bg-sinal-500 font-semibold text-white disabled:opacity-60">{enviando ? 'Registrando…' : 'Registrar DDS'}</button>
    </form>
  );
}
