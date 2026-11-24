'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lancarPontoLote, type HorariosLote, type ResultadoLote, type SituacaoLote } from '@/app/(app)/dp/ponto/acoes';

export type LinhaPlantao = {
  id: string; nome: string; funcao: string; obra: string;
  fixo: boolean;      // vigia fixo da obra (todo dia) — não é escala
  plantao: boolean;   // pela escala 12x36, hoje é dia dele
  ja: { texto: string } | null;
};
type Sit = 'ok' | 'ok24' | 'folga' | 'falta' | 'falta_justificada';

const PRESENTE = { v: 'ok' as Sit, rotulo: 'Presente', ativo: 'border-ok-600 bg-ok-600 text-white' };
const H24 = { v: 'ok24' as Sit, rotulo: 'Dia + noite (24h)', ativo: 'border-ok-700 bg-ok-700 text-white' };
const RESTO: { v: Sit; rotulo: string; ativo: string }[] = [
  { v: 'folga', rotulo: 'Folga', ativo: 'border-concreto-600 bg-concreto-600 text-white' },
  { v: 'falta', rotulo: 'Falta', ativo: 'border-atraso-500 bg-atraso-500 text-white' },
  { v: 'falta_justificada', rotulo: 'Falta justificada', ativo: 'border-atencao-500 bg-atencao-500 text-white' },
];

