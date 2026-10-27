import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Info, Selo } from '@/components/ui';
import { AbasObra } from '@/components/AbasObra';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { FotoUpload } from '@/components/FotoUpload';
import { Galeria } from '@/components/Galeria';
import { Botao, FormAcao } from '@/components/formulario';
import { data, dataHora, hojeISO } from '@/lib/formato';
import { validarDiario } from '@/app/(app)/financeiro/acoes';
import { FormDiario } from '../FormDiario';
import { dadosRdo } from '../dados';
import type { Frente } from '@/components/FrentesServico';

export const metadata = { title: 'Diário de obra' };
const CLIMA: Record<string, string> = { ensolarado: '☀ Ensolarado', nublado: '☁ Nublado', chuva_leve: '🌦 Chuva leve', chuva_forte: '🌧 Chuva forte (impraticável)' };

export default async function DiaDiario({ params }: { params: Promise<{ id: string; did: string }> }) {
  const { id, did } = await params;
  const { supabase, perfil } = await obterSessao();
  const [{ data: d }, { data: fotos }, { data: gere }] = await Promise.all([
    supabase.from('diario_obra').select('*, obras(codigo, nome, endereco), reg:registrado_por(nome), val:validado_por(nome)').eq('id', did).eq('obra_id', id).maybeSingle(),
    supabase.from('anexos').select('*').eq('diario_id', did).order('criado_em'),
    supabase.rpc('gere_obra', { p_obra: id }),
  ]);
  if (!d) notFound();
  const o = d.obras as unknown as { codigo: string; nome: string; endereco: string | null };
  const { data: execDia } = await supabase.from('v_medicoes').select('id, item_descricao, quantidade, unidade, status, local').eq('obra_id', id).eq('data', d.data).neq('status', 'rejeitada');
  const { count: presentes } = await supabase.from('registros_ponto').select('funcionario_id', { count: 'exact', head: true }).eq('obra_id', id).eq('data', d.data).eq('tipo', 'entrada');
  const pode = ['encarregado', 'engenheiro', 'admin'].includes(perfil.papel);
  const rdo = pode && !d.validado_em ? await dadosRdo(supabase, id) : null;
  const frentes = (Array.isArray(d.frentes) ? d.frentes : []) as Frente[];
  const linha = (r: string, t: string | null) => t ? <div><div className="text-xs font-semibold uppercase tracking-wide text-concreto-500">{r}</div><p className="whitespace-pre-line">{t}</p></div> : null;

  return (
    <>
      <Cabecalho titulo={`Diário de obra — ${data(d.data)}`} sub={<>{o.codigo} — {o.nome} • {d.validado_em ? <Selo cor="bg-ok-50 text-ok-700">Validado</Selo> : <Selo cor="bg-atencao-100 text-atencao-800">Aguardando validação do engenheiro</Selo>}</>} acoes={<BotaoImprimir />} />
      <AbasObra id={id} atual="diario" />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Cartao titulo="Relatório diário">
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <Info rotulo="Clima">{CLIMA[d.clima] ?? d.clima ?? '—'}</Info>
              <Info rotulo="Pessoas na obra">{d.equipe_presente ?? '—'}{presentes ? <span className="text-xs text-concreto-500"> (ponto: {presentes} entrada(s))</span> : null}</Info>
              <Info rotulo="Composição">{d.equipe_descricao ?? '—'}</Info>
            </div>
            {frentes.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-concreto-500">Frentes de serviço</div>
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-concreto-50 text-left text-xs"><th className="border border-concreto-200 px-2 py-1">Serviço</th><th className="border border-concreto-200 px-2 py-1">Equipe</th><th className="border border-concreto-200 px-2 py-1 text-right">Pessoas</th></tr></thead>
                  <tbody>{frentes.map((fr, i) => (
                    <tr key={i}><td className="border border-concreto-200 px-2 py-1 align-top"><b>{fr.servico}</b>{fr.local && <div className="text-xs text-concreto-500">{fr.local}</div>}</td>
                      <td className="border border-concreto-200 px-2 py-1 align-top">{fr.equipe.length ? fr.equipe.map((p, k) => <div key={k}>{p.nome || '—'} <span className="text-xs text-concreto-500">{p.funcao}</span></div>) : '—'}</td>
                      <td className="border border-concreto-200 px-2 py-1 text-right align-top">{fr.equipe.length}</td></tr>))}</tbody>
                </table>
              </div>)}
            <div className="space-y-3 text-sm">
              {linha(frentes.length ? 'Resumo do dia' : 'Serviços executados', d.servicos_executados)}
              {linha('Ocorrências', d.ocorrencias)}
              {linha('Paralisações', d.paralisacoes)}
              {linha('Material necessário', d.necessidades_material)}
              {linha('Observações', d.observacoes)}
            </div>
            <p className="mt-4 text-xs text-concreto-500">Registrado por {(d.reg as unknown as { nome: string })?.nome} em {dataHora(d.criado_em)}{d.validado_em && ` • validado por ${(d.val as unknown as { nome: string })?.nome} em ${dataHora(d.validado_em)}`}.</p>
          </Cartao>
          {!!execDia?.length && (
            <Cartao titulo="Execução lançada neste dia">
              <table className="tabela"><tbody>{execDia.map((m) => <tr key={m.id}><td>{m.item_descricao}{m.local && <div className="text-xs text-concreto-500">{m.local}</div>}</td><td className="whitespace-nowrap text-right font-mono">{Number(m.quantidade).toLocaleString('pt-BR')} {m.unidade}</td><td>{m.status === 'validada' ? <Selo cor="bg-ok-50 text-ok-700">Validada</Selo> : <Selo cor="bg-atencao-100 text-atencao-800">A validar</Selo>}</td></tr>)}</tbody></table>
              <Link href={`/obras/${id}/avanco`} className="nao-imprimir link mt-2 inline-block text-sm">Lançar execução da planilha →</Link>
            </Cartao>)}
          <Cartao titulo={`Fotos do dia (${fotos?.length ?? 0})`}>
            {pode && !d.validado_em && <div className="nao-imprimir mb-3"><FotoUpload obraId={id} diarioId={did} escolherCategoria categoria="execucao" rotulo="📷 Adicionar fotos" /></div>}
            <Galeria anexos={fotos ?? []} vazio="Nenhuma foto neste diário." />
          </Cartao>
          <div className="so-imprimir mt-16 grid grid-cols-2 gap-16 text-center text-sm">
            <div className="border-t border-concreto-800 pt-1">Encarregado</div><div className="border-t border-concreto-800 pt-1">Engenheiro responsável</div>
          </div>
        </div>
        <div className="nao-imprimir space-y-5 lg:col-span-2">
          {gere && !d.validado_em && (
            <Cartao titulo="Validação">
              <FormAcao acao={validarDiario}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="obra_id" value={id} />
                <p className="mb-3 text-sm text-concreto-600">Após validado, o diário não pode mais ser alterado.</p>
                <Botao variante="sucesso">Validar diário</Botao></FormAcao>
            </Cartao>)}
          {pode && !d.validado_em && (
            <Cartao titulo="Corrigir informações"><FormDiario obraId={id} hoje={hojeISO()} d={d} funcionarios={rdo?.funcionarios ?? []} tarefas={rdo?.tarefas ?? []} /></Cartao>)}
        </div>
      </div>
    </>
  );
}
