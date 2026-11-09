'use client';
import { useState } from 'react';
import { UploadArquivo } from './UploadArquivo';
import { Campo } from './ui';
import { registrarNota } from '@/app/(app)/financeiro/notas/acoes';

type Op = { id: string | number; codigo?: string; nome: string };
export function FormNota({ obras, categorias, hoje }: { obras: Op[]; categorias: Op[]; hoje: string }) {
  const [pago, setPago] = useState(true);
  return (
    <UploadArquivo pasta="sup/notas" acao={registrarNota} rotuloBotao="Registrar nota" exigirArquivo={false}>
      <Campo rotulo="Tipo da nota"><select name="categoria_id" required className="entrada" defaultValue="">
        <option value="" disabled>Escolha…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
      <Campo rotulo="Obra (centro de custo)"><select name="obra_id" required className="entrada" defaultValue="">
        <option value="" disabled>Escolha…</option>{obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
      <Campo rotulo="Estabelecimento / fornecedor"><input name="estabelecimento" required minLength={2} className="entrada" placeholder="ex.: Restaurante da Esquina, Casa do Construtor" /></Campo>
      <Campo rotulo="O que foi (opcional)"><input name="descricao" className="entrada" placeholder="ex.: almoço de 8 funcionários, parafusos e buchas" /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor (R$)"><input name="valor" required inputMode="decimal" placeholder="0,00" className="entrada" /></Campo>
        <Campo rotulo="Data da nota"><input type="date" name="data_nota" required defaultValue={hoje} max={hoje} className="entrada" /></Campo>
      </div>
      <Campo rotulo="Nº da nota / cupom (opcional)"><input name="documento_numero" className="entrada" /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pago" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já foi paga</label>
      {pago
        ? <Campo rotulo="Forma de pagamento"><select name="forma_pagamento" className="entrada"><option>PIX</option><option>Cartão</option><option>Dinheiro</option><option>Boleto</option><option>TED</option></select></Campo>
        : <Campo rotulo="Vencimento"><input type="date" name="vencimento" required defaultValue={hoje} className="entrada" /></Campo>}
      <p className="text-xs text-concreto-500">Anexe a foto ou o PDF da nota.</p>
    </UploadArquivo>
  );
}
