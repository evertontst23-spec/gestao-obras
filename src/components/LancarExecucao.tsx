'use client';
import { useActionState, useState } from 'react';
import { lancarExecucao } from '@/app/(app)/obras/avanco-acoes';
import { Botao } from './formulario';
import { FotoUpload } from './FotoUpload';
import { hojeISO } from '@/lib/formato';

type ItemOpc = { id: string; rotulo: string; unidade: string | null; saldo: number };

function Formulario({ obraId, itens, itemInicial, aoConcluir }: { obraId: string; itens: ItemOpc[]; itemInicial?: string; aoConcluir: () => void }) {
  const [estado, despachar] = useActionState(lancarExecucao, null);
  const [item, setItem] = useState(itemInicial && itens.some((i) => i.id === itemInicial) ? itemInicial : '');
  const sel = itens.find((i) => i.id === item);
  if (estado?.ok && estado.id) {
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-ok-50 px-3 py-2 text-sm font-semibold text-ok-700">✓ {estado.ok}</p>
        <FotoUpload obraId={obraId} medicaoId={estado.id} categoria="execucao" rotulo="📷 Fotos do que foi executado" />
        <button type="button" onClick={aoConcluir} className="min-h-[44px] w-full rounded-md border border-concreto-300 bg-white text-sm font-semibold">+ Novo lançamento</button>
      </div>
    );
  }
  return (
    <form action={despachar} className="space-y-3">
      <input type="hidden" name="obra_id" value={obraId} />
      <label className="block"><span className="mb-1 block text-sm font-semibold">Serviço da planilha *</span>
        <select name="item" required value={item} onChange={(e) => setItem(e.target.value)} className="entrada">
          <option value="" disabled>Selecionar serviço…</option>
          {itens.map((i) => <option key={i.id} value={i.id} disabled={i.saldo <= 0}>{i.rotulo}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="mb-1 block text-sm font-semibold">Quantidade executada {sel?.unidade ? `(${sel.unidade})` : ''} *</span>
          <input name="quantidade" required inputMode="decimal" className="entrada" placeholder={sel ? `saldo ${sel.saldo.toLocaleString('pt-BR')}` : ''} /></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Data *</span>
          <input type="date" name="data" required max={hojeISO()} defaultValue={hojeISO()} className="entrada" /></label>
      </div>
      <label className="block"><span className="mb-1 block text-sm font-semibold">Local</span><input name="local" className="entrada" placeholder="Bloco, pavimento, trecho…" /></label>
      <label className="block"><span className="mb-1 block text-sm font-semibold">O que foi feito</span><textarea name="descricao" rows={2} className="entrada" /></label>
      {estado?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{estado.erro}</p>}
      <Botao grande>Lançar execução</Botao>
    </form>
  );
}

export function LancarExecucao(props: { obraId: string; itens: ItemOpc[]; itemInicial?: string }) {
  const [chave, setChave] = useState(0);
  return <Formulario key={chave} {...props} aoConcluir={() => setChave((k) => k + 1)} />;
}
