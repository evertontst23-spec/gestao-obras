'use client';
import { useState } from 'react';

type T = { id: string; numero: number; titulo: string; etapa_nome: string | null; local: string | null; minha: boolean };
const cod = (n: number) => 'T-' + String(n).padStart(5, '0');

/**
 * Serviço do pedido: tarefa da planilha da obra (obrigatório). "Sem vínculo" só com observação
 * explicando para que é o material.
 */
export function VinculoTarefa({ tarefas, planilhaHref }: { tarefas: T[]; planilhaHref: string }) {
  const [v, setV] = useState('');
  const semVinculo = v === 'sem';
  const grupos = [...new Set(tarefas.map((t) => t.etapa_nome ?? 'Sem etapa'))];
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Serviço relacionado (tarefa da planilha) *</span>
        <select name="tarefa_id" required value={v} onChange={(e) => setV(e.target.value)} className="entrada">
          <option value="" disabled>Selecione a tarefa…</option>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {tarefas.filter((t) => (t.etapa_nome ?? 'Sem etapa') === g).map((t) => (
                <option key={t.id} value={t.id}>{cod(t.numero)} — {t.titulo}{t.local ? ` (${t.local})` : ''}{t.minha ? ' ★' : ''}</option>))}
            </optgroup>))}
          <option value="sem">Sem vínculo (uso geral da obra) — exige observação</option>
        </select>
        <span className="mt-1 block text-xs text-concreto-500">
          {tarefas.length ? 'Tarefas abertas do plano de ação da obra. ★ = suas tarefas.' : <>Esta obra ainda não tem tarefas abertas. <a href={planilhaHref} className="link">Lançar a planilha de tarefas</a> ou use “Sem vínculo”.</>}
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Observações{semVinculo && ' * (para que é o material?)'}</span>
        <textarea name="observacoes" rows={2} required={semVinculo} minLength={semVinculo ? 5 : undefined}
          placeholder={semVinculo ? 'Ex.: manutenção do canteiro, almoxarifado da obra, EPI coletivo…' : ''}
          className={`entrada ${semVinculo ? 'border-atencao-500 bg-atencao-50' : ''}`} />
      </label>
    </div>
  );
}
