import { notFound } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { CamposTarefa, type FuncEquipe } from '@/components/FormTarefa';
import { editarTarefa } from '../../acoes';
import { codTarefa, type Perfil } from '@/lib/dominio';
import { data } from '@/lib/formato';

export default async function EditarTarefa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirPapel('admin', 'engenheiro');
  const { data: t } = await supabase.from('tarefas').select('*').eq('id', id).maybeSingle();
  if (!t) notFound();
  const { data: pl } = await supabase.from('planilhas').select('id').eq('obra_id', t.obra_id).eq('ativa', true).maybeSingle();
  const [{ data: itensPl }, { data: etapas }, { data: encarregados }, { data: equipe }] = await Promise.all([
    pl ? supabase.from('v_planilha_itens').select('id, codigo, descricao, unidade, saldo').eq('planilha_id', pl.id).eq('tipo', 'servico').order('ordem') : Promise.resolve({ data: [] }),
    supabase.from('etapas').select('id, nome').eq('obra_id', t.obra_id).order('ordem'),
    supabase.from('perfis').select('*').in('papel', ['encarregado', 'engenheiro', 'admin']).eq('ativo', true).order('nome'),
    supabase.from('v_funcionarios').select('id, nome, funcao_nome, obra_id').eq('ativo', true).order('nome'),
  ]);
  return (
    <>
      <Cabecalho titulo={`Editar ${codTarefa(t.numero)}`} sub={`Prazo atual: ${data(t.inicio_previsto)} a ${data(t.fim_previsto)} — para mudar o prazo use "Reprogramar prazo" na tarefa.`} />
      <Cartao>
        <FormAcao acao={editarTarefa}>
          <input type="hidden" name="id" value={id} />
          <CamposTarefa itens={(itensPl ?? []) as { id: string; codigo: string | null; descricao: string; unidade: string | null; saldo: number }[]} tarefa={t} etapas={etapas ?? []} encarregados={(encarregados ?? []) as Perfil[]} comPrazo={false} equipe={(equipe ?? []) as FuncEquipe[]} obraId={t.obra_id} />
          <div className="mt-5"><Botao>Salvar alterações</Botao></div>
        </FormAcao>
      </Cartao>
    </>
  );
}
