'use client';
import { useState } from 'react';
import { UNIDADES } from '@/lib/dominio';

/** Lista dinâmica de materiais de uma solicitação (vários itens por pedido). */
export function ItensMaterial({ insumos = [] }: { insumos?: { codigo: string; descricao: string; unidade: string }[] }) {
  const [linhas, setLinhas] = useState([0]);
  const [prox, setProx] = useState(1);
  return (
    <div className="space-y-3">
      <datalist id="insumos-mat">{insumos.map((i) => <option key={i.codigo} value={`${i.codigo} — ${i.descricao}`}>{i.unidade}</option>)}</datalist>
      <datalist id="unidades-mat">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      {linhas.map((k, i) => (
        <fieldset key={k} className="rounded-md border border-concreto-200 bg-concreto-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <legend className="text-sm font-bold">Material {i + 1}</legend>
            {linhas.length > 1 && <button type="button" onClick={() => setLinhas(linhas.filter((x) => x !== k))} className="text-xs font-semibold text-atraso-700">remover</button>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input name="material" required list="insumos-mat" placeholder="Digite o código ou o nome do material" className="entrada col-span-2 sm:col-span-3" />
            <input name="quantidade" required inputMode="decimal" placeholder="Qtd." className="entrada sm:col-span-1" />
            <input name="unidade" required list="unidades-mat" placeholder="Unid." className="entrada sm:col-span-2" />
            <input name="especificacao" placeholder="Especificação técnica (marca, bitola, traço…)" className="entrada col-span-2 sm:col-span-6" />
          </div>
        </fieldset>
      ))}
      <button type="button" onClick={() => { setLinhas([...linhas, prox]); setProx(prox + 1); }}
        className="min-h-[48px] w-full rounded-md border-2 border-dashed border-concreto-300 text-sm font-semibold text-concreto-700 hover:border-sinal-400">
        + Adicionar outro material
      </button>
    </div>
  );
}
