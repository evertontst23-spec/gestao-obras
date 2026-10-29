'use client';
import { useState } from 'react';
import { FormAcao, Botao } from './formulario';
import { lancarEstoqueEPI } from '@/app/(app)/sst/acoes';

type Op = { id: string; rotulo: string };
const TIPOS: [string, string][] = [['entrada', 'Entrada (nota fiscal)'], ['transferencia', 'Transferir para outra obra'], ['ajuste', 'Ajuste de inventário (contagem)'], ['saida', 'Saída avulsa (perda, descarte)']];

/** Lançamento no estoque de EPI: entrada de nota, transferência entre obras, ajuste e saída. */
export function FormEstoqueEPI({ epis, locais }: { epis: Op[]; locais: Op[] }) {
  const [tipo, setTipo] = useState('entrada');
  return (
    <FormAcao acao={lancarEstoqueEPI} limparAoConcluir className="space-y-3">
      <label className="block text-sm font-semibold">Lançamento
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="entrada mt-1">{TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="block text-sm font-semibold">EPI *
        <select name="insumo_id" required className="entrada mt-1"><option value="">Selecionar…</option>{epis.map((e) => <option key={e.id} value={e.id}>{e.rotulo}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">{tipo === 'transferencia' ? 'Sai de' : 'Obra / local'}
          <select name="obra_id" className="entrada mt-1">{locais.map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}</select></label>
        {tipo === 'transferencia' ? (
          <label className="block text-sm font-semibold">Vai para *
            <select name="destino_id" required className="entrada mt-1">{locais.map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}</select></label>
        ) : (
          <label className="block text-sm font-semibold">Quantidade *
            <div className="mt-1 flex gap-1">
              {tipo === 'ajuste' && <select name="sinal" className="entrada w-16"><option value="+">+</option><option value="-">−</option></select>}
              <input name="quantidade" required inputMode="decimal" className="entrada" /></div></label>)}
      </div>
      {tipo === 'transferencia' && <label className="block text-sm font-semibold">Quantidade *<input name="quantidade" required inputMode="decimal" className="entrada mt-1" /></label>}
      <label className="block text-sm font-semibold">{tipo === 'entrada' ? 'Nota fiscal / fornecedor *' : 'Motivo *'}
        <input name="observacao" required minLength={3} placeholder={tipo === 'entrada' ? 'NF 92.378 — Irmãos Ferragens' : tipo === 'ajuste' ? 'Contagem física de 29/10' : 'Ex.: levado para a Praça da Foice'} className="entrada mt-1" /></label>
      <Botao>Registrar</Botao>
    </FormAcao>
  );
}
