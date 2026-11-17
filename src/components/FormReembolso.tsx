'use client';
import { useState } from 'react';
import { UploadArquivo } from './UploadArquivo';
import { Campo } from './ui';
import { registrarReembolso } from '@/app/(app)/financeiro/acoes';

type Obra = { id: string; codigo: string; nome: string };
type Pessoa = { nome: string };

const CATS: [string, string][] = [
  ['administrativo', 'Administrativo (escritório, geral)'],
  ['material', 'Material'],
  ['equipamentos', 'Equipamentos / ferramentas'],
  ['servicos_terceiros', 'Serviços de terceiros'],
  ['mao_de_obra', 'Mão de obra'],
  ['outras_despesas', 'Outras despesas'],
];

export function FormReembolso({ obras, pessoas, hoje }: { obras: Obra[]; pessoas: Pessoa[]; hoje: string }) {
  const [pago, setPago] = useState(false);
  return (
    <UploadArquivo pasta="fin/reembolsos" acao={registrarReembolso} rotuloBotao="Registrar reembolso" exigirArquivo={false}>
      <Campo rotulo="Quem vai receber">
        <input name="favorecido" required minLength={2} list="pessoas-reemb" className="entrada" placeholder="Nome de quem pagou do próprio bolso" />
        <datalist id="pessoas-reemb">{pessoas.map((p) => <option key={p.nome} value={p.nome} />)}</datalist>
      </Campo>
      <Campo rotulo="O que foi o gasto"><input name="descricao" required minLength={3} className="entrada" placeholder="ex.: gasolina para ir à obra, material de limpeza do escritório" /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor (R$)"><input name="valor" required inputMode="decimal" placeholder="0,00" className="entrada" /></Campo>
        <Campo rotulo="Data do gasto"><input type="date" name="competencia" required defaultValue={hoje} max={hoje} className="entrada" /></Campo>
      </div>
      <Campo rotulo="Obra (centro de custo) — opcional">
        <select name="obra_id" className="entrada" defaultValue=""><option value="">Administração (sem obra)</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
      </Campo>
      <Campo rotulo="Tipo de gasto">
        <select name="categoria" className="entrada" defaultValue="administrativo">{CATS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
      </Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="liquidado" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já reembolsei (pago)</label>
      {pago
        ? <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Forma"><select name="forma_pagamento" className="entrada"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>TED</option></select></Campo>
            <Campo rotulo="Data do pagamento"><input type="date" name="liquidado_em" defaultValue={hoje} max={hoje} className="entrada" /></Campo>
          </div>
        : <Campo rotulo="Reembolsar até (vencimento)"><input type="date" name="vencimento" required defaultValue={hoje} className="entrada" /></Campo>}
      {pago && <input type="hidden" name="vencimento" value={hoje} />}
      <p className="text-xs text-concreto-500">Anexe a foto ou o PDF do comprovante do gasto (nota, cupom, recibo).</p>
    </UploadArquivo>
  );
}
