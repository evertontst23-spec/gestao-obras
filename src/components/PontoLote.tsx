'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lancarPontoLote, type HorariosLote, type ResultadoLote, type SituacaoLote } from '@/app/(app)/dp/ponto/acoes';

export type LinhaLote = {
  id: string; nome: string; funcao: string; obra: string;
  vigia: boolean;      // escala 12x36 (dia sim, dia não)
  plantao?: boolean;   // vigia: pela escala, hoje é dia dele (folgou ontem e trabalhou anteontem)
  ja: { tipo: 'marcacao' | 'abono'; texto: string } | null;
};
/** 'folga' só existe na tela: folga da escala do vigia não grava nada e não conta falta */
type Sit = SituacaoLote | 'folga';

const OK = { v: 'ok' as Sit, rotulo: 'OK', ativo: 'border-ok-500 bg-ok-500 text-white' };
const COMUNS: { v: Sit; rotulo: string; ativo: string }[] = [
  { v: 'falta', rotulo: 'Falta', ativo: 'border-atraso-500 bg-atraso-500 text-white' },
  { v: 'falta_justificada', rotulo: 'Falta justificada', ativo: 'border-atencao-500 bg-atencao-500 text-white' },
  { v: 'atestado', rotulo: 'Atestado', ativo: 'border-sky-600 bg-sky-600 text-white' },
];
const OPCOES = [OK, ...COMUNS, { v: 'nada' as Sit, rotulo: 'Em branco', ativo: 'border-concreto-500 bg-concreto-500 text-white' }];
const OPCOES_VIGIA = [{ ...OK, rotulo: 'Plantão' }, { v: 'folga' as Sit, rotulo: 'Folga da escala', ativo: 'border-concreto-600 bg-concreto-600 text-white' }, ...COMUNS];
const CAMPOS_HORA: [keyof HorariosLote, string][] = [
  ['entrada', 'Entrada no expediente'], ['saida_almoco', 'Saída para o almoço'], ['volta_almoco', 'Volta do almoço'], ['largada', 'Largada'],
];

