import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { data, hojeISO } from '@/lib/formato';

export const metadata = { title: 'Painel SST' };

export default async function PainelSST() {
  const { supabase } = await exigirPapel('admin', 'seguranca', 'engenheiro', 'rh');
  const hoje = hojeISO(), mes = hoje.slice(0, 7);
  const [{ data: equipe }, { data: ponto }, { data: epi }, { data: dds }, { data: os }, { data: docs }, { data: semBio }] = await Promise.all([
    supabase.rpc('equipe_da_obra', { p_obra: null }),
    supabase.from('registros_ponto').select('funcionario_id').eq('data', hoje),
    supabase.from('v_epi_situacao').select('*').eq('ativo', true).eq('troca_vencida', true),
    supabase.from('dds').select('id, data, obra_id').gte('data', `${mes}-01`),
    supabase.from('ordens_servico').select('funcionario_id, ciencia_em').eq('substituida', false),
    supabase.from('v_funcionarios').select('id, nome, documentos_vencidos, documentos_a_vencer').eq('ativo', true).or('documentos_vencidos.gt.0,documentos_a_vencer.gt.0'),
    supabase.from('v_funcionarios').select('id').eq('ativo', true).eq('biometria_cadastrada', false),
  ]);
  const eq = (equipe ?? []) as { id: string; nome: string }[];
  const presentes = new Set((ponto ?? []).map((p) => p.funcionario_id)).size;
  const comOS = new Set((os ?? []).map((o) => o.funcionario_id));
  const semOS = eq.filter((e) => !comOS.has(e.id));
  const ddsHoje = (dds ?? []).filter((d) => d.data === hoje).length;
  return (
    <>
      <Cabecalho titulo="Painel de Segurança do Trabalho" sub="Situação de hoje e pendências de conformidade (NR-01, NR-06, NR-18)." />
      <AbasSST atual="painel" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Indicador rotulo="Presentes hoje" valor={`${presentes}/${eq.length}`} href="/dp/ponto" />
        <Indicador rotulo="DDS hoje" valor={ddsHoje} tom={ddsHoje ? 'ok' : 'atencao'} href="/sst/dds" detalhe={`${dds?.length ?? 0} no mês`} />
        <Indicador rotulo="Troca de EPI vencida" valor={epi?.length ?? 0} tom={epi?.length ? 'atraso' : 'ok'} href="/sst/epi" />
        <Indicador rotulo="Sem Ordem de Serviço" valor={semOS.length} tom={semOS.length ? 'atraso' : 'ok'} href="/sst/os" />
        <Indicador rotulo="OS sem ciência" valor={(os ?? []).filter((o) => !o.ciencia_em).length} tom="atencao" href="/sst/os" />
        <Indicador rotulo="Docs vencidos / a vencer" valor={(docs ?? []).reduce((s, d) => s + Number(d.documentos_vencidos) + Number(d.documentos_a_vencer), 0)} tom={(docs ?? []).some((d) => d.documentos_vencidos > 0) ? 'atraso' : 'ok'} href="/cadastros/funcionarios" />
        <Indicador rotulo="Sem biometria" valor={semBio?.length ?? 0} detalhe="ponto só manual" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Documentos vencidos ou vencendo (30 dias)">
          {!docs?.length ? <Vazio>Tudo em dia.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{docs.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 py-2"><Link href={`/cadastros/funcionarios/${d.id}`} className="link">{d.nome}</Link>
                <span>{d.documentos_vencidos > 0 && <Selo cor="bg-atraso-50 text-atraso-700">{d.documentos_vencidos} vencido(s)</Selo>} {d.documentos_a_vencer > 0 && <Selo cor="bg-atencao-50 text-atencao-700">{d.documentos_a_vencer} a vencer</Selo>}</span></li>))}</ul>)}
        </Cartao>
        <Cartao titulo="Troca de EPI vencida">
          {!epi?.length ? <Vazio>Nenhuma troca vencida.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{epi.map((s) => (
              <li key={`${s.funcionario_id}${s.insumo_id}`} className="flex justify-between gap-2 py-2"><span><Link href={`/sst/epi/ficha/${s.funcionario_id}`} className="link">{s.funcionario_nome}</Link> — {s.descricao}</span>
                <Selo cor="bg-atraso-50 text-atraso-700">desde {data(s.proxima_troca)}</Selo></li>))}</ul>)}
        </Cartao>
      </div>
    </>
  );
}
