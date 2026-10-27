import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { ItensMaterial } from '@/components/ItensMaterial';
import { VinculoTarefa } from '@/components/VinculoTarefa';
import { criarSolicitacao } from '../acoes';
import { PRIORIDADES, TAREFA_ABERTA, codTarefa } from '@/lib/dominio';
import { hojeISO, somarDias } from '@/lib/formato';

export const metadata = { title: 'Solicitar material' };

export default async function NovaSolicitacao({ searchParams }: { searchParams: Promise<{ tarefa?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await obterSessao();
  if (!['encarregado', 'engenheiro', 'admin', 'almoxarifado'].includes(perfil.papel)) {
    return <Vazio>Seu perfil não faz solicitações de material.</Vazio>;
  }

  let tarefa: { id: string; numero: number; titulo: string; obra_id: string; obra_nome: string; prioridade: string } | null = null;
  if (sp.tarefa) {
    const { data } = await supabase.from('v_tarefas').select('id, numero, titulo, obra_id, obra_nome, prioridade').eq('id', sp.tarefa).maybeSingle();
    tarefa = data;
  }
  const obraId = tarefa?.obra_id ?? sp.obra;

  if (!obraId) {
    const { data: obras } = await supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome');
    return (
      <div className="mx-auto max-w-xl">
        <Cabecalho titulo="Solicitar material" sub="Para qual obra?" />
        {!obras?.length ? <Vazio>Você não está vinculado a nenhuma obra ativa.</Vazio> : (
          <div className="space-y-2">{obras.map((o) => (
            <Link key={o.id} href={`/materiais/nova?obra=${o.id}`} className="block min-h-[56px] rounded-lg border border-concreto-200 bg-white p-4 font-semibold hover:border-sinal-400">
              <span className="font-mono text-xs text-concreto-500">{o.codigo}</span><br />{o.nome}</Link>))}
          </div>)}
      </div>
    );
  }

  const qt = supabase.from('v_tarefas').select('id, numero, titulo, etapa_nome, local, encarregado_id').eq('obra_id', obraId).in('status', TAREFA_ABERTA).order('numero');
  const [{ data: obra }, { data: tarefas }, { data: insumos }] = await Promise.all([
    supabase.from('obras').select('id, nome, exige_aprovacao_material').eq('id', obraId).maybeSingle(),
    tarefa ? Promise.resolve({ data: [] as { id: string; numero: number; titulo: string; etapa_nome: string | null; local: string | null; encarregado_id: string }[] }) : qt,
    supabase.from('insumos').select('codigo, descricao, unidade').eq('ativo', true).order('codigo'),
  ]);
  if (!obra) return <Vazio>Obra não encontrada.</Vazio>;
  const hoje = hojeISO();

  return (
    <div className="mx-auto max-w-2xl">
      <Cabecalho titulo="Solicitar material" sub={<>Obra: <b>{obra.nome}</b>{tarefa && <> • Serviço: <b>{codTarefa(tarefa.numero)} {tarefa.titulo}</b></>}</>} />
      <Cartao>
        <FormAcao acao={criarSolicitacao} className="space-y-4">
          <input type="hidden" name="obra_id" value={obra.id} />
          {tarefa ? <input type="hidden" name="tarefa_id" value={tarefa.id} />
            : <VinculoTarefa planilhaHref={`/tarefas/importar?obra=${obra.id}`}
    tarefas={(tarefas ?? []).map((t) => ({ id: t.id, numero: t.numero, titulo: t.titulo, etapa_nome: t.etapa_nome, local: t.local, minha: t.encarregado_id === perfil.id }))} />}
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Preciso na obra até *"><input type="date" name="data_necessidade" required min={hoje} defaultValue={somarDias(hoje, 3)} className="entrada" /></Campo>
            <Campo rotulo="Prioridade">
              <select name="prioridade" defaultValue={tarefa?.prioridade ?? 'normal'} className="entrada">
                {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              </select>
            </Campo>
          </div>
          <ItensMaterial insumos={insumos ?? []} />
          <Campo rotulo="Justificativa"><input name="justificativa" className="entrada" placeholder="Para que será usado" /></Campo>
          {tarefa && <Campo rotulo="Observações"><textarea name="observacoes" rows={2} className="entrada" /></Campo>}
          <p className="text-xs text-concreto-500">
            {obra.exige_aprovacao_material && perfil.papel === 'encarregado' ? 'O pedido vai para aprovação do engenheiro.' : 'O pedido segue direto para o almoxarifado.'} Fotos podem ser anexadas na próxima tela.
          </p>
          <Botao grande>Enviar pedido</Botao>
        </FormAcao>
      </Cartao>
    </div>
  );
}
