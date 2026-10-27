'use client';
import { useMemo, useState } from 'react';
import { UNIDADES } from '@/lib/dominio';

type Insumo = { codigo: string; descricao: string; unidade: string };
type Linha = { k: number; codigo: string; nome: string; unidade: string; modalidade: 'compra' | 'locacao'; ini: string; fim: string };
const nova = (k: number): Linha => ({ k, codigo: '', nome: '', unidade: '', modalidade: 'compra', ini: '', fim: '' });
const dias = (a: string, b: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1 : 0);
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Lista de materiais do pedido. O código padroniza o nome: digitou o código, aparece o material
 * e a unidade do cadastro. Material novo é cadastrado sozinho ao enviar o pedido.
 */
export function ItensMaterial({ insumos = [] }: { insumos?: Insumo[] }) {
  const [linhas, setLinhas] = useState<Linha[]>([nova(0)]);
  const [prox, setProx] = useState(1);
  const porCodigo = useMemo(() => new Map(insumos.map((i) => [i.codigo.toUpperCase(), i])), [insumos]);
  const porNome = useMemo(() => new Map(insumos.map((i) => [norm(i.descricao), i])), [insumos]);
  const muda = (k: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, ...p } : l)));

  function trocarCodigo(l: Linha, v: string) {
    const c = v.toUpperCase().trim();
    const i = porCodigo.get(c);
    muda(l.k, i ? { codigo: c, nome: i.descricao, unidade: i.unidade } : { codigo: v.toUpperCase() });
  }
  function trocarNome(l: Linha, v: string) {
    // escolheu da lista "CÓDIGO — nome" ou digitou um nome igual ao do cadastro
    const [a, ...b] = v.split(' — ');
    const i = b.length ? porCodigo.get(a.toUpperCase().trim()) : porNome.get(norm(v));
    muda(l.k, i ? { codigo: i.codigo, nome: i.descricao, unidade: i.unidade } : { nome: v });
  }

  return (
    <div className="space-y-3">
      <datalist id="insumos-cod">{insumos.map((i) => <option key={i.codigo} value={i.codigo}>{i.descricao} ({i.unidade})</option>)}</datalist>
      <datalist id="insumos-nome">{insumos.map((i) => <option key={i.codigo} value={`${i.codigo} — ${i.descricao}`} />)}</datalist>
      <datalist id="unidades-mat">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      {linhas.map((l, n) => {
        const cad = l.codigo ? porCodigo.get(l.codigo.trim()) : porNome.get(norm(l.nome));
        const codigoNovo = !!l.codigo.trim() && !porCodigo.has(l.codigo.trim());
        const valor = l.codigo.trim() ? `${l.codigo.trim()} — ${l.nome.trim()}` : l.nome.trim();
        return (
          <fieldset key={l.k} className="rounded-md border border-concreto-200 bg-concreto-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-sm font-bold">Material {n + 1}</legend>
              {linhas.length > 1 && <button type="button" onClick={() => setLinhas(linhas.filter((x) => x.k !== l.k))} className="text-xs font-semibold text-atraso-700">remover</button>}
            </div>
            <input type="hidden" name="material" value={valor} />
            <input type="hidden" name="modalidade" value={l.modalidade} />
            <input type="hidden" name="locacao_inicio" value={l.modalidade === 'locacao' ? l.ini : ''} />
            <input type="hidden" name="locacao_fim" value={l.modalidade === 'locacao' ? l.fim : ''} />
            <div className="mb-2 inline-flex overflow-hidden rounded-md border border-concreto-300 text-sm font-semibold" role="group" aria-label="Compra ou locação">
              {(['compra', 'locacao'] as const).map((m) => (
                <button key={m} type="button" onClick={() => muda(l.k, { modalidade: m })} aria-pressed={l.modalidade === m}
                  className={`px-4 py-1.5 ${l.modalidade === m ? (m === 'compra' ? 'bg-concreto-800 text-white' : 'bg-sky-700 text-white') : 'bg-white text-concreto-700'}`}>
                  {m === 'compra' ? '🛒 Compra' : '🔁 Locação'}</button>))}
            </div>
            {l.modalidade === 'locacao' && (
              <div className="mb-2 grid grid-cols-2 gap-2 rounded bg-sky-50 p-2 sm:grid-cols-3">
                <label className="text-[11px] text-concreto-500">Início da locação *
                  <input type="date" value={l.ini} required onChange={(e) => muda(l.k, { ini: e.target.value })} className="entrada" /></label>
                <label className="text-[11px] text-concreto-500">Fim da locação *
                  <input type="date" value={l.fim} required min={l.ini || undefined} onChange={(e) => muda(l.k, { fim: e.target.value })} className="entrada" /></label>
                <div className="col-span-2 flex items-end text-xs text-sky-800 sm:col-span-1">
                  {dias(l.ini, l.fim) > 0 ? <span className="rounded bg-white px-2 py-1 font-semibold">{dias(l.ini, l.fim)} dia(s) de locação</span> : 'Período que o equipamento fica na obra'}
                </div>
              </div>)}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <label className="col-span-1 text-[11px] text-concreto-500 sm:col-span-1">Código
                <input id={`cod-${l.k}`} value={l.codigo} onChange={(e) => trocarCodigo(l, e.target.value)} list="insumos-cod" autoCapitalize="characters"
                  placeholder="CÓD." className="entrada font-mono uppercase" /></label>
              <label className="col-span-2 text-[11px] text-concreto-500 sm:col-span-5">Material *
                <input id={`nome-${l.k}`} value={l.nome} onChange={(e) => trocarNome(l, e.target.value)} list="insumos-nome" required={!l.codigo}
                  placeholder="Digite o código ao lado ou o nome do material" readOnly={!!cad && !!l.codigo}
                  className={`entrada ${cad && l.codigo ? 'bg-ok-50 font-semibold' : ''}`} /></label>
              <label className="text-[11px] text-concreto-500 sm:col-span-2">Quantidade *
                <input name="quantidade" required inputMode="decimal" placeholder="Qtd." className="entrada" /></label>
              <label className="text-[11px] text-concreto-500 sm:col-span-2">Unidade *
                <input name="unidade" value={l.unidade} onChange={(e) => muda(l.k, { unidade: e.target.value })} required list="unidades-mat" placeholder="Unid." className="entrada" /></label>
              <div className="col-span-2 flex items-end text-xs sm:col-span-2">
                {cad ? <span className="rounded bg-ok-50 px-2 py-1 font-semibold text-ok-700">✓ {cad.codigo} — do cadastro</span>
                  : codigoNovo && l.nome.trim() ? <span className="rounded bg-sinal-50 px-2 py-1 text-sinal-700">Código novo: será cadastrado como {l.codigo.trim()}</span>
                  : codigoNovo ? <span className="rounded bg-atencao-50 px-2 py-1 text-atencao-800">Código não encontrado — digite o nome para cadastrar</span>
                  : l.nome.trim() ? <span className="rounded bg-sinal-50 px-2 py-1 text-sinal-700">Material novo: recebe um código automático</span> : null}
              </div>
              <input name="especificacao" placeholder="Especificação técnica (marca, bitola, traço…)" className="entrada col-span-2 sm:col-span-6" />
            </div>
          </fieldset>);
      })}
      <button type="button" onClick={() => { setLinhas([...linhas, nova(prox)]); setProx(prox + 1); }}
        className="min-h-[48px] w-full rounded-md border-2 border-dashed border-concreto-300 text-sm font-semibold text-concreto-700 hover:border-sinal-400">
        + Adicionar outro material
      </button>
      <p className="text-xs text-concreto-500">Escolha Compra ou Locação em cada item; na locação, informe o período. Materiais que ainda não existem no cadastro entram nele automaticamente ao enviar o pedido, para que o próximo pedido use o mesmo código e o mesmo nome.</p>
    </div>
  );
}
