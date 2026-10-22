import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { FormAtestado } from '@/components/FormAtestado';
import { data } from '@/lib/formato';

export const metadata = { title: 'Atestados' };
const TIPO: Record<string, string> = { medico: 'Médico', odontologico: 'Odontológico', acompanhamento: 'Acompanhamento', declaracao_horas: 'Declaração de horas', acidente_trabalho: 'Acidente de trabalho' };

export default async function Atestados() {
  const { supabase } = await exigirPapel('admin', 'rh');
  const [{ data: lista }, { data: funcs }] = await Promise.all([
    supabase.from('atestados').select('*, funcionarios(nome, matricula), perfis:registrado_por(nome)').order('data_inicio', { ascending: false }).limit(200),
    supabase.from('funcionarios').select('id, nome, matricula').eq('ativo', true).order('nome'),
  ]);
  const caminhos = (lista ?? []).filter((a) => a.caminho).map((a) => a.caminho as string);
  const assinadas = caminhos.length ? (await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600)).data ?? [] : [];
  const url = new Map(assinadas.map((s) => [s.path, s.signedUrl]));
  const mes = new Date().toISOString().slice(0, 7);
  const doMes = (lista ?? []).filter((a) => a.data_inicio.startsWith(mes));
  return (
    <>
      <Cabecalho titulo="Atestados e abonos" sub="Dado de saúde (LGPD): visível só para RH e diretoria. Os dias registrados ficam abonados no espelho de ponto e não descontam na folha." />
      <AbasDP atual="atestados" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Atestados no mês" valor={doMes.length} />
        <Indicador rotulo="Dias abonados no mês" valor={doMes.reduce((s, a) => s + a.dias, 0)} />
        <Indicador rotulo="Acidentes de trabalho" valor={doMes.filter((a) => a.tipo === 'acidente_trabalho').length} tom={doMes.some((a) => a.tipo === 'acidente_trabalho') ? 'atraso' : 'neutro'} detalhe="no mês — comunicar CAT" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Registrar"><FormAtestado funcionarios={funcs ?? []} /></Cartao>
        <Cartao titulo="Histórico" className="lg:col-span-2">
          {!lista?.length ? <Vazio>Nenhum atestado registrado.</Vazio> : (
            <div className="overflow-x-auto"><table className="tabela whitespace-nowrap">
              <thead><tr><th>Funcionário</th><th>Tipo</th><th>Período</th><th>CID</th><th>Documento</th></tr></thead>
              <tbody>{lista.map((a) => {
                const f = a.funcionarios as unknown as { nome: string; matricula: string };
                const fimD = new Date(a.data_inicio + 'T12:00:00'); fimD.setDate(fimD.getDate() + Math.max(a.dias - 1, 0));
                return (
                  <tr key={a.id}>
                    <td><b>{f?.nome}</b><div className="text-xs text-concreto-500">{f?.matricula} • por {(a.perfis as unknown as { nome: string })?.nome}</div></td>
                    <td>{a.tipo === 'acidente_trabalho' ? <Selo cor="bg-atraso-50 text-atraso-700">{TIPO[a.tipo]}</Selo> : TIPO[a.tipo]}</td>
                    <td>{a.tipo === 'declaracao_horas' ? `${data(a.data_inicio)} • ${String(a.horas).replace('.', ',')} h` : `${data(a.data_inicio)} a ${data(fimD.toISOString().slice(0, 10))} (${a.dias} d)`}</td>
                    <td className="font-mono text-xs">{a.cid ?? '—'}</td>
                    <td>{a.caminho && url.get(a.caminho) ? <a className="link" href={url.get(a.caminho)!} target="_blank">Ver</a> : '—'}</td>
                  </tr>);
              })}</tbody>
            </table></div>)}
        </Cartao>
      </div>
    </>
  );
}