export function PlantaoVigias({ dia, diaFormatado, linhas, turnoDuplo = false, entradaPadrao = '18:00', saidaPadrao = '06:00' }:
  { dia: string; diaFormatado: string; linhas: LinhaPlantao[]; turnoDuplo?: boolean; entradaPadrao?: string; saidaPadrao?: string }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [entrada, setEntrada] = useState(entradaPadrao);
  const [saida, setSaida] = useState(saidaPadrao);
  const OPCOES = turnoDuplo ? [PRESENTE, H24, ...RESTO] : [PRESENTE, ...RESTO];
  const [sit, setSit] = useState<Record<string, Sit>>(() =>
    Object.fromEntries(linhas.map((l) => [l.id, l.plantao ? (turnoDuplo ? 'ok24' : 'ok') : 'folga'])));
  const [obs, setObs] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [res, setRes] = useState<ResultadoLote | null>(null);

  const editaveis = linhas.filter((l) => !l.ja);
  const muda = (id: string, v: Sit) => { setSit((s) => ({ ...s, [id]: v })); setConfirmar(false); setRes(null); };
  const todos = (v: Sit) => { setSit((s) => ({ ...s, ...Object.fromEntries(editaveis.map((l) => [l.id, v])) })); setConfirmar(false); setRes(null); };

  const cont = useMemo(() => {
    const c: Record<Sit, number> = { ok: 0, ok24: 0, folga: 0, falta: 0, falta_justificada: 0 };
    editaveis.forEach((l) => { c[sit[l.id]] += 1; });
    return c;
  }, [sit, editaveis]);
  const semMotivo = editaveis.filter((l) => sit[l.id] === 'falta_justificada' && (obs[l.id] ?? '').trim().length < 3);
  const gravaveis = cont.ok + cont.ok24 + cont.falta + cont.falta_justificada;
  const resumo = [cont.ok && `${cont.ok} presente(s)`, cont.ok24 && `${cont.ok24} de 24h`, cont.folga && `${cont.folga} de folga`,
    cont.falta && `${cont.falta} falta(s)`, cont.falta_justificada && `${cont.falta_justificada} falta(s) justificada(s)`].filter(Boolean).join(' · ');

  const grupos = useMemo(() => {
    const m = new Map<string, LinhaPlantao[]>();
    linhas.forEach((l) => m.set(l.obra, [...(m.get(l.obra) ?? []), l]));
    return [...m.entries()];
  }, [linhas]);

  function gravar() {
    setRes(null);
    iniciar(async () => {
      const itens = editaveis.map((l) => ({
        funcionario_id: l.id,
        situacao: (sit[l.id] === 'folga' ? 'nada' : sit[l.id]) as SituacaoLote,
        obs: obs[l.id]?.trim() || undefined,
      }));
      const horarios: HorariosLote = { entrada: '07:00', saida_almoco: '12:00', volta_almoco: '13:00', largada: '17:00',
        noturno_entrada: entrada, noturno_saida: saida };
      const r = await lancarPontoLote(dia, itens, horarios);
      setRes(r); setConfirmar(false);
      if (!r.erro) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {turnoDuplo && <p className="rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">{diaFormatado} é fim de semana ou feriado: o vigia de plantão cobre <b>dia e noite (24h)</b> — use a opção "Dia + noite (24h)". As 12h do 2º turno entram como hora extra.</p>}
      <section className="rounded-lg border border-concreto-200 bg-superficie p-4">
        <h2 className="mb-1 text-[15px] font-bold text-concreto-900">Horário do plantão</h2>
        <p className="mb-3 text-sm text-concreto-500">Quem estiver <b>Presente</b> recebe a entrada em {diaFormatado} e a saída na manhã do dia seguinte (escala 12×36, {entrada} às {saida}){turnoDuplo && <>. No <b>24h</b>, cobre das {saida} às {entrada} (dia) e das {entrada} às {saida} do dia seguinte (noite)</>}.</p>
        <div className="grid grid-cols-2 gap-3 sm:w-80">
          <label className="block text-sm"><span className="mb-1 block font-medium text-concreto-700">Entrada</span>
            <input type="time" value={entrada} onChange={(e) => { setEntrada(e.target.value); setConfirmar(false); }} className="entrada" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-concreto-700">Saída (manhã seguinte)</span>
            <input type="time" value={saida} onChange={(e) => { setSaida(e.target.value); setConfirmar(false); }} className="entrada" /></label>
        </div>
      </section>

      <section className="rounded-lg border border-concreto-200 bg-superficie">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-concreto-200 px-4 py-3">
          <p className="text-sm text-concreto-600"><b className="text-concreto-900">{editaveis.length}</b> vigia(s) para lançar{linhas.length > editaveis.length && <> · {linhas.length - editaveis.length} já lançado(s)</>}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => todos('ok')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Todos presentes</button>
            <button type="button" onClick={() => todos('folga')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Todos folga</button>
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
                        <div className="text-xs text-concreto-500">{l.funcao} • {l.fixo ? 'vigia fixo da obra (todo dia)' : 'escala 12×36 (dia sim, dia não)'}{!l.ja && !l.fixo && (l.plantao ? ' — hoje é dia dele' : ' — pela escala, hoje é folga')}</div>
                      </div>
                      {l.ja ? <span className="text-sm text-concreto-600">Já lançado: <b>{l.ja.texto}</b></span> : (
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Plantão de ${l.nome}`}>
                          {OPCOES.map((o) => (
                            <button key={o.v} type="button" role="radio" aria-checked={s === o.v} onClick={() => muda(l.id, o.v)}
                              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${s === o.v ? o.ativo : 'border-concreto-300 bg-superficie text-concreto-600 hover:bg-concreto-50'}`}>{o.rotulo}</button>))}
                        </div>)}
                    </div>
                    {!l.ja && s === 'falta_justificada' && (
                      <div className="mt-2">
                        <input value={obs[l.id] ?? ''} onChange={(e) => setObs((o) => ({ ...o, [l.id]: e.target.value }))}
                          placeholder="Motivo da falta (obrigatório)"
                          className={`entrada min-w-[14rem] max-w-md py-1.5 text-sm ${(obs[l.id] ?? '').trim().length < 3 ? 'border-atencao-500' : ''}`} /></div>)}
                  </li>);
              })}
            </ul>
          </div>))}
      </section>

      {res?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{res.erro}</p>}
      {res && !res.erro && (
        <div role="status" className="rounded-md bg-ok-50 px-3 py-2 text-sm text-ok-800">
          <b>Plantão de {diaFormatado} lançado:</b> {res.ok ?? 0} presente(s), {res.falta ?? 0} falta(s), {res.falta_justificada ?? 0} falta(s) justificada(s).
          {!!res.pulados?.length && <ul className="mt-1 list-disc pl-5 text-atencao-800">{res.pulados.map((p, i) => <li key={i}>{p.nome}: {p.motivo}</li>)}</ul>}
        </div>)}

      {editaveis.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-concreto-200 bg-superficie px-4 py-3 shadow-cartao">
          <p className="text-sm text-concreto-700">{resumo || 'Ninguém marcado.'}{semMotivo.length > 0 && <span className="ml-2 text-atencao-700">— falta o motivo de {semMotivo.length} falta(s) justificada(s)</span>}</p>
          {!confirmar ? (
            <button type="button" disabled={!gravaveis || semMotivo.length > 0 || enviando} onClick={() => setConfirmar(true)}
              className="rounded-md bg-sinal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sinal-600 disabled:opacity-50">Gravar plantão de {diaFormatado}</button>
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
