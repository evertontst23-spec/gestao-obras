'use client';
import { useState } from 'react';

export type PessoaFrente = { funcionario_id?: string | null; nome: string; funcao: string };
export type Frente = { servico: string; local?: string; tarefa_id?: string | null; equipe: PessoaFrente[] };
type Func = { id: string; nome: string; funcao: string | null; daObra: boolean };

/** RDO: frentes de serviço — o serviço, onde, e quem trabalhou nele (funcionário e função). */
export function FrentesServico({ funcionarios, tarefas, inicial }: { funcionarios: Func[]; tarefas: { id: string; titulo: string }[]; inicial?: Frente[] }) {
  const [frentes, setFrentes] = useState<Frente[]>(inicial?.length ? inicial : [{ servico: '', local: '', equipe: [] }]);
  const muda = (i: number, p: Partial<Frente>) => setFrentes((fs) => fs.map((f, k) => (k === i ? { ...f, ...p } : f)));
  const usados = new Set(frentes.flatMap((f) => f.equipe.map((p) => p.funcionario_id)).filter(Boolean));
  const pessoas = new Set(frentes.flatMap((f) => f.equipe.map((p) => p.funcionario_id ?? p.nome.trim().toLowerCase())).filter(Boolean)).size;
  const porFuncao = new Map<string, number>();
  frentes.flatMap((f) => f.equipe).forEach((p) => { const k = p.funcao || 'sem função'; porFuncao.set(k, (porFuncao.get(k) ?? 0) + 1); });

  function addFuncionario(i: number, id: string) {
    const f = funcionarios.find((x) => x.id === id);
    if (!f) return;
    muda(i, { equipe: [...frentes[i].equipe, { funcionario_id: f.id, nome: f.nome, funcao: f.funcao ?? '' }] });
  }
  function addEquipeObra(i: number) {
    const novos = funcionarios.filter((f) => f.daObra && !usados.has(f.id)).map((f) => ({ funcionario_id: f.id, nome: f.nome, funcao: f.funcao ?? '' }));
    muda(i, { equipe: [...frentes[i].equipe, ...novos] });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="frentes" value={JSON.stringify(frentes.filter((f) => f.servico.trim() || f.equipe.length))} />
      <datalist id="tarefas-rdo">{tarefas.map((t) => <option key={t.id} value={t.titulo} />)}</datalist>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold">Frentes de serviço</span>
        <span className="text-xs text-concreto-500">{pessoas} pessoa(s){porFuncao.size > 0 && ` • ${[...porFuncao].map(([f, n]) => `${n} ${f}`).join(', ')}`}</span>
      </div>
      {frentes.map((fr, i) => (
        <fieldset key={i} className="rounded-md border border-concreto-200 bg-concreto-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <legend className="text-sm font-bold">Frente {i + 1}</legend>
            {frentes.length > 1 && <button type="button" onClick={() => setFrentes(frentes.filter((_, k) => k !== i))} className="text-xs font-semibold text-atraso-700">remover frente</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[11px] text-concreto-500 sm:col-span-2">Serviço *
              <input id={`fr-serv-${i}`} value={fr.servico} list="tarefas-rdo" onChange={(e) => { const t = tarefas.find((x) => x.titulo === e.target.value); muda(i, { servico: e.target.value, tarefa_id: t?.id ?? null }); }}
                placeholder="Ex.: Alvenaria do bloco A, reboco, escavação…" className="entrada" /></label>
            <label className="text-[11px] text-concreto-500">Local
              <input id={`fr-local-${i}`} value={fr.local ?? ''} onChange={(e) => muda(i, { local: e.target.value })} placeholder="Ex.: Térreo, trecho 2" className="entrada" /></label>
          </div>
          <div className="mt-2 space-y-1">
            {fr.equipe.map((p, j) => (
              <div key={j} className="flex items-center gap-2">
                <input value={p.nome} readOnly={!!p.funcionario_id} onChange={(e) => muda(i, { equipe: fr.equipe.map((x, k) => (k === j ? { ...x, nome: e.target.value } : x)) })}
                  placeholder="Nome" className={`entrada min-w-0 flex-1 ${p.funcionario_id ? 'bg-white' : ''}`} />
                <input value={p.funcao} onChange={(e) => muda(i, { equipe: fr.equipe.map((x, k) => (k === j ? { ...x, funcao: e.target.value } : x)) })}
                  placeholder="Função" className="entrada w-36" />
                <button type="button" aria-label="Tirar da frente" onClick={() => muda(i, { equipe: fr.equipe.filter((_, k) => k !== j) })} className="px-2 text-atraso-700">✕</button>
              </div>))}
            <div className="flex flex-wrap gap-2 pt-1">
              <select value="" onChange={(e) => addFuncionario(i, e.target.value)} className="entrada w-full">
                <option value="">+ Funcionário nesta frente…</option>
                <optgroup label="Equipe da obra">{funcionarios.filter((f) => f.daObra).map((f) => <option key={f.id} value={f.id} disabled={usados.has(f.id)}>{f.nome}{f.funcao ? ` — ${f.funcao}` : ''}</option>)}</optgroup>
                <optgroup label="Outras obras / escritório">{funcionarios.filter((f) => !f.daObra).map((f) => <option key={f.id} value={f.id} disabled={usados.has(f.id)}>{f.nome}{f.funcao ? ` — ${f.funcao}` : ''}</option>)}</optgroup>
              </select>
              <button type="button" onClick={() => muda(i, { equipe: [...fr.equipe, { nome: '', funcao: '' }] })} className="rounded-md border border-concreto-300 bg-white px-3 text-xs font-semibold">+ Pessoa sem cadastro</button>
              {i === 0 && fr.equipe.length === 0 && <button type="button" onClick={() => addEquipeObra(i)} className="rounded-md border border-concreto-300 bg-white px-3 text-xs font-semibold">+ Toda a equipe da obra</button>}
            </div>
          </div>
        </fieldset>))}
      <button type="button" onClick={() => setFrentes([...frentes, { servico: '', local: '', equipe: [] }])}
        className="min-h-[44px] w-full rounded-md border-2 border-dashed border-concreto-300 text-sm font-semibold text-concreto-700 hover:border-sinal-400">+ Adicionar frente de serviço</button>
    </div>
  );
}
