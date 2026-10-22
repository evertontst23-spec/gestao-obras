import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Progresso, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { AbasObra } from '@/components/AbasObra';
import { LancarExecucao } from '@/components/LancarExecucao';
import { CurvaAvanco } from '@/components/CurvaAvanco';
import { FotoUpload } from '@/components/FotoUpload';
import { Galeria } from '@/components/Galeria';
import { AbrirAncora } from '@/components/AbrirAncora';
import { validarLancamento } from '../../avanco-acoes';
import { agregarGrupos } from '@/lib/arvore';
import { codTarefa } from '@/lib/dominio';
import { data, dataHora, hojeISO, num, somarDias } from '@/lib/formato';
import { formatarReais } from '@/lib/planilha';

export const metadata = { title: 'Avanço da obra' };

const STATUS_MED: Record<string, { r: string; c: string }> = {
  lancada: { r: 'Aguardando validação', c: 'bg-sinal-100 text-sinal-700' },
  validada: { r: 'Validada', c: 'bg-ok-50 text-ok-700' },
  rejeitada: { r: 'Rejeitada', c: 'bg-atraso-50 text-atraso-700 line-through' },
};
const FILTROS_FOTO = [['', 'Todas'], ['execucao', 'Execução'], ['correcao', 'Correções'], ['nao_conformidade', 'Não conformidades'], ['geral', 'Gerais']];

