import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, Selo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { cancelarCotacao, decidirCotacao, enviarAprovacao, salvarProposta } from '../../acoes';
import { STATUS_COTACAO, codCot, reais } from '@/lib/dominio';
import { dataHora, num } from '@/lib/formato';

export default async function DetalheCotacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: c } = await supabase.from('v_cotacoes').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [{ data: itens }, { data: props }, { data: precos }, { data: forns }] = await Promise.all([
    supabase.from('cotacao_itens').select('*').eq('cotacao_id', id).order('descricao'),
    supabase.from('cotacao_propostas').select('*, fornecedores(nome, telefone)').eq('cotacao_id', id).order('valor_total'),
    supabase.from('cotacao_precos').select('*, cotacao_propostas!inner(cotacao_id)').eq('cotacao_propostas.cotacao_id', id),
    supabase.from('fornecedores').select('id, nome, categoria').eq('ativo', true).order('nome'),
  ]);
  const ps = props ?? [];
  const preco = new Map((precos ?? []).map((p) => [`${p.proposta_id}:${p.cotacao_item_id}`, Number(p.preco_unitario)]));
  const menorItem = new Map<string, number>();
  (itens ?? []).forEach((i) => { const vs = ps.map((p) => preco.get(`${p.id}:${i.id}`)).filter((v): v is number => v !== undefined); if (vs.length) menorItem.set(i.id, Math.min(...vs)); });
  const comprador = perfil.papel === 'compras' || perfil.papel === 'admin';
  const aberta = c.status === 'em_cotacao';
  const nomeForn = (p: (typeof ps)[number]) => (p.fornecedores as unknown as { nome: string })?.nome;

  return (
    <>
      <Cabecalho titulo={`Cotação ${codCot(c.numero)}`}
        sub={<span className="flex flex-wrap items-center gap-2">{c.obra_codigo ? `${c.obra_codigo} — ${c.obra_nome}` : 'Reposição do depósito central'}
          <Selo cor={STATUS_COTACAO[c.status].cor}>{STATUS_COTACAO[c.status].rotulo}</Selo>
          {c.oc_id && <Link href={`/suprimentos/ordens/${c.oc_id}`} className="link">ver ordem de compra →</Link>}</span>} />

      {c.justificativa_estoque && <p className="mb-4 rounded-md bg-atencao-50 px-4 py-2 text-sm text-atencao-700"><b>Compra com estoque existente — justificativa:</b> {c.justificativa_estoque}</p>}

      <Cartao titulo="Mapa de cotação" className="mb-5">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Item</th><th className="text-right">Qtd.</th>
              {ps.map((p) => <th key={p.id} className={`text-right ${p.id === c.proposta_escolhida_id ? 'bg-ok-50' : ''}`}>{nomeForn(p)}<div className="font-normal normal-case">{p.prazo_entrega_dias} dia(s) • {p.condicao_pagamento ?? '—'}</div></th>)}</tr></thead>
            <tbody>
              {(itens ?? []).map((i) => (
                <tr key={i.id}>
                  <td>{i.descricao}{Number(i.estoque_no_momento) > 0 && <div className="text-[11px] font-semibold text-atencao-700">estoque no momento: {num(i.estoque_no_momento)}</div>}</td>
                  <td className="whitespace-nowrap text-right font-mono">{num(i.quantidade, 3)} {i.unidade}</td>
                  {ps.map((p) => { const v = preco.get(`${p.id}:${i.id}`); const melhor = v !== undefined && v === menorItem.get(i.id) && ps.length > 1;
                    return <td key={p.id} className={`whitespace-nowrap text-right font-mono ${melhor ? 'font-bold text-ok-700' : ''}`}>{v === undefined ? '—' : <>{reais(v)}<div className="text-[11px] text-concreto-500">{reais(v * Number(i.quantidade))}</div></>}</td>; })}
                </tr>))}
              {ps.length > 0 && <tr className="bg-concreto-50"><td colSpan={2} className="font-semibold">Frete</td>{ps.map((p) => <td key={p.id} className="text-right font-mono">{reais(p.frete)}</td>)}</tr>}
              {ps.length > 0 && <tr className="bg-concreto-50 font-bold"><td colSpan={2}>TOTAL</td>{ps.map((p) => <td key={p.id} className={`text-right font-mono ${Number(p.valor_total) === Number(c.menor_valor) ? 'text-ok-700' : ''}`}>{reais(p.valor_total)}</td>)}</tr>}
            </tbody>
          </table>
          {!ps.length && <p className="mt-2 text-sm text-concreto-500">Nenhuma proposta registrada ainda.</p>}
        </div>
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        {comprador && aberta && (
          <Cartao titulo="Registrar proposta de fornecedor">
            <FormAcao acao={salvarProposta} limparAoConcluir className="space-y-3">
              <input type="hidden" name="cotacao_id" value={id} />
              <Campo rotulo="Fornecedor"><select name="fornecedor_id" required className="entrada"><option value="">Selecionar…</option>
                {forns?.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.categoria ? ` — ${f.categoria}` : ''}</option>)}</select></Campo>
              <div className="grid grid-cols-3 gap-2">
                <Campo rotulo="Prazo (dias)"><input name="prazo" required inputMode="numeric" className="entrada" /></Campo>
                <Campo rotulo="Frete (R$)"><input name="frete" inputMode="decimal" defaultValue="0" className="entrada" /></Campo>
                <Campo rotulo="Pagamento"><input name="condicao" className="entrada" placeholder="28 dias" /></Campo>
              </div>
              {(itens ?? []).map((i) => (
                <div key={i.id} className="flex items-center gap-2">
                  <input type="hidden" name="item_id" value={i.id} />
                  <span className="flex-1 text-sm">{i.descricao} <span className="text-xs text-concreto-500">({num(i.quantidade, 3)} {i.unidade})</span></span>
                  <input name="preco" required inputMode="decimal" placeholder="R$ unit." className="entrada w-32" />
                </div>))}
              <Campo rotulo="Observações"><input name="observacoes" className="entrada" /></Campo>
              <Botao>Salvar proposta</Botao>
              <p className="text-xs text-concreto-500">Fornecedor novo? <Link href="/cadastros/fornecedores" className="link">Cadastre aqui</Link>.</p>
            </FormAcao>
          </Cartao>
        )}

        {comprador && aberta && ps.length > 0 && (
          <Cartao titulo="Enviar para aprovação da diretoria">
            <FormAcao acao={enviarAprovacao} className="space-y-3">
              <input type="hidden" name="cotacao_id" value={id} />
              <div className="space-y-2">{ps.map((p, k) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-concreto-200 p-3 has-[:checked]:border-sinal-500 has-[:checked]:bg-sinal-50">
                  <input type="radio" name="proposta_id" value={p.id} defaultChecked={k === 0} className="h-5 w-5 accent-sinal-500" />
                  <span className="flex-1"><b>{nomeForn(p)}</b><span className="block text-xs text-concreto-500">{p.prazo_entrega_dias} dia(s) • {p.condicao_pagamento ?? '—'}</span></span>
                  <span className="font-mono font-bold">{reais(p.valor_total)}</span>{k === 0 && <Selo cor="bg-ok-50 text-ok-700">menor</Selo>}
                </label>))}</div>
              <Campo rotulo="Justificativa (obrigatória se não for a de menor valor)"><textarea name="justificativa" rows={2} className="entrada" /></Campo>
              <Botao>Enviar para a diretoria</Botao>
            </FormAcao>
          </Cartao>
        )}

        {c.status === 'aguardando_aprovacao' && (
          <Cartao titulo="Aprovação da diretoria" className="border-2 border-sinal-500">
            <dl className="mb-3 grid grid-cols-2 gap-3">
              <Info rotulo="Fornecedor escolhido">{c.fornecedor_escolhido}</Info>
              <Info rotulo="Valor">{reais(c.valor_escolhido)}</Info>
              <Info rotulo="Menor proposta">{reais(c.menor_valor)} ({c.total_propostas} proposta(s))</Info>
              <Info rotulo="Enviado em">{dataHora(c.enviado_em)}</Info>
              {c.justificativa_escolha && <div className="col-span-2"><Info rotulo="Justificativa do comprador">{c.justificativa_escolha}</Info></div>}
            </dl>
            {perfil.papel === 'admin' ? (
              <FormAcao acao={decidirCotacao} className="space-y-3">
                <input type="hidden" name="cotacao_id" value={id} />
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Recebimento"><select name="modalidade" className="entrada"><option value="entrega">Fornecedor entrega na obra</option><option value="retirada">Retirada por funcionário</option></select></Campo>
                  <Campo rotulo="Quem retira (se retirada)"><input name="retirante" className="entrada" /></Campo>
                </div>
                <Campo rotulo="Parecer (obrigatório para recusar)"><input name="parecer" className="entrada" /></Campo>
                <div className="flex flex-wrap gap-2">
                  <Botao variante="sucesso" name="decisao" value="aprovar">Aprovar e emitir OC</Botao>
                  <Botao variante="perigo" name="decisao" value="recusar">Recusar</Botao>
                </div>
              </FormAcao>
            ) : <p className="text-sm text-concreto-600">Aguardando decisão da diretoria.</p>}
          </Cartao>
        )}

        {c.parecer && <Cartao titulo="Decisão"><p className="text-sm">{c.parecer}</p><p className="text-xs text-concreto-500">{c.decidido_nome} • {dataHora(c.decidido_em)}</p></Cartao>}

        {comprador && ['em_cotacao', 'aguardando_aprovacao'].includes(c.status) && (
          <details className="rounded-lg border border-concreto-200 bg-white text-sm lg:col-span-2">
            <summary className="cursor-pointer px-4 py-3 text-atraso-700">Cancelar cotação</summary>
            <FormAcao acao={cancelarCotacao} className="flex gap-2 border-t border-concreto-100 p-4">
              <input type="hidden" name="cotacao_id" value={id} />
              <input name="motivo" required minLength={5} placeholder="Motivo" className="entrada flex-1" />
              <Botao variante="perigo">Cancelar</Botao>
            </FormAcao>
          </details>)}
      </div>
      {c.oc_id && <p className="mt-4 text-sm">Gerou a <Link href={`/suprimentos/ordens/${c.oc_id}`} className="link">ordem de compra</Link>.</p>}
    </>
  );
}