export function PontoLote({ dia, diaFormatado, linhas, horariosPadrao }:
  { dia: string; diaFormatado: string; linhas: LinhaLote[]; horariosPadrao: HorariosLote }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [horarios, setHorarios] = useState<HorariosLote>(horariosPadrao);
  const [sit, setSit] = useState<Record<string, Sit>>(() =>
    Object.fromEntries(linhas.map((l) => [l.id, l.ja ? 'nada' : l.vigia ? (l.plantao ? 'ok' : 'folga') : 'ok'])));
  const [obs, setObs] = useState<Record<string, string>>({});
  const [dias, setDias] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [res, setRes] = useState<ResultadoLote | null>(null);

  const editaveis = linhas.filter((l) => !l.ja);
  const cont = useMemo(() => {
    const c: Record<Sit, number> = { ok: 0, falta: 0, falta_justificada: 0, atestado: 0, nada: 0, folga: 0 };
    editaveis.forEach((l) => { c[sit[l.id]] += 1; });
    return c;
  }, [sit, editaveis]);
  const semMotivo = editaveis.filter((l) => sit[l.id] === 'falta_justificada' && (obs[l.id] ?? '').trim().length < 3);
  const gravaveis = cont.ok + cont.falta + cont.falta_justificada + cont.atestado;
  const resumo = [cont.ok && `${cont.ok} OK/plantão`, cont.falta && `${cont.falta} falta(s)`, cont.falta_justificada && `${cont.falta_justificada} falta(s) justificada(s)`,
    cont.atestado && `${cont.atestado} atestado(s)`, cont.folga && `${cont.folga} vigia(s) de folga`].filter(Boolean).join(' · ');
  const grupos = useMemo(() => {
    const m = new Map<string, LinhaLote[]>();
    linhas.forEach((l) => m.set(l.obra, [...(m.get(l.obra) ?? []), l]));
    return [...m.entries()];
  }, [linhas]);

  // "Todos OK" / "Limpar" valem só para a equipe de jornada normal; vigias seguem a escala
  const todos = (v: Sit) => { setSit((s) => ({ ...s, ...Object.fromEntries(editaveis.filter((l) => !l.vigia).map((l) => [l.id, v])) })); setConfirmar(false); };
  const muda = (id: string, v: Sit) => { setSit((s) => ({ ...s, [id]: v })); setConfirmar(false); setRes(null); };

  function gravar() {
    setRes(null);
    iniciar(async () => {
      const itens = editaveis.map((l) => ({ funcionario_id: l.id, situacao: (sit[l.id] === 'folga' ? 'nada' : sit[l.id]) as SituacaoLote, obs: obs[l.id]?.trim() || undefined,
        dias: sit[l.id] === 'atestado' ? Number(dias[l.id] || 1) : undefined }));
      const r = await lancarPontoLote(dia, itens, horarios);
      setRes(r); setConfirmar(false);
      if (!r.erro) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-concreto-200 bg-superficie p-4">
        <h2 className="mb-1 text-[15px] font-bold text-concreto-900">Horários de quem está OK</h2>
        <p className="mb-3 text-sm text-concreto-500">Quem ficar como <b>OK</b> recebe estas 4 marcações em {diaFormatado}. Ajuste se o horário da obra for outro.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CAMPOS_HORA.map(([k, r]) => (
            <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-concreto-700">{r}</span>
              <input type="time" value={horarios[k]} onChange={(e) => { setHorarios((h) => ({ ...h, [k]: e.target.value })); setConfirmar(false); }} className="entrada" /></label>))}
        </div>
      </section>

      <section className="rounded-lg border border-concreto-200 bg-superficie">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-concreto-200 px-4 py-3">
          <p className="text-sm text-concreto-600"><b className="text-concreto-900">{editaveis.length}</b> para lançar{linhas.length > editaveis.length && <> · {linhas.length - editaveis.length} já lançado(s)</>}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => todos('ok')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Todos OK</button>
            <button type="button" onClick={() => todos('nada')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Limpar tudo</button>
          </div>
        </div>
        {grupos.map(([obra, ls]) => (
          <div key={obra}>
            {grupos.length > 1 && <div className="bg-elevada px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-concreto-500">{obra}</div>}
            <ul className="divide-y divide-concreto-100">
              {ls.map((l) => {
                const s = sit[l.id];
                return (
                  <li key={l.id} className={`px-4 py-3 ${l.ja ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-concreto-900">{l.nome}</div>
                        <div className="text-xs text-concreto-500">{l.funcao}{l.vigia && ' • escala 12x36 (dia sim, dia não)'}</div>
                      </div>
                      {l.ja ? <span className="text-sm text-concreto-600">Já lançado: <b>{l.ja.texto}</b></span> : (
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Situação de ${l.nome}`}>
                          {(l.vigia ? OPCOES_VIGIA : OPCOES).map((o) => (
                            <button key={o.v} type="button" role="radio" aria-checked={s === o.v} onClick={() => muda(l.id, o.v)}
                              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${s === o.v ? o.ativo : 'border-concreto-300 bg-superficie text-concreto-600 hover:bg-concreto-50'}`}>{o.rotulo}</button>))}
                        </div>)}
                    </div>
                    {!l.ja && s === 'folga' && (
                      <p className="mt-1.5 text-xs text-concreto-500">Não é o dia dele — folga da escala de vigia (não conta falta, não grava marcação).</p>)}
                    {!l.ja && (s === 'falta_justificada' || s === 'atestado') && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input value={obs[l.id] ?? ''} onChange={(e) => setObs((o) => ({ ...o, [l.id]: e.target.value }))}
                          placeholder={s === 'falta_justificada' ? 'Motivo da falta (obrigatório)' : 'Observação (opcional — ex.: CID, médico)'}
                          className={`entrada min-w-[14rem] flex-1 py-1.5 text-sm ${s === 'falta_justificada' && (obs[l.id] ?? '').trim().length < 3 ? 'border-atencao-500' : ''}`} />
                        {s === 'atestado' && (
                          <label className="flex items-center gap-1.5 text-sm text-concreto-600">
                            <input type="number" min={1} max={365} value={dias[l.id] ?? '1'} onChange={(e) => setDias((d) => ({ ...d, [l.id]: e.target.value }))} className="entrada w-20 py-1.5 text-sm" /> dia(s)</label>)}
                      </div>)}
                  </li>);
              })}
            </ul>
          </div>))}
      </section>

      {res?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{res.erro}</p>}
      {res && !res.erro && (
        <div role="status" className="rounded-md bg-ok-50 px-3 py-2 text-sm text-ok-800">
          <b>Dia {diaFormatado} lançado:</b> {res.ok ?? 0} OK, {res.falta ?? 0} falta(s), {res.falta_justificada ?? 0} falta(s) justificada(s), {res.atestado ?? 0} atestado(s).
          {!!res.pulados?.length && <ul className="mt-1 list-disc pl-5 text-atencao-800">{res.pulados.map((p, i) => <li key={i}>{p.nome}: {p.motivo}</li>)}</ul>}
        </div>)}

      {editaveis.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-concreto-200 bg-superficie px-4 py-3 shadow-cartao">
          <p className="text-sm text-concreto-700">{resumo || 'Ninguém marcado.'}{semMotivo.length > 0 && <span className="ml-2 text-atencao-700">— falta o motivo de {semMotivo.length} falta(s) justificada(s)</span>}</p>
          {!confirmar ? (
            <button type="button" disabled={!gravaveis || semMotivo.length > 0 || enviando} onClick={() => setConfirmar(true)}
              className="rounded-md bg-sinal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sinal-600 disabled:opacity-50">Gravar o dia {diaFormatado}</button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-concreto-900">Confirma? O ponto gravado não se apaga (só se corrige pelo espelho).</span>
              <button type="button" onClick={() => setConfirmar(false)} disabled={enviando} className="rounded-md border border-concreto-300 px-3 py-2 text-sm font-semibold text-concreto-800">Voltar</button>
              <button type="button" onClick={gravar} disabled={enviando} className="rounded-md bg-ok-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ok-700 disabled:opacity-60">{enviando ? 'Gravando…' : 'Confirmar e gravar'}</button>
            </div>)}
        </div>)}
    </div>
  );
}
