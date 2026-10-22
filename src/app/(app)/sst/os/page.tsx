import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, LinkBotao, Selo, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { data } from '@/lib/formato';

export const metadata = { title: 'Ordens de Serviço' };

export default async function ListaOS() {
  const { supabase, perfil } = await exigirPapel('admin', 'seguranca', 'rh', 'engenheiro', 'encarregado');
  const [{ data: lista }, { data: equipe }] = await Promise.all([
    supabase.from('ordens_servico').select('*').eq('substituida', false).order('criado_em', { ascending: false }),
    supabase.rpc('equipe_da_obra', { p_obra: null }),
  ]);
  const eq = (equipe ?? []) as { id: string; nome: string; funcao: string }[];
  const nomes = new Map(eq.map((e) => [e.id, e.nome]));
  const comOS = new Set((lista ?? []).map((o) => o.funcionario_id));
  const semOS = eq.filter((e) => !comOS.has(e.id));
  const pend = (lista ?? []).filter((o) => !o.ciencia_em);
  const pode = perfil.papel === 'admin' || perfil.papel === 'seguranca';
  return (
    <>
      <Cabecalho titulo="Ordens de Serviço de SST (NR-01)" sub="Informa ao trabalhador os riscos da função, as medidas de prevenção e os EPIs — com ciência assinada."
        acoes={pode && <LinkBotao href="/sst/os/nova">+ Emitir OS</LinkBotao>} />
      <AbasSST atual="os" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="OS vigentes" valor={lista?.length ?? 0} />
        <Indicador rotulo="Aguardando ciência" valor={pend.length} tom={pend.length ? 'atencao' : 'ok'} />
        <Indicador rotulo="Funcionários sem OS" valor={semOS.length} tom={semOS.length ? 'atraso' : 'ok'} />
      </div>
      {pode && semOS.length > 0 && (
        <div className="mb-5 rounded-lg border border-atraso-500 bg-atraso-50 p-3 text-sm">
          <b className="text-atraso-700">Sem Ordem de Serviço:</b> {semOS.map((e, k) => <span key={e.id}>{k ? ', ' : ' '}<Link href={`/sst/os/nova?func=${e.id}`} className="link">{e.nome}</Link></span>)}
        </div>)}
      {!lista?.length ? <Vazio>Nenhuma OS emitida.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela">
          <thead><tr><th>Nº</th><th>Funcionário</th><th>Função</th><th>Emissão</th><th>Ciência</th></tr></thead>
          <tbody>{lista.map((o) => (
            <tr key={o.id}><td><Link href={`/sst/os/${o.id}`} className="link font-mono">OS-{String(o.numero).padStart(4, '0')}</Link></td>
              <td>{nomes.get(o.funcionario_id) ?? '—'}</td><td>{o.funcao_nome}</td><td>{data(o.data)}</td>
              <td>{o.ciencia_em ? <Selo cor="bg-ok-50 text-ok-700">Assinada {data(o.ciencia_em)}</Selo> : <Selo cor="bg-atencao-50 text-atencao-700">Pendente</Selo>}</td></tr>))}</tbody>
        </table></div>)}
    </>
  );
}
