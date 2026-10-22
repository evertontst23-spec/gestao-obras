import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, LinkBotao, SeloPrioridade, SeloSolicitacao, Vazio } from '@/components/ui';
import { STATUS_SOLICITACAO, codSM } from '@/lib/dominio';
import { data, dataHora } from '@/lib/formato';

export const metadata = { title: 'Solicitações de material' };

export default async function Materiais({ searchParams }: { searchParams: Promise<{ obra?: string; status?: string; risco?: string }> }) {
  const f = await searchParams;
  const { supabase, perfil } = await obterSessao();
  let q = supabase.from('v_solicitacoes').select('*').order('criado_em', { ascending: false }).limit(300);
  if (perfil.papel === 'encarregado') q = q.eq('solicitante_id', perfil.id);
  if (f.obra) q = q.eq('obra_id', f.obra);
  if (f.status) q = q.eq('status', f.status);
  else q = q.not('status', 'in', '(concluida,cancelada,rejeitada)');
  if (f.risco) q = q.gt('itens_em_risco', 0);
  const [{ data: lista }, { data: obras }] = await Promise.all([q, supabase.from('obras').select('id, codigo, nome').order('nome')]);
  const pode = ['encarregado', 'engenheiro', 'admin', 'almoxarifado'].includes(perfil.papel);

  return (
    <>
      <Cabecalho titulo={perfil.papel === 'encarregado' ? 'Meus pedidos de material' : 'Solicitações de material'}
        sub={f.status ? STATUS_SOLICITACAO[f.status]?.rotulo : 'Em aberto'}
        acoes={pode && <LinkBotao href={f.obra ? `/materiais/nova?obra=${f.obra}` : '/materiais/nova'}>+ Solicitar material</LinkBotao>} />
      <form className="mb-4 flex flex-wrap gap-2 rounded-lg border border-concreto-200 bg-white p-3">
        <select name="obra" defaultValue={f.obra ?? ''} className="entrada w-auto min-w-[200px] flex-1"><option value="">Todas as obras</option>
          {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
        <select name="status" defaultValue={f.status ?? ''} className="entrada w-auto"><option value="">Em aberto</option>
          {Object.entries(STATUS_SOLICITACAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="risco" value="1" defaultChecked={!!f.risco} className="accent-sinal-500" /> Só com risco de atraso</label>
        <button className="rounded-md bg-concreto-800 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>
      {!lista?.length ? <Vazio>Nenhuma solicitação encontrada.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white">
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Obra / serviço</th><th>Solicitante</th><th>Pedido em</th><th>Necessário</th><th>Prioridade</th><th>Itens</th><th>Status</th></tr></thead>
            <tbody>{lista.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/materiais/${s.id}`} className="link font-mono">{codSM(s.numero)}</Link></td>
                <td className="min-w-[200px]">{s.obra_codigo}<div className="text-xs text-concreto-500">{s.tarefa_titulo ?? 'Uso geral'}</div></td>
                <td className="whitespace-nowrap">{s.solicitante_nome}</td>
                <td className="whitespace-nowrap text-xs">{dataHora(s.criado_em)}</td>
                <td className="whitespace-nowrap">{data(s.data_necessidade)}</td>
                <td><SeloPrioridade p={s.prioridade} /></td>
                <td className="whitespace-nowrap font-mono text-xs">{s.itens_entregues}/{s.total_itens}{s.itens_em_risco > 0 && <span className="ml-1 font-bold text-atraso-700">⚠{s.itens_em_risco}</span>}</td>
                <td><SeloSolicitacao s={s.status} /></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
