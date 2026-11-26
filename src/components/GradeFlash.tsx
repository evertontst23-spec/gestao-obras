'use client';
import { useMemo, useState } from 'react';
import { reais } from '@/lib/dominio';
import { salvarDiasFlash } from '@/app/(app)/dp/beneficios/acoes';

export type PessoaFlash = {
  func_id: string; nome: string; cpf: string | null; cargo: string; empresa: string;
  dias: number; faltas: number;
  retroAlim: number; qtdAlim: number; unitAlim: number;
  retroPass: number; qtdPass: number; unitPass: number;
};
const tot = (dias: number, retro: number, faltas: number, qtd: number, unit: number) =>
  Math.round(Math.max(dias + retro - faltas, 0) * qtd * unit * 100) / 100;
const br = (v: number) => v.toFixed(2).replace('.', ',');

export function GradeFlash({ competenciaId, editavel, pessoas }: { competenciaId: string; editavel: boolean; pessoas: PessoaFlash[] }) {
  const [est, setEst] = useState<Record<string, { dias: number; faltas: number; estado?: 'salvando' | 'ok' | 'erro' }>>(
    () => Object.fromEntries(pessoas.map((p) => [p.func_id, { dias: p.dias, faltas: p.faltas }])));

  const linha = (p: PessoaFlash) => {
    const e = est[p.func_id] ?? { dias: p.dias, faltas: p.faltas };
    const a = tot(e.dias, p.retroAlim, e.faltas, p.qtdAlim, p.unitAlim);
    const t = tot(e.dias, p.retroPass, e.faltas, p.qtdPass, p.unitPass);
    return { ...p, ...e, alim: a, pass: t, total: a + t };
  };
  const linhas = useMemo(() => pessoas.map(linha), [pessoas, est]);
  const totGeral = linhas.reduce((s, l) => ({ alim: s.alim + l.alim, pass: s.pass + l.pass, total: s.total + l.total }), { alim: 0, pass: 0, total: 0 });

  const setCampo = (id: string, campo: 'dias' | 'faltas', v: string) =>
    setEst((s) => ({ ...s, [id]: { ...s[id], [campo]: Math.max(0, Math.min(31, Number(v.replace(',', '.')) || 0)), estado: undefined } }));
  const salvar = async (id: string) => {
    const e = est[id]; if (!e) return;
    setEst((s) => ({ ...s, [id]: { ...s[id], estado: 'salvando' } }));
    const r = await salvarDiasFlash({ competencia_id: competenciaId, funcionario_id: id, dias: String(e.dias), dias_desconto: String(e.faltas) });
    setEst((s) => ({ ...s, [id]: { ...s[id], estado: r?.erro ? 'erro' : 'ok' } }));
  };

  const baixarCSV = () => {
    const cab = ['CPF', 'Nome', 'Cargo', 'Empresa', 'Dias', 'Faltas', 'Alimentacao', 'Passagem', 'Total'];
    const linhasCsv = linhas.map((l) => [l.cpf ?? '', l.nome, l.cargo, l.empresa, String(l.dias), String(l.faltas), br(l.alim), br(l.pass), br(l.total)]);
    const csv = [cab, ...linhasCsv].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'beneficios-flash.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const inp = 'entrada w-16 px-2 py-1 text-right';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-concreto-600">{linhas.length} funcionário(s). Digite os <b>dias</b>; as <b>faltas</b> já vêm preenchidas. Salva ao sair do campo.</p>
        <button onClick={baixarCSV} className="rounded-md bg-concreto-800 px-3 py-2 text-sm font-semibold text-white">⬇ Baixar CSV (Flash)</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-superficie"><table className="tabela">
        <thead><tr>
          <th>Funcionário</th><th>CPF</th><th className="text-center">Dias</th><th className="text-center">Faltas</th>
          <th className="text-right">Alimentação</th><th className="text-right">Passagem</th><th className="text-right">Total</th>
        </tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.func_id}>
              <td><b>{l.nome}</b><div className="text-xs text-concreto-500">{l.cargo}{l.empresa ? ` • ${l.empresa}` : ''}</div></td>
              <td className="whitespace-nowrap font-mono text-xs">{l.cpf ?? <span className="text-atraso-700">sem CPF</span>}</td>
              <td className="text-center">{editavel
                ? <input className={inp} inputMode="numeric" value={l.dias} onChange={(e) => setCampo(l.func_id, 'dias', e.target.value)} onBlur={() => salvar(l.func_id)} aria-label={`Dias de ${l.nome}`} />
                : l.dias}</td>
              <td className="text-center">{editavel
                ? <input className={inp} inputMode="numeric" value={l.faltas} onChange={(e) => setCampo(l.func_id, 'faltas', e.target.value)} onBlur={() => salvar(l.func_id)} aria-label={`Faltas de ${l.nome}`} />
                : l.faltas}
                {est[l.func_id]?.estado === 'salvando' && <span className="ml-1 text-[10px] text-concreto-400">…</span>}
                {est[l.func_id]?.estado === 'ok' && <span className="ml-1 text-[10px] text-ok-700">✓</span>}
                {est[l.func_id]?.estado === 'erro' && <span className="ml-1 text-[10px] text-atraso-700">erro</span>}</td>
              <td className="whitespace-nowrap text-right font-mono">{reais(l.alim)}</td>
              <td className="whitespace-nowrap text-right font-mono">{reais(l.pass)}</td>
              <td className="whitespace-nowrap text-right font-mono font-semibold">{reais(l.total)}</td>
            </tr>))}
          <tr className="bg-concreto-50 font-semibold">
            <td colSpan={4}>Total geral</td>
            <td className="whitespace-nowrap text-right font-mono">{reais(totGeral.alim)}</td>
            <td className="whitespace-nowrap text-right font-mono">{reais(totGeral.pass)}</td>
            <td className="whitespace-nowrap text-right font-mono">{reais(totGeral.total)}</td>
          </tr>
        </tbody>
      </table></div>
    </div>
  );
}
