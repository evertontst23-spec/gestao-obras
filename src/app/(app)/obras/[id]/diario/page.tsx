import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasObra } from '@/components/AbasObra';
import { data, hojeISO, somarDias } from '@/lib/formato';
import { FormDiario } from './FormDiario';

export const metadata = { title: 'Diário de obra' };
const CLIMA: Record<string, string> = { ensolarado: '☀ Ensolarado', nublado: '☁ Nublado', chuva_leve: '🌦 Chuva leve', chuva_forte: '🌧 Chuva forte' };
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export default async function Diario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const hoje = hojeISO();
  const [{ data: obra }, { data: lista }, { data: ponto }] = await Promise.all([
    supabase.from('obras').select('id, codigo, nome').eq('id', id).maybeSingle(),
    supabase.from('diario_obra').select('*, perfis:registrado_por(nome), anexos(count)').eq('obra_id', id).order('data', { ascending: false }).limit(90),
    supabase.from('registros_ponto').select('funcionario_id').eq('obra_id', id).eq('data', hoje),
  ]);
  if (!obra) notFound();
  const ds = lista ?? [];
  const hojeFeito = ds.find((d) => d.data === hoje);
  const pode = ['encarregado', 'engenheiro', 'admin'].includes(perfil.papel);
  const ult30 = ds.filter((d) => d.data >= somarDias(hoje, -30));
  const naoValidados = ds.filter((d) => !d.validado_em).length;
  const presentes = new Set((ponto ?? []).map((p) => p.funcionario_id)).size;

  return (
    <>
      <Cabecalho titulo={`${obra.codigo} — ${obra.nome}`} sub="Diário de obra (RDO)" />
      <AbasObra id={id} atual="diario" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Diário de hoje" valor={hojeFeito ? 'Registrado' : 'Pendente'} tom={hojeFeito ? 'ok' : 'atencao'} href={hojeFeito ? `/obras/${id}/diario/${hojeFeito.id}` : undefined} />
        <Indicador rotulo="Registros (30 dias)" valor={ult30.length} />
        <Indicador rotulo="Dias de chuva (30 dias)" valor={ult30.filter((d) => d.clima?.startsWith('chuva')).length} />
        <Indicador rotulo="Aguardando validação" valor={naoValidados} tom={naoValidados ? 'atencao' : 'neutro'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {!ds.length ? <Vazio>Nenhum diário registrado.</Vazio> : (
            <div className="space-y-2">{ds.map((d) => (
              <Link key={d.id} href={`/obras/${id}/diario/${d.id}`} className="block rounded-lg border border-concreto-200 bg-white p-3 hover:border-sinal-400">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{data(d.data)} <span className="text-sm font-normal text-concreto-500">{SEM[new Date(d.data + 'T12:00:00').getDay()]}</span></div>
                  <div className="flex gap-1 text-xs">
                    <Selo cor="bg-concreto-100 text-concreto-700">{CLIMA[d.clima] ?? d.clima ?? '—'}</Selo>
                    {d.equipe_presente != null && <Selo cor="bg-concreto-100 text-concreto-700">👷 {d.equipe_presente}</Selo>}
                    <Selo cor="bg-concreto-100 text-concreto-700">📷 {(d.anexos as unknown as { count: number }[])[0]?.count ?? 0}</Selo>
                    {d.validado_em ? <Selo cor="bg-ok-50 text-ok-700">Validado</Selo> : <Selo cor="bg-atencao-100 text-atencao-800">A validar</Selo>}
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-concreto-700">{d.servicos_executados}</p>
                {d.ocorrencias && <p className="mt-1 line-clamp-1 text-xs text-atencao-700">⚑ {d.ocorrencias}</p>}
                <div className="mt-1 text-xs text-concreto-500">por {(d.perfis as unknown as { nome: string })?.nome}</div>
              </Link>))}</div>)}
        </div>
        {pode && (
          <Cartao titulo={hojeFeito ? 'Registrar outro dia' : 'Registrar o diário de hoje'} className={`lg:order-none lg:col-span-2 ${hojeFeito ? '' : 'order-first'}`}>
            <FormDiario obraId={id} hoje={hoje} equipeSugerida={presentes || undefined} />
          </Cartao>)}
      </div>
    </>
  );
}
