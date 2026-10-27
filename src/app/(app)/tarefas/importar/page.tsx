import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Vazio } from '@/components/ui';
import { ImportarTarefas } from '@/components/ImportarTarefas';
import { hojeISO } from '@/lib/formato';

export const metadata = { title: 'Importar planilha de tarefas' };

export default async function ImportarTarefasPagina({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const { obra } = await searchParams;
  const { supabase } = await exigirPapel('admin', 'engenheiro');
  const { data: obras } = await supabase.from('obras').select('id, codigo, nome, encarregado_id, engenheiro_id').not('situacao', 'in', '(concluida,cancelada)').order('nome');
  if (!obras?.length) return <><Cabecalho titulo="Importar planilha de tarefas" /><Vazio>Cadastre uma obra antes.</Vazio></>;
  const o = obras.find((x) => x.id === obra);
  if (!o) {
    return (
      <>
        <Cabecalho titulo="Importar planilha de tarefas" sub="Escolha a obra que vai receber as tarefas" />
        <div className="grid gap-2 sm:grid-cols-2">
          {obras.map((x) => <Link key={x.id} href={`/tarefas/importar?obra=${x.id}`} className="rounded-lg border border-concreto-200 bg-white p-4 hover:border-sinal-400">
            <div className="font-mono text-xs text-concreto-500">{x.codigo}</div><div className="font-bold">{x.nome}</div></Link>)}
        </div>
      </>);
  }
  const [{ data: enc }, { data: etapas }, { count }] = await Promise.all([
    supabase.from('perfis').select('id, nome, papel').in('papel', ['encarregado', 'engenheiro', 'admin']).eq('ativo', true).order('nome'),
    supabase.from('etapas').select('id, nome').eq('obra_id', o.id).order('ordem'),
    supabase.from('tarefas').select('id', { count: 'exact', head: true }).eq('obra_id', o.id),
  ]);
  return (
    <>
      <Cabecalho titulo="Importar planilha de tarefas" sub={<>Obra: <b>{o.codigo} — {o.nome}</b> · {count ?? 0} tarefa(s) já cadastrada(s) · <Link href="/tarefas/importar" className="link">trocar obra</Link></>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao className="lg:col-span-2"><ImportarTarefas obra={o.id} encarregados={(enc ?? []).map((p) => ({ id: p.id, nome: p.papel === 'encarregado' ? p.nome : `${p.nome} (${p.papel === 'admin' ? 'diretoria' : 'engenheiro'})` }))}
          padrao={o.encarregado_id ?? o.engenheiro_id ?? ''} etapas={etapas ?? []} hoje={hojeISO()} />
          {!o.encarregado_id && !o.engenheiro_id && <p className="mt-3 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">Esta obra ainda não tem responsável. Defina em <Link className="link" href={`/obras/${o.id}`}>Obra → Editar dados da obra → Responsável pela obra</Link> para ele já vir escolhido aqui.</p>}</Cartao>
        <Cartao titulo="Como montar a planilha">
          <ul className="list-disc space-y-1 pl-5 text-sm text-concreto-600">
            <li>Uma tarefa por linha. Só a coluna <b>Serviço</b> é obrigatória.</li>
            <li>Colunas reconhecidas: Serviço, Descrição, Local, Quantidade, Unidade, Início, Fim (ou Prazo), Responsável, Etapa, Prioridade e Observações — em qualquer ordem.</li>
            <li>Datas como 25/10/2026. Sem data, vale o início padrão e o prazo em dias que você escolher.</li>
            <li>Responsável: nome do encarregado (ou parte dele). Vazio = responsável padrão.</li>
            <li>Etapa: nome de uma etapa já cadastrada na obra.</li>
            <li>Confira a prévia antes de importar. Cada encarregado recebe o aviso das suas tarefas.</li>
          </ul>
          <p className="mt-3 text-xs text-concreto-500">Para tarefas ligadas à planilha orçamentária (medição), use a aba Planilha da obra.</p>
        </Cartao>
      </div>
    </>
  );
}
