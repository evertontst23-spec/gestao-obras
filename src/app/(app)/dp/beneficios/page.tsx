import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP, mesAtual, nomeMes } from '@/components/AbasDP';
import { Botao, FormAcao } from '@/components/formulario';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { reais } from '@/lib/dominio';
import { dataHora } from '@/lib/formato';
import { criarMesBeneficios, removerLinhaBeneficio, salvarLinhaBeneficio, situacaoMesBeneficios } from './acoes';

export const metadata = { title: 'Benefícios' };
const TIPO: Record<string, string> = { alimentacao: 'Alimentação', passagem: 'Passagem' };
const nf = (v: unknown) => String(Number(v)).replace('.', ',');
type Linha = { id: number; obra_id: string | null; funcionario_id: string; tipo: string; dias: number; dias_retroativos: number; dias_desconto: number;
  qtd_dia: number; valor_unitario: number; valor_total: number; observacao: string | null; funcionarios: { nome: string; funcoes: { nome: string } | null } | null };

export default async function Beneficios({ searchParams }: { searchParams: Promise<{ mes?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const pode = ['admin', 'rh'].includes(perfil.papel);
  const { data: comps } = await supabase.from('beneficio_competencias').select('*').order('competencia', { ascending: false });
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : (comps?.[0]?.competencia?.slice(0, 7) ?? mesAtual());
  const comp = (comps ?? []).find((c) => c.competencia.slice(0, 7) === mes);
  const [{ data: linhasRaw }, { data: obras }, { data: funcs }] = await Promise.all([
    comp ? supabase.from('beneficio_linhas').select('*, funcionarios(nome, funcoes(nome))').eq('competencia_id', comp.id) : Promise.resolve({ data: [] }),
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('funcionarios').select('id, nome, obra_id').eq('ativo', true).is('data_demissao', null).order('nome'),
  ]);
  const linhas = ((linhasRaw ?? []) as unknown as Linha[]).sort((a, b) => (a.funcionarios?.nome ?? '').localeCompare(b.funcionarios?.nome ?? '') || a.tipo.localeCompare(b.tipo));
  const editavel = pode && comp?.status === 'aberta';
  const nomeObra = new Map((obras ?? []).map((o) => [o.id, `${o.codigo} — ${o.nome}`]));
  const grupos = new Map<string, Linha[]>();
  linhas.forEach((l) => { const k = l.obra_id ?? 'sem'; grupos.set(k, [...(grupos.get(k) ?? []), l]); });
  const ordem = [...grupos.keys()].sort((a, b) => (nomeObra.get(a) ?? 'zz').localeCompare(nomeObra.get(b) ?? 'zz'));
  const obraSel = sp.obra && (grupos.has(sp.obra) || (obras ?? []).some((o) => o.id === sp.obra)) ? sp.obra : null;
  const visiveis = obraSel ? [obraSel] : [];
  const link = (o?: string) => `/dp/beneficios?mes=${mes}${o ? `&obra=${o}` : ''}`;
  const soma = (ls: Linha[], t?: string) => ls.filter((l) => !t || l.tipo === t).reduce((s, l) => s + Number(l.valor_total), 0);
  const pessoas = (ls: Linha[]) => new Set(ls.map((l) => l.funcionario_id)).size;
  const g = 'grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.6fr)_110px_64px_64px_64px_64px_84px_100px_minmax(0,1fr)_auto]';

  return (
    <>
      <Cabecalho titulo="Benefícios" sub="Alimentação e passagem do mês por obra — dias, retroativos, faltas e valores editáveis; total por obra e geral."
        acoes={<BotaoImprimir rotulo="🖨 Imprimir / PDF" />} />
      <AbasDP atual="benef" />

      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(comps ?? []).map((c) => (
          <Link key={c.id} href={`/dp/beneficios?mes=${c.competencia.slice(0, 7)}${obraSel ? `&obra=${obraSel}` : ''}`}
            className={`rounded-full border px-3 py-1 font-semibold capitalize ${c.competencia.slice(0, 7) === mes ? 'border-sinal-500 bg-sinal-50 text-sinal-800' : 'border-concreto-300 bg-white text-concreto-600'}`}>
            {nomeMes(c.competencia.slice(0, 7))}{c.status === 'fechada' ? ' 🔒' : ''}</Link>))}
        {pode && (
          <details className="relative">
            <summary className="cursor-pointer rounded-full border border-dashed border-concreto-400 px-3 py-1 font-semibold text-concreto-600">+ novo mês</summary>
            <FormAcao acao={criarMesBeneficios} className="absolute z-10 mt-2 flex w-72 flex-col gap-2 rounded-md border border-concreto-200 bg-white p-3 shadow">
              <Campo rotulo="Mês"><input type="month" name="mes" required className="entrada" /></Campo>
              <Campo rotulo="Dias úteis"><input name="dias_uteis" required inputMode="numeric" className="entrada" /></Campo>
              <Botao>Criar</Botao>
            </FormAcao>
          </details>)}
      </div>

      {!comp ? <Vazio>Nenhum mês de benefícios lançado ainda.</Vazio> : (<>
        <h2 className="so-imprimir mb-2 text-lg font-bold capitalize">Benefícios — {nomeMes(mes)}</h2>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Indicador rotulo="Total do mês" valor={reais(soma(linhas))} tom="sinal" />
          <Indicador rotulo="Alimentação" valor={reais(soma(linhas, 'alimentacao'))} />
          <Indicador rotulo="Passagem" valor={reais(soma(linhas, 'passagem'))} />
          <Indicador rotulo="Funcionários" valor={pessoas(linhas)} detalhe={`${comp.dias_uteis} dias úteis`} />
        </div>
        <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Selo cor={comp.status === 'fechada' ? 'bg-ok-50 text-ok-700' : 'bg-atencao-50 text-atencao-800'}>{comp.status === 'fechada' ? `Fechado ${dataHora(comp.fechado_em)}` : 'Aberto para edição'}</Selo>
          {pode && comp.status === 'aberta' && (
            <FormAcao acao={situacaoMesBeneficios} className="flex items-center gap-2">
              <input type="hidden" name="competencia_id" value={comp.id} />
              <input name="dias_uteis" inputMode="numeric" defaultValue={comp.dias_uteis} className="entrada w-16 py-1" title="Dias úteis" />
              <Botao variante="secundario" name="acao" value="dias" className="px-3 py-1 text-xs">Salvar dias úteis</Botao>
              <Botao variante="sucesso" name="acao" value="fechar" className="px-3 py-1 text-xs">🔒 Fechar mês</Botao>
            </FormAcao>)}
          {perfil.papel === 'admin' && comp.status === 'fechada' && (
            <FormAcao acao={situacaoMesBeneficios}><input type="hidden" name="competencia_id" value={comp.id} />
              <Botao variante="secundario" name="acao" value="reabrir" className="px-3 py-1 text-xs">Reabrir para editar</Botao></FormAcao>)}
          {comp.observacoes && <span className="text-xs text-concreto-500">{comp.observacoes}</span>}
        </div>

        <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-concreto-600">Obra:</span>
          <Link href={link()} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${!obraSel ? 'border-sinal-500 bg-sinal-500 text-white' : 'border-concreto-300 bg-white text-concreto-700 hover:border-sinal-400'}`}>Resumo de todas</Link>
          {ordem.map((k) => (
            <Link key={k} href={link(k)} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${obraSel === k ? 'border-sinal-500 bg-sinal-500 text-white' : 'border-concreto-300 bg-white text-concreto-700 hover:border-sinal-400'}`}>
              {(nomeObra.get(k) ?? 'Sem obra').split(' — ').pop()} <span className="font-mono text-xs opacity-80">{reais(soma(grupos.get(k)!))}</span></Link>))}
          {editavel && (
            <form action="/dp/beneficios" className="flex items-center gap-1">
              <input type="hidden" name="mes" value={mes} />
              <select name="obra" className="entrada w-auto py-1.5 text-sm" defaultValue=""><option value="" disabled>+ outra obra…</option>
                {(obras ?? []).filter((o) => !grupos.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
              <button className="rounded-md border border-concreto-300 bg-white px-2 py-1.5 text-sm font-semibold">abrir</button>
            </form>)}
        </div>

        <div className="space-y-5">
          {visiveis.map((k) => {
            const ls = grupos.get(k) ?? [];
            return (
              <Cartao key={k} titulo={nomeObra.get(k) ?? 'Sem obra'}>
                {!ls.length && <p className="mb-2 text-sm text-concreto-500">Nenhum benefício lançado nesta obra ainda.</p>}
                <div className={`${g} mb-1 hidden text-[11px] font-semibold uppercase tracking-wide text-concreto-400 sm:grid`}>
                  <span>Funcionário</span><span>Benefício</span><span>Dias</span><span>Retro.</span><span>Faltas</span><span>Qtd/dia</span><span>Valor R$</span><span className="text-right">Total</span><span>Obs.</span><span />
                </div>
                <div className="divide-y divide-concreto-100">{ls.map((l) => (
                  <div key={l.id} className="py-1.5">
                    {editavel ? (
                      <FormAcao acao={salvarLinhaBeneficio} className={g}>
                        <input type="hidden" name="competencia_id" value={comp.id} /><input type="hidden" name="funcionario_id" value={l.funcionario_id} />
                        <input type="hidden" name="obra_id" value={l.obra_id ?? ''} /><input type="hidden" name="tipo" value={l.tipo} />
                        <span className="col-span-2 text-sm font-semibold sm:col-span-1">{l.funcionarios?.nome}<span className="block text-[11px] font-normal text-concreto-500">{l.funcionarios?.funcoes?.nome}</span></span>
                        <span className={`text-xs font-semibold ${l.tipo === 'passagem' ? 'text-sky-800' : 'text-ok-700'}`}>{TIPO[l.tipo]}</span>
                        <input name="dias" inputMode="decimal" defaultValue={nf(l.dias)} className="entrada px-2 py-1" aria-label="Dias" />
                        <input name="dias_retroativos" inputMode="decimal" defaultValue={nf(l.dias_retroativos)} className="entrada px-2 py-1" aria-label="Retroativos" />
                        <input name="dias_desconto" inputMode="decimal" defaultValue={nf(l.dias_desconto)} className="entrada px-2 py-1" aria-label="Faltas/desconto" />
                        <input name="qtd_dia" inputMode="decimal" defaultValue={nf(l.qtd_dia)} className="entrada px-2 py-1" aria-label="Quantidade por dia" />
                        <input name="valor_unitario" inputMode="decimal" defaultValue={Number(l.valor_unitario).toFixed(2).replace('.', ',')} className="entrada px-2 py-1" aria-label="Valor" />
                        <span className="text-right font-mono text-sm font-bold">{reais(l.valor_total)}</span>
                        <input name="observacao" defaultValue={l.observacao ?? ''} className="entrada px-2 py-1 text-xs" aria-label="Observação" />
                        <Botao variante="secundario" className="px-2 py-1 text-xs">Salvar</Botao>
                      </FormAcao>
                    ) : (
                      <div className={`${g} text-sm`}>
                        <span className="col-span-2 font-semibold sm:col-span-1">{l.funcionarios?.nome}</span><span className="text-xs">{TIPO[l.tipo]}</span>
                        <span>{nf(l.dias)}</span><span>{nf(l.dias_retroativos)}</span><span>{nf(l.dias_desconto)}</span><span>{nf(l.qtd_dia)}</span>
                        <span>{reais(l.valor_unitario)}</span><span className="text-right font-mono font-bold">{reais(l.valor_total)}</span><span className="text-xs text-concreto-500">{l.observacao}</span><span />
                      </div>)}
                    {editavel && (
                      <FormAcao acao={removerLinhaBeneficio} className="nao-imprimir mt-0.5 text-right"><input type="hidden" name="linha" value={l.id} />
                        <button className="text-[11px] text-atraso-700 hover:underline">remover</button></FormAcao>)}
                  </div>))}</div>
                <div className="mt-2 flex flex-wrap justify-end gap-4 border-t border-concreto-200 pt-2 text-sm">
                  <span>Alimentação: <b className="font-mono">{reais(soma(ls, 'alimentacao'))}</b></span>
                  <span>Passagem: <b className="font-mono">{reais(soma(ls, 'passagem'))}</b></span>
                  <span>Total da obra ({pessoas(ls)} pessoas): <b className="font-mono text-base">{reais(soma(ls))}</b></span>
                </div>
                {editavel && (
                  <details className="nao-imprimir mt-3 rounded-md border border-dashed border-sinal-400">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-sinal-700">+ Incluir funcionário / benefício nesta obra</summary>
                    <FormAcao acao={salvarLinhaBeneficio} limparAoConcluir className="grid gap-2 border-t border-concreto-100 p-3 sm:grid-cols-4">
                      <input type="hidden" name="competencia_id" value={comp.id} /><input type="hidden" name="obra_id" value={k === 'sem' ? '' : k} />
                      <Campo rotulo="Funcionário" className="sm:col-span-2"><select name="funcionario_id" required className="entrada"><option value="">Selecionar…</option>
                        {(funcs ?? []).sort((a, b) => Number(b.obra_id === k) - Number(a.obra_id === k)).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.obra_id !== k ? ' (outra obra)' : ''}</option>)}</select></Campo>
                      <Campo rotulo="Benefício"><select name="tipo" className="entrada"><option value="alimentacao">Alimentação</option><option value="passagem">Passagem</option></select></Campo>
                      <Campo rotulo="Dias"><input name="dias" defaultValue={comp.dias_uteis} inputMode="decimal" className="entrada" /></Campo>
                      <Campo rotulo="Retroativos"><input name="dias_retroativos" defaultValue="0" inputMode="decimal" className="entrada" /></Campo>
                      <Campo rotulo="Faltas"><input name="dias_desconto" defaultValue="0" inputMode="decimal" className="entrada" /></Campo>
                      <Campo rotulo="Qtd por dia"><input name="qtd_dia" defaultValue="1" inputMode="decimal" className="entrada" /></Campo>
                      <Campo rotulo="Valor (R$)"><input name="valor_unitario" required inputMode="decimal" placeholder="22,82" className="entrada" /></Campo>
                      <Campo rotulo="Observação" className="sm:col-span-3"><input name="observacao" className="entrada" /></Campo>
                      <div className="flex items-end"><Botao>Incluir</Botao></div>
                    </FormAcao>
                  </details>)}
              </Cartao>);
          })}

          <Cartao titulo="Resumo por obra">
            <table className="tabela">
              <thead><tr><th>Obra</th><th className="text-right">Pessoas</th><th className="text-right">Alimentação</th><th className="text-right">Passagem</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {ordem.map((k) => { const ls = grupos.get(k)!; return (
                  <tr key={k} className={obraSel === k ? 'bg-sinal-50' : ''}><td><Link href={link(k)} className="link">{nomeObra.get(k) ?? 'Sem obra'}</Link></td><td className="text-right">{pessoas(ls)}</td>
                    <td className="text-right font-mono">{reais(soma(ls, 'alimentacao'))}</td><td className="text-right font-mono">{reais(soma(ls, 'passagem'))}</td>
                    <td className="text-right font-mono font-bold">{reais(soma(ls))}</td></tr>); })}
                <tr className="bg-concreto-50 text-base font-black"><td>TOTAL GERAL</td><td className="text-right">{pessoas(linhas)}</td>
                  <td className="text-right font-mono">{reais(soma(linhas, 'alimentacao'))}</td><td className="text-right font-mono">{reais(soma(linhas, 'passagem'))}</td>
                  <td className="text-right font-mono">{reais(soma(linhas))}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-concreto-500">Total de cada linha = (dias + retroativos − faltas) × quantidade por dia × valor. Alterações ficam registradas na auditoria.</p>
          </Cartao>
        </div>
      </>)}
    </>
  );
}