export default async function AvancoObra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string; foto?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, perfil } = await obterSessao();
  const [{ data: obra }, { data: planilha }, { data: pode }] = await Promise.all([
    supabase.from('v_obras').select('*').eq('id', id).maybeSingle(),
    supabase.from('planilhas').select('id, valor_total, nome_arquivo').eq('obra_id', id).eq('ativa', true).maybeSingle(),
    supabase.rpc('gere_obra', { p_obra: id }),
  ]);
  if (!obra) notFound();
  const gere = Boolean(pode);
  const podeLancar = ['encarregado', 'engenheiro', 'admin'].includes(perfil.papel);

  let qf = supabase.from('anexos').select('*').eq('obra_id', id).order('criado_em', { ascending: false }).limit(60);
  if (sp.foto) qf = qf.eq('categoria', sp.foto);
  const [{ data: itens }, { data: lancs }, { data: fotos }] = await Promise.all([
    planilha ? supabase.from('v_planilha_itens').select('*').eq('planilha_id', planilha.id).order('ordem') : Promise.resolve({ data: [] as any[] }), // eslint-disable-line @typescript-eslint/no-explicit-any
    supabase.from('v_medicoes').select('*').eq('obra_id', id).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(300),
    qf,
  ]);
  const its = itens ?? [];
  const meds = lancs ?? [];
  const servicos = its.filter((i) => i.tipo === 'servico');
  const { pct } = agregarGrupos(its);
  const etapas = its.filter((i) => i.tipo === 'grupo' && !i.pai_id);
  const valorTotal = Number(planilha?.valor_total ?? 0);
  const executado = servicos.reduce((s, i) => s + Number(i.valor_executado ?? 0), 0);
  const pendentes = meds.filter((m) => m.status === 'lancada');
  const inicio30 = somarDias(hojeISO(), -30);
  const valor30 = meds.filter((m) => m.status === 'validada' && m.data >= inicio30).reduce((s, m) => s + Number(m.valor ?? 0), 0);

  // Curva acumulada pelos lançamentos validados (ponderada por valor; sem preços, média física)
  const peso = new Map(servicos.map((s) => [s.id, valorTotal > 0 ? Number(s.valor_total ?? 0) / valorTotal : 1 / Math.max(1, servicos.length)]));
  const qtd = new Map(servicos.map((s) => [s.id, Number(s.quantidade)]));
  const porDia = new Map<string, number>();
  for (const m of [...meds].filter((m) => m.status === 'validada').sort((a, b) => a.data.localeCompare(b.data))) {
    const q = qtd.get(m.planilha_item_id) || 0;
    if (q > 0) porDia.set(m.data, (porDia.get(m.data) ?? 0) + (peso.get(m.planilha_item_id) ?? 0) * Math.min(1, Number(m.quantidade) / q) * 100);
  }
  let acum = 0;
  const curva = [...porDia.entries()].map(([d, v]) => ({ data: d, pct: Math.min(100, (acum += v)) }));

  const opcoes = servicos.map((s) => ({
    id: s.id, unidade: s.unidade, saldo: Number(s.saldo ?? 0),
    rotulo: `${s.codigo ? s.codigo + ' — ' : ''}${s.descricao.slice(0, 70)} (saldo ${num(s.saldo, 3)} ${s.unidade ?? ''})`,
  }));
  const fotosPorMed = new Map<string, number>();
  meds.forEach((m) => fotosPorMed.set(m.id, Number(m.fotos)));
  const comFoto = meds.slice(0, 60).filter((m) => Number(m.fotos) > 0).map((m) => m.id);
  const { data: anexosMed } = comFoto.length
    ? await supabase.from('anexos').select('*').in('medicao_id', comFoto).order('criado_em')
    : { data: [] as { medicao_id: string }[] };
  const fotosMed = new Map<string, any[]>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  (anexosMed ?? []).forEach((a) => fotosMed.set(a.medicao_id, [...(fotosMed.get(a.medicao_id) ?? []), a]));

  return (
    <>
      <AbrirAncora />
      <Cabecalho titulo={obra.nome} sub={<span className="font-mono">{obra.codigo}</span>} />
      <AbasObra id={id} atual="avanco" />

      {!planilha && (
        <div className="mb-5 rounded-lg border-2 border-dashed border-sinal-400 bg-sinal-50 p-4 text-sm">
          <b>Avanço calculado pelas tarefas.</b> Para medir o que foi executado item a item (e o avanço físico-financeiro),
          {gere ? <> <Link href={`/obras/${id}/planilha`} className="link">lance a planilha da obra</Link>.</> : ' o engenheiro precisa lançar a planilha da obra.'}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-lg border border-concreto-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-concreto-500">Avanço físico {planilha && valorTotal > 0 ? '(ponderado por valor)' : ''}</div>
          <div className="mt-1 font-mono text-3xl font-bold">{obra.avanco_fisico}%</div>
          <Progresso valor={obra.avanco_fisico} cor="bg-ok-500" />
        </div>
        {planilha && <Indicador rotulo="Valor executado" valor={formatarReais(executado)} tom="ok" detalhe={valorTotal ? `${((executado / valorTotal) * 100).toFixed(1)}% de ${formatarReais(valorTotal)}` : 'planilha sem preços'} />}
        {planilha && <Indicador rotulo="Últimos 30 dias" valor={formatarReais(valor30)} detalhe="executado e validado" />}
        <Indicador rotulo="A validar" valor={pendentes.length} tom={pendentes.length ? 'sinal' : 'ok'} detalhe="lançamentos de execução" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {planilha && (
            <Cartao titulo="Curva de avanço acumulado"><CurvaAvanco pontos={curva} /></Cartao>
          )}
          {etapas.length > 0 && (
            <Cartao titulo="Avanço por etapa">
              <ul className="space-y-3">{etapas.map((e) => (
                <li key={e.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm"><span className="font-semibold">{e.codigo ? `${e.codigo} · ` : ''}{e.descricao}</span></div>
                  <Progresso valor={pct(e.id)} cor={pct(e.id) >= 100 ? 'bg-ok-500' : 'bg-sinal-500'} />
                </li>))}
              </ul>
            </Cartao>
          )}

          <Cartao titulo="Lançamentos de execução">
            {!meds.length ? <Vazio>Nenhuma execução lançada ainda.</Vazio> : (
              <ul className="divide-y divide-concreto-100">
                {meds.slice(0, 60).map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <div className="font-semibold">{m.item_codigo ? `${m.item_codigo} · ` : ''}{m.item_descricao}</div>
                        <div className="text-concreto-600"><b className="font-mono">{num(m.quantidade, 3)} {m.unidade}</b>
                          {Number(m.valor) > 0 && <> · {formatarReais(Number(m.valor))}</>} · {data(m.data)} · {m.registrado_nome}
                          {m.local && <> · {m.local}</>}{m.tarefa_numero && <> · <Link href={`/tarefas/${m.tarefa_id}`} className="link">{codTarefa(m.tarefa_numero)}</Link></>}</div>
                        {m.descricao && <div className="text-xs text-concreto-500">{m.descricao}</div>}
                        {m.parecer && m.status !== 'lancada' && <div className="text-xs text-concreto-500">Parecer: {m.parecer} ({m.validado_nome}, {dataHora(m.validado_em)})</div>}
                      </div>
                      <Selo cor={STATUS_MED[m.status].c}>{STATUS_MED[m.status].r}</Selo>
                    </div>
                    {gere && m.status === 'lancada' && (
                      <FormAcao acao={validarLancamento} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="obra_id" value={id} /><input type="hidden" name="medicao" value={m.id} />
                        <input name="parecer" placeholder="Parecer (obrigatório para rejeitar)" className="entrada w-auto flex-1" />
                        <Botao variante="sucesso" name="decisao" value="aprovar">Validar</Botao>
                        <Botao variante="perigo" name="decisao" value="rejeitar">Rejeitar</Botao>
                      </FormAcao>)}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-semibold text-concreto-500">📷 Fotos ({fotosPorMed.get(m.id) ?? 0})</summary>
                      <div className="mt-2 space-y-2">
                        {podeLancar && m.status !== 'rejeitada' && <FotoUpload obraId={id} medicaoId={m.id} categoria="execucao" rotulo="📷 Adicionar foto da execução" />}
                        {(fotosMed.get(m.id)?.length ?? 0) > 0 && <Galeria anexos={fotosMed.get(m.id)!} />}
                      </div>
                    </details>
                  </li>))}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="space-y-5">
          {planilha && podeLancar && (
            <Cartao titulo="Lançar execução" className="scroll-mt-20">
              <div id="lancar" />
              <LancarExecucao obraId={id} itens={opcoes} itemInicial={sp.item} />
              {!gere && <p className="mt-2 text-xs text-concreto-500">O lançamento entra no avanço depois que o engenheiro validar.</p>}
            </Cartao>
          )}
          {podeLancar && (
            <Cartao titulo="Enviar fotos da obra">
              <FotoUpload obraId={id} escolherCategoria categoria="execucao" rotulo="📷 Tirar ou escolher fotos" />
              <p className="mt-2 text-xs text-concreto-500">Para registrar um problema com responsável e prazo, use <Link href={`/qualidade/nova?obra=${id}`} className="link">Nova não conformidade</Link>.</p>
            </Cartao>
          )}
        </div>
      </div>

      <Cartao titulo="Registro fotográfico" className="mt-5" acoes={
        <div className="flex flex-wrap gap-1 text-xs">{FILTROS_FOTO.map(([k, r]) => (
          <Link key={k} href={`/obras/${id}/avanco${k ? `?foto=${k}` : ''}`} className={`rounded px-2 py-1 font-semibold ${(sp.foto ?? '') === k ? 'bg-concreto-800 text-white' : 'bg-concreto-100 text-concreto-700'}`}>{r}</Link>))}</div>}>
        <Galeria anexos={(fotos ?? []).filter((a) => a.tipo_mime?.startsWith('image/') || a.tipo_mime === 'application/pdf')} vazio="Nenhuma foto nesta categoria." />
      </Cartao>
    </>
  );
}
