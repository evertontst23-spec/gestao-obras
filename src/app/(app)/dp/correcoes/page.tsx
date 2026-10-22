import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { data, dataHora } from '@/lib/formato';

export const metadata = { title: 'Pedidos de correção de ponto' };

export default async function Correcoes({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'rh');
  let qy = supabase.from('ponto_contestacoes').select('*, funcionarios(nome, matricula, obras(codigo)), resp:respondido_por(nome)').order('status').order('criado_em', { ascending: false }).limit(300);
  if (!sp.todos) qy = qy.eq('status', 'aberta');
  const [{ data: lista }, { count: abertos }, { count: links }] = await Promise.all([
    qy,
    supabase.from('ponto_contestacoes').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    supabase.from('funcionario_acessos').select('token', { count: 'exact', head: true }).is('revogado_em', null),
  ]);
  return (
    <>
      <Cabecalho titulo="Pedidos de correção de ponto" sub="Enviados pelos funcionários no link do espelho. Corrija no espelho do dia ou indefira com uma resposta." />
      <AbasDP atual="correcoes" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Aguardando o RH" valor={abertos ?? 0} tom={abertos ? 'atraso' : 'ok'} />
        <Indicador rotulo="Funcionários com link ativo" valor={links ?? 0} detalhe="gere o link no espelho de cada um" />
      </div>
      <div className="mb-3 text-sm">{sp.todos ? <Link className="link" href="/dp/correcoes">Ver só os pendentes</Link> : <Link className="link" href="/dp/correcoes?todos=1">Ver também os respondidos</Link>}</div>
      {!lista?.length ? <Vazio>Nenhum pedido {sp.todos ? '' : 'pendente'}. 👍</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela">
          <thead><tr><th>Dia</th><th>Funcionário</th><th>Pedido</th><th>Situação</th><th /></tr></thead>
          <tbody>{lista.map((p) => {
            const f = p.funcionarios as unknown as { nome: string; matricula: string; obras: { codigo: string } | null };
            return (
              <tr key={p.id}>
                <td className="whitespace-nowrap font-mono">{data(p.data)}</td>
                <td className="whitespace-nowrap"><b>{f.nome}</b><div className="text-xs text-concreto-500">{f.matricula}{f.obras ? ` • ${f.obras.codigo}` : ''}</div></td>
                <td>“{p.mensagem}”<div className="text-xs text-concreto-500">enviado {dataHora(p.criado_em)}</div>{p.resposta && <div className="mt-1 text-xs text-concreto-600">RH ({(p.resp as unknown as { nome: string } | null)?.nome}): {p.resposta}</div>}</td>
                <td><Selo cor={p.status === 'aberta' ? 'bg-atencao-100 text-atencao-800' : p.status === 'corrigida' ? 'bg-ok-50 text-ok-700' : 'bg-concreto-100 text-concreto-600'}>{p.status === 'aberta' ? 'Aguardando' : p.status === 'corrigida' ? 'Corrigido' : 'Indeferido'}</Selo></td>
                <td className="whitespace-nowrap">{p.status === 'aberta' && <Link className="link" href={`/dp/espelho?mes=${p.data.slice(0, 7)}&func=${p.funcionario_id}&dia=${p.data}&pedido=${p.id}#corrigir`}>Analisar →</Link>}</td>
              </tr>);
          })}</tbody>
        </table></div>)}
    </>
  );
}
