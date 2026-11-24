'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lancarPontoLote, type HorariosLote, type ResultadoLote, type SituacaoLote } from '@/app/(app)/dp/ponto/acoes';

export type LinhaLote = {
  id: string; nome: string; funcao: string; obra: string;
  vigia: boolean;      // escala 12x36 (dia sim, dia não)
  noturno?: boolean;   // vigia noturno: plantão entra num dia e sai na manhã seguinte
  fixo?: boolean;      // vigia fixo da obra: trabalha todo dia (não é escala)
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
const H24 = { v: 'ok24' as Sit, rotulo: 'Dia + noite (24h)', ativo: 'border-ok-700 bg-ok-700 text-white' };
const OPCOES_FIXO = [{ ...OK, rotulo: 'Plantão' }, ...COMUNS, { v: 'folga' as Sit, rotulo: 'Folga', ativo: 'border-concreto-600 bg-concreto-600 text-white' }];
const OPCOES_VIGIA = [{ ...OK, rotulo: 'Plantão' }, { v: 'folga' as Sit, rotulo: 'Folga da escala', ativo: 'border-concreto-600 bg-concreto-600 text-white' }, ...COMUNS];
const CAMPOS_HORA: [keyof HorariosLote, string][] = [
  ['entrada', 'Entrada no expediente'], ['saida_almoco', 'Saída para o almoço'], ['volta_almoco', 'Volta do almoço'], ['largada', 'Largada'],
];
const CAMPOS_NOITE: [keyof HorariosLote, string][] = [['noturno_entrada', 'Entrada no plantão'], ['noturno_saida', 'Saída (manhã seguinte)']];

export function PontoLote({ dia, diaFormatado, linhas, horariosPadrao, turnoDuplo = false }:
  { dia: string; diaFormatado: string; linhas: LinhaLote[]; horariosPadrao: HorariosLote; turnoDuplo?: boolean }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [horarios, setHorarios] = useState<HorariosLote>(horariosPadrao);
  const [sit, setSit] = useState<Record<string, Sit>>(() =>
    Object.fromEntries(linhas.map((l) => [l.id, l.ja ? 'nada' : l.vigia ? (l.plantao ? (turnoDuplo ? 'ok24' : 'ok') : 'folga') : 'ok'])));
  const [obs, setObs] = useState<Record<string, string>>({});
  const [dias, setDias] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [res, setRes] = useState<ResultadoLote | null>(null);

  // Vigias (12x36, plantão da noite) ficam numa aba separada: a equipe do dia é fechada no fim do
  // expediente; o plantão do vigia só é lançado no dia seguinte, sem travar o fechamento do dia.
  const temVigia = useMemo(() => linhas.some((l) => l.vigia), [linhas]);
  const [modo, setModo] = useState<'dia' | 'vigia'>('dia');
  const visiveis = useMemo(() => linhas.filter((l) => (modo === 'vigia' ? l.vigia : !l.vigia)), [linhas, modo]);
  const pendDia = useMemo(() => linhas.filter((l) => !l.vigia && !l.ja).length, [linhas]);
  const pendVigia = useMemo(() => linhas.filter((l) => l.vigia && !l.ja).length, [linhas]);

  const editaveis = visiveis.filter((l) => !l.ja);
  const cont = useMemo(() => {
    const c: Record<Sit, number> = { ok: 0, ok24: 0, falta: 0, falta_justificada: 0, atestado: 0, nada: 0, folga: 0 };
    editaveis.forEach((l) => { c[sit[l.id]] += 1; });
    return c;
  }, [sit, editaveis]);
  const semMotivo = editaveis.filter((l) => sit[l.id] === 'falta_justificada' && (obs[l.id] ?? '').trim().length < 3);
  const gravaveis = cont.ok + cont.ok24 + cont.falta + cont.falta_justificada + cont.atestado;
  const resumo = [cont.ok && `${cont.ok} OK/plantão`, cont.ok24 && `${cont.ok24} plantão(ões) de 24h`, cont.falta && `${cont.falta} falta(s)`, cont.falta_justificada && `${cont.falta_justificada} falta(s) justificada(s)`,
    cont.atestado && `${cont.atestado} atestado(s)`, cont.folga && `${cont.folga} vigia(s) de folga`].filter(Boolean).join(' · ');
  const grupos = useMemo(() => {
    const m = new Map<string, LinhaLote[]>();
    visiveis.forEach((l) => m.set(l.obra, [...(m.get(l.obra) ?? []), l]));
    return [...m.entries()];
  }, [visiveis]);

  // aplica um valor a todos os editáveis da aba atual
  const todos = (v: Sit) => { setSit((s) => ({ ...s, ...Object.fromEntries(editaveis.map((l) => [l.id, v])) })); setConfirmar(false); setRes(null); };
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

  const trocarModo = (m: 'dia' | 'vigia') => { setModo(m); setConfirmar(false); setRes(null); };

  return (
    <div className="space-y-4">
      {temVigia && (
        <div className="flex gap-1 rounded-lg border border-concreto-200 bg-elevada p-1 text-sm font-semibold">
          {([['dia', 'Equipe do dia', pendDia], ['vigia', 'Vigias (plantão)', pendVigia]] as const).map(([m, rotulo, pend]) => (
            <button key={m} type="button" onClick={() => trocarModo(m)}
              className={`flex-1 rounded-md px-3 py-2 ${modo === m ? 'bg-superficie text-concreto-900 shadow-cartao' : 'text-concreto-600 hover:text-concreto-900'}`}>
              {rotulo}{pend > 0 && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${modo === m ? 'bg-sinal-100 text-sinal-800' : 'bg-concreto-200 text-concreto-700'}`}>{pend}</span>}</button>))}
        </div>)}
      {temVigia && modo === 'vigia' && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">Plantão dos vigias — lance normalmente no dia seguinte, depois que o plantão fecha. Fechar a equipe do dia não depende disto.</p>)}

      <section className="rounded-lg border border-concreto-200 bg-superficie p-4">
        {modo === 'dia' ? (<>
          <h2 className="mb-1 text-[15px] font-bold text-concreto-900">Horários de quem está OK</h2>
          <p className="mb-3 text-sm text-concreto-500">Quem ficar como <b>OK</b> recebe estas 4 marcações em {diaFormatado}. Ajuste se o horário da obra for outro.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CAMPOS_HORA.map(([k, r]) => (
              <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-concreto-700">{r}</span>
                <input type="time" value={horarios[k]} onChange={(e) => { setHorarios((h) => ({ ...h, [k]: e.target.value })); setConfirmar(false); }} className="entrada" /></label>))}
          </div>
        </>) : (<>
          <h2 className="mb-1 text-[15px] font-bold text-concreto-900">Horário do plantão</h2>
          <p className="mb-2 text-sm text-concreto-500">{turnoDuplo
            ? <>No <b>Dia + noite (24h)</b> o vigia recebe o turno do dia (das {horarios.noturno_saida} às {horarios.noturno_entrada}) e o da noite (das {horarios.noturno_entrada} às {horarios.noturno_saida} do dia seguinte). As primeiras 12h são o plantão normal; as outras 12h entram como hora extra.</>
            : <>Vigia noturno de plantão recebe a entrada em {diaFormatado} e a saída na manhã do dia seguinte (conta tudo no dia {diaFormatado}).</>}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CAMPOS_NOITE.map(([k, r]) => (
              <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-concreto-700">{r}</span>
                <input type="time" value={horarios[k]} onChange={(e) => { setHorarios((h) => ({ ...h, [k]: e.target.value })); setConfirmar(false); }} className="entrada" /></label>))}
          </div>
        </>)}
      </section>

      <section className="rounded-lg border border-concreto-200 bg-superficie">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-concreto-200 px-4 py-3">
          <p className="text-sm text-concreto-600"><b className="text-concreto-900">{editaveis.length}</b> para lançar{visiveis.length > editaveis.length && <> · {visiveis.length - editaveis.length} já lançado(s)</>}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {modo === 'vigia' ? (<>
              <button type="button" onClick={() => todos('ok')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Todos plantão</button>
              <button type="button" onClick={() => todos('folga')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Todos folga</button>
            </>) : (<>
              <button type="button" onClick={() => todos('ok')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Todos OK</button>
              <button type="button" onClick={() => todos('nada')} className="rounded-md border border-concreto-300 px-3 py-1.5 font-semibold text-concreto-800 hover:bg-concreto-50">Limpar tudo</button>
            </>)}
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
                        <div className="text-xs text-concreto-500">{l.funcao}{l.vigia && ` • ${l.fixo ? 'vigia fixo da obra (todo dia)' : 'escala 12x36 (dia sim, dia não)'}${l.noturno ? ` — plantão ${horarios.noturno_entrada} às ${horarios.noturno_saida}` : ''}`}</div>
                      </div>
                      {l.ja ? <span className="text-sm text-concreto-600">Já lançado: <b>{l.ja.texto}</b></span> : (
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Situação de ${l.nome}`}>
                          {(l.vigia ? [...(turnoDuplo ? [H24] : []), ...(l.fixo ? OPCOES_FIXO : OPCOES_VIGIA)] : OPCOES).map((o) => (
                            <button key={o.v} type="button" role="radio" aria-checked={s === o.v} onClick={() => muda(l.id, o.v)}
                              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${s === o.v ? o.ativo : 'border-concreto-300 bg-superficie text-concreto-600 hover:bg-concreto-50'}`}>{o.rotulo}</button>))}
                        </div>)}
                    </div>
                    {!l.ja && s === 'folga' && (
                      <p className="mt-1.5 text-xs text-concreto-500">{l.fixo ? 'Folga do vigia neste dia (não grava marcação).' : 'Não é o dia dele — folga da escala de vigia (não conta falta, não grava marcação).'}</p>)}
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
          <b>Dia {diaFormatado} lançado:</b> {res.ok ?? 0} OK{res.plantao_24h ? ` (${res.plantao_24h} de 24h)` : ''}, {res.falta ?? 0} falta(s), {res.falta_justificada ?? 0} falta(s) justificada(s), {res.atestado ?? 0} atestado(s).
          {!!res.pulados?.length && <ul className="mt-1 list-disc pl-5 text-atencao-800">{res.pulados.map((p, i) => <li key={i}>{p.nome}: {p.motivo}</li>)}</ul>}
        </div>)}

      {editaveis.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-concreto-200 bg-superficie px-4 py-3 shadow-cartao">
          <p className="text-sm text-concreto-700">{resumo || 'Ninguém marcado.'}{semMotivo.length > 0 && <span className="ml-2 text-atencao-700">— falta o motivo de {semMotivo.length} falta(s) justificada(s)</span>}</p>
          {!confirmar ? (
            <button type="button" disabled={!gravaveis || semMotivo.length > 0 || enviando} onClick={() => setConfirmar(true)}
              className="rounded-md bg-sinal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sinal-600 disabled:opacity-50">{modo === 'vigia' ? `Gravar os vigias ${diaFormatado}` : `Gravar a equipe do dia ${diaFormatado}`}</button>
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
