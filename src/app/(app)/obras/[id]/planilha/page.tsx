import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Progresso, Vazio } from '@/components/ui';
import { AbasObra } from '@/components/AbasObra';
import { ImportarPlanilha } from '@/components/ImportarPlanilha';
import { agregarGrupos } from '@/lib/arvore';
import { dataHora, num } from '@/lib/formato';
import { formatarReais } from '@/lib/planilha';

export const metadata = { title: 'Planilha da obra' };

export default async function PlanilhaObra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { q } = await searchParams;
  const { supabase } = await obterSessao();
  const [{ data: obra }, { data: planilha }, { data: pode }] = await Promise.all([
    supabase.from('v_obras').select('id, codigo, nome, avanco_fisico').eq('id', id).maybeSingle(),
    supabase.from('planilhas').select('*, perfis(nome)').eq('obra_id', id).eq('ativa', true).maybeSingle(),
    supabase.rpc('gere_obra', { p_obra: id }),
  ]);
  if (!obra) notFound();
  const gere = Boolean(pode);

  if (!planilha) {
    return (
      <>
        <Cabecalho titulo={obra.nome} sub={<span className="font-mono">{obra.codigo}</span>} />
        <AbasObra id={id} atual="planilha" />
        {gere ? (
          <div className="mx-auto max-w-4xl space-y-4">
            <Cartao titulo="Planilha da obra">
              <p className="mb-4 text-sm text-concreto-600">
                Envie o orçamento (planilha sintética ou de quantitativos). O sistema identifica sozinho os grupos/etapas, os serviços,
                unidades, quantidades e preços — inclusive códigos SINAPI/ORSE e a coluna com BDI. A partir dela, o avanço da obra
                passa a ser calculado pelo que foi realmente executado em cada item, ponderado pelo valor.
              </p>
              <ImportarPlanilha obraId={id} />
            </Cartao>
          </div>
        ) : <Vazio>A planilha desta obra ainda não foi lançada pelo engenheiro.</Vazio>}
      </>
    );
  }

  const [{ data: itens }, { data: url }, { count: nMed }] = await Promise.all([
    supabase.from('v_planilha_itens').select('*').eq('planilha_id', planilha.id).order('ordem'),
    planilha.caminho ? supabase.storage.from('anexos').createSignedUrl(planilha.caminho, 3600, { download: planilha.nome_arquivo }) : Promise.resolve({ data: null }),
    supabase.from('medicoes').select('id', { count: 'exact', head: true }).eq('obra_id', id),
  ]);
  const todos = itens ?? [];
  const { porId, pct } = agregarGrupos(todos);
  const executado = todos.filter((i) => i.tipo === 'servico').reduce((s, i) => s + Number(i.valor_executado ?? 0), 0);
  const filtro = q?.trim().toLowerCase();
  const visiveis = filtro ? todos.filter((i) => `${i.codigo ?? ''} ${i.descricao} ${i.codigo_referencia ?? ''}`.toLowerCase().includes(filtro)) : todos;

  return (
    <>
      <Cabecalho titulo={obra.nome} sub={<><span className="font-mono">{obra.codigo}</span> • Planilha v{planilha.versao}: {planilha.nome_arquivo}
        {url?.signedUrl && <> • <a href={url.signedUrl} className="link">baixar original</a></>}</>} />
      <AbasObra id={id} atual="planilha" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-lg border border-concreto-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-concreto-500">Avanço físico-financeiro</div>
          <div className="mt-1 font-mono text-2xl font-bold">{obra.avanco_fisico}%</div>
          <Progresso valor={obra.avanco_fisico} cor="bg-ok-500" />
        </div>
        <Indicador rotulo="Executado (validado)" valor={formatarReais(executado)} tom="ok" detalhe={`de ${formatarReais(Number(planilha.valor_total ?? 0))}`} />
        <Indicador rotulo="Serviços" valor={planilha.total_servicos} detalhe={`${planilha.total_itens - planilha.total_servicos} grupos • importada ${dataHora(planilha.importado_em)}`} />
      </div>

      <Cartao titulo="Itens da planilha" acoes={<Link href={`/obras/${id}/avanco#lancar`} className="link text-sm">+ lançar execução</Link>}>
        <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por item, descrição ou código SINAPI…" className="entrada flex-1" /><button className="rounded-md bg-concreto-800 px-3 text-sm font-semibold text-white">Buscar</button></form>
        <div className="overflow-x-auto">
          <table className="tabela text-xs sm:text-sm">
            <thead><tr><th>Item</th><th>Descrição</th><th>Und</th><th className="text-right">Qtd.</th><th className="text-right">P. unit.</th><th className="text-right">Total</th><th className="text-right">Executado</th><th className="w-36">Avanço</th><th></th></tr></thead>
            <tbody>{visiveis.map((i) => i.tipo === 'grupo' ? (
              <tr key={i.id} className="bg-concreto-50 font-bold">
                <td className="whitespace-nowrap font-mono">{i.codigo}</td>
                <td style={{ paddingLeft: `${(i.nivel - 1) * 14 + 12}px` }}>{i.descricao}</td>
                <td colSpan={3}></td>
                <td className="text-right font-mono">{porId.get(i.id)!.valor ? num(porId.get(i.id)!.valor) : ''}</td>
                <td className="text-right font-mono">{porId.get(i.id)!.executado ? num(porId.get(i.id)!.executado) : ''}</td>
                <td><Progresso valor={pct(i.id)} cor="bg-concreto-500" /></td><td></td>
              </tr>
            ) : (
              <tr key={i.id} className={i.excedido ? 'bg-atraso-50/50' : ''}>
                <td className="whitespace-nowrap font-mono">{i.codigo}</td>
                <td style={{ paddingLeft: `${(i.nivel - 1) * 14 + 12}px` }}>{i.descricao}
                  {(i.codigo_referencia || i.fonte) && <span className="ml-1 text-[11px] text-concreto-400">{[i.fonte, i.codigo_referencia].filter(Boolean).join(' ')}</span>}
                  {Number(i.executado_pendente) > 0 && <div className="text-[11px] text-sinal-700">+{num(i.executado_pendente)} {i.unidade} aguardando validação</div>}</td>
                <td>{i.unidade}</td>
                <td className="text-right font-mono">{num(i.quantidade, 3)}</td>
                <td className="text-right font-mono">{num(i.preco_unitario)}</td>
                <td className="text-right font-mono">{num(i.valor_total)}</td>
                <td className="text-right font-mono">{num(i.executado, 3)}</td>
                <td><Progresso valor={Number(i.percentual ?? 0)} cor={Number(i.percentual) >= 100 ? 'bg-ok-500' : 'bg-sinal-500'} /></td>
                <td>{Number(i.saldo) > 0 && <Link href={`/obras/${id}/avanco?item=${i.id}#lancar`} className="link whitespace-nowrap text-xs">lançar</Link>}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {gere && (
        <details className="mt-5 rounded-lg border border-concreto-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold uppercase tracking-wide text-concreto-700">Substituir planilha</summary>
          <div className="border-t border-concreto-100 p-4">
            {nMed ? <p className="text-sm text-concreto-600">Já existem {nMed} lançamento(s) de execução nesta planilha. Para preservar o histórico do avanço, ela não pode ser substituída — acréscimos e supressões serão tratados como aditivo (próxima etapa).</p>
              : <ImportarPlanilha obraId={id} reimportar />}
          </div>
        </details>
      )}
    </>
  );
}
