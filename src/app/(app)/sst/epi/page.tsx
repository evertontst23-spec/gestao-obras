import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, LinkBotao, Selo, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { data, dataHora } from '@/lib/formato';

export const metadata = { title: 'EPI' };
const MOTIVO: Record<string, string> = { admissao: 'Admissão', periodica: 'Troca periódica', desgaste: 'Desgaste', dano: 'Dano', perda: 'Perda', substituicao: 'Substituição', visitante: 'Visitante' };

export default async function EPI() {
  const { supabase } = await exigirPapel('admin', 'seguranca', 'almoxarifado', 'encarregado', 'engenheiro', 'rh');
  const [{ data: entregas }, { data: situacao }] = await Promise.all([
    supabase.from('epi_entregas').select('*, epi_entrega_itens(quantidade, insumos(descricao)), perfis(nome)').order('criado_em', { ascending: false }).limit(60),
    supabase.from('v_epi_situacao').select('*').eq('ativo', true).order('proxima_troca'),
  ]);
  const vencidas = (situacao ?? []).filter((s) => s.troca_vencida);
  const nomes = new Map((situacao ?? []).map((s) => [s.funcionario_id, s.funcionario_nome]));
  return (
    <>
      <Cabecalho titulo="EPI — entregas e fichas" acoes={<LinkBotao href="/sst/epi/nova">+ Registrar entrega</LinkBotao>} />
      <AbasSST atual="epi" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Entregas (últimas 60)" valor={entregas?.length ?? 0} />
        <Indicador rotulo="Trocas vencidas" valor={vencidas.length} tom={vencidas.length ? 'atraso' : 'ok'} detalhe="pela vida útil do EPI" />
        <Indicador rotulo="Funcionários com ficha" valor={new Set((situacao ?? []).map((s) => s.funcionario_id)).size} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Trocas vencidas / próximas">
          {!(situacao ?? []).filter((s) => s.proxima_troca).length ? <Vazio>Sem trocas programadas.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{(situacao ?? []).filter((s) => s.proxima_troca).slice(0, 25).map((s) => (
              <li key={`${s.funcionario_id}${s.insumo_id}`} className="flex items-center justify-between gap-2 py-2">
                <span><Link href={`/sst/epi/ficha/${s.funcionario_id}`} className="link">{s.funcionario_nome}</Link> — {s.descricao}</span>
                <Selo cor={s.troca_vencida ? 'bg-atraso-50 text-atraso-700' : 'bg-concreto-100 text-concreto-700'}>{s.troca_vencida ? 'venceu ' : 'troca '}{data(s.proxima_troca)}</Selo>
              </li>))}</ul>)}
        </Cartao>
        <Cartao titulo="Últimas entregas">
          {!entregas?.length ? <Vazio>Nenhuma entrega registrada.</Vazio> : (
            <ul className="divide-y divide-concreto-100 text-sm">{entregas.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex justify-between gap-2"><Link href={`/sst/epi/ficha/${e.funcionario_id}`} className="link">{nomes.get(e.funcionario_id) ?? 'Ficha nº ' + e.numero}</Link>
                  <Selo cor={e.confirmacao === 'facial' ? 'bg-sky-100 text-sky-800' : 'bg-concreto-100 text-concreto-700'}>{e.confirmacao === 'facial' ? '🙂 facial' : '✍ assinatura'}</Selo></div>
                <div className="text-xs text-concreto-600">{(e.epi_entrega_itens as unknown as { quantidade: number; insumos: { descricao: string } }[]).map((i) => `${i.quantidade}× ${i.insumos.descricao}`).join(', ')}</div>
                <div className="text-xs text-concreto-500">{MOTIVO[e.motivo]} • {(e.perfis as unknown as { nome: string })?.nome} • {dataHora(e.criado_em)}</div>
              </li>))}</ul>)}
        </Cartao>
      </div>
    </>
  );
}
