'use client';
import { useState } from 'react';
import { UploadArquivo } from './UploadArquivo';
import { Campo } from './ui';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA } from '@/lib/dominio';
import { criarLancamento, liquidarLancamento } from '@/app/(app)/financeiro/acoes';

type Op = { id: string; codigo?: string; nome: string };
export function FormLancamento({ obras, fornecedores, hoje, obraFixa }: { obras: Op[]; fornecedores: Op[]; hoje: string; obraFixa?: string }) {
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [pago, setPago] = useState(false);
  const cats = tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA;
  return (
    <UploadArquivo pasta="fin/docs" acao={criarLancamento} rotuloBotao="Registrar lançamento" exigirArquivo={false}>
      <input type="hidden" name="tipo" value={tipo} />
      <div className="grid grid-cols-2 gap-1 rounded-md bg-concreto-100 p-1 text-sm font-semibold">
        {(['despesa', 'receita'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} className={`min-h-[40px] rounded ${tipo === t ? (t === 'despesa' ? 'bg-atraso-500 text-white' : 'bg-ok-500 text-white') : 'text-concreto-700'}`}>
            {t === 'despesa' ? 'A pagar' : 'A receber'}</button>))}
      </div>
      <Campo rotulo="Descrição"><input name="descricao" required minLength={3} className="entrada" placeholder={tipo === 'despesa' ? 'ex.: Aluguel de andaimes — outubro' : 'ex.: Venda de sobra de material'} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Categoria"><select name="categoria" required className="entrada" key={tipo}>{Object.entries(cats).filter(([k]) => !['medicao', 'retencao_tecnica'].includes(k)).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
        <Campo rotulo="Valor (R$)"><input name="valor" required inputMode="decimal" placeholder="0,00" className="entrada" /></Campo>
        <Campo rotulo="Vencimento"><input type="date" name="vencimento" required defaultValue={hoje} className="entrada" /></Campo>
        <Campo rotulo="Competência"><input type="date" name="competencia" defaultValue={hoje} className="entrada" /></Campo>
      </div>
      {obraFixa ? <input type="hidden" name="obra_id" value={obraFixa} /> : (
        <Campo rotulo="Obra (centro de custo)"><select name="obra_id" className="entrada"><option value="">Administração central</option>{obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>)}
      {tipo === 'despesa'
        ? <Campo rotulo="Fornecedor"><select name="fornecedor_id" className="entrada"><option value="">—</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>
        : <Campo rotulo="Pagador"><input name="favorecido" className="entrada" /></Campo>}
      <Campo rotulo="Nº do documento (NF, boleto, contrato)"><input name="documento_numero" className="entrada" /></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="liquidado" checked={pago} onChange={(e) => setPago(e.target.checked)} /> Já {tipo === 'despesa' ? 'pago' : 'recebido'}</label>
      {pago && <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data"><input type="date" name="liquidado_em" defaultValue={hoje} max={hoje} className="entrada" /></Campo>
        <Campo rotulo="Forma"><select name="forma_pagamento" className="entrada"><option>PIX</option><option>Boleto</option><option>TED</option><option>Dinheiro</option><option>Cartão</option><option>Cheque</option></select></Campo>
      </div>}
    </UploadArquivo>
  );
}

export function FormBaixa({ id, tipo, valor, hoje }: { id: string; tipo: string; valor: number; hoje: string }) {
  return (
    <UploadArquivo pasta="fin/comprovantes" acao={liquidarLancamento} rotuloBotao={tipo === 'despesa' ? 'Registrar pagamento' : 'Registrar recebimento'} exigirArquivo={false}>
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data"><input type="date" name="data" required defaultValue={hoje} max={hoje} className="entrada" /></Campo>
        <Campo rotulo="Valor pago (R$)" dica="Vazio = valor do título"><input name="valor" inputMode="decimal" placeholder={valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} className="entrada" /></Campo>
      </div>
      <Campo rotulo="Forma"><select name="forma" className="entrada"><option>PIX</option><option>Boleto</option><option>TED</option><option>Dinheiro</option><option>Cartão</option><option>Cheque</option></select></Campo>
      <p className="text-xs text-concreto-500">Anexe o comprovante (foto ou PDF).</p>
    </UploadArquivo>
  );
}
