'use client';
import { useState } from 'react';

/** Campos do documento da OC: o vencimento só aparece para boleto; com PIX/cartão/dinheiro o boleto nem aparece. */
export function CamposDocumentoOC({ forma }: { forma: string | null }) {
  const semBoleto = !!forma && forma !== 'boleto';
  const tipos: [string, string][] = [
    ['nf', 'Nota fiscal'],
    ['comprovante', forma === 'pix' ? 'Comprovante do PIX' : 'Comprovante de pagamento (PIX, transferência, cartão)'],
    ...(semBoleto ? [] : [['boleto', 'Boleto'] as [string, string]]),
    ['outro', 'Outro'],
  ];
  const [tipo, setTipo] = useState('nf');
  return (
    <>
      <label className="block text-sm font-semibold">Tipo
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="entrada mt-1">
          {tipos.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">{tipo === 'comprovante' ? 'Identificação (opcional)' : 'Número'}<input name="numero" className="entrada mt-1" /></label>
        <label className="block text-sm font-semibold">Valor (R$)<input name="valor" inputMode="decimal" className="entrada mt-1" /></label>
      </div>
      {tipo === 'boleto' && <label className="block text-sm font-semibold">Vencimento do boleto<input type="date" name="vencimento" className="entrada mt-1" /></label>}
    </>
  );
}
