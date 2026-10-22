import { redirect } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { AbasSST } from '@/components/AbasSST';
import { emitirOS } from '../../acoes';
import type { EstadoAcao } from '@/lib/acoes';

export const metadata = { title: 'Emitir Ordem de Serviço' };

async function emitirEAbrir(e: EstadoAcao, f: FormData): Promise<EstadoAcao> {
  'use server';
  const r = await emitirOS(e, f);
  if (r?.ok && r.id) redirect(`/sst/os/${r.id}`);
  return r;
}

export default async function NovaOS({ searchParams }: { searchParams: Promise<{ func?: string }> }) {
  const { func } = await searchParams;
  const { supabase } = await exigirPapel('admin', 'seguranca');
  const { data: lista } = await supabase.from('v_funcionarios').select('id, nome, funcao_nome, riscos, epis_obrigatorios').eq('ativo', true).order('nome');
  const f = lista?.find((x) => x.id === func);
  return (
    <>
      <Cabecalho titulo="Emitir Ordem de Serviço" sub="Riscos e EPIs vêm preenchidos pela função — ajuste conforme a atividade real." />
      <AbasSST atual="os" />
      <Cartao className="mx-auto max-w-3xl">
        <form className="mb-4 flex gap-2"><select name="func" defaultValue={func ?? ''} className="entrada flex-1"><option value="">Selecionar funcionário…</option>
          {lista?.map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.funcao_nome}</option>)}</select><button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Carregar</button></form>
        {f && (
          <FormAcao acao={emitirEAbrir} className="space-y-3">
            <input type="hidden" name="funcionario_id" value={f.id} />
            <Campo rotulo="Atividades a executar *"><textarea name="atividades" required rows={3} className="entrada" defaultValue={`Atividades da função de ${f.funcao_nome} no canteiro de obras, conforme orientação do encarregado.`} /></Campo>
            <Campo rotulo="Riscos (separe por vírgula) *"><textarea name="riscos" required rows={2} className="entrada" defaultValue={(f.riscos ?? []).join(', ')} /></Campo>
            <Campo rotulo="Medidas de prevenção"><textarea name="medidas" rows={3} className="entrada" defaultValue="Seguir os procedimentos da obra, manter área limpa e organizada, respeitar a sinalização, participar dos DDS e treinamentos." /></Campo>
            <Campo rotulo="EPIs obrigatórios (separe por vírgula)"><input name="epis" className="entrada" defaultValue={(f.epis_obrigatorios ?? []).join(', ')} /></Campo>
            <Campo rotulo="Proibições"><textarea name="proibicoes" rows={2} className="entrada" defaultValue="É proibido operar máquinas sem treinamento, retirar proteções, trabalhar em altura sem ancoragem e consumir bebida alcoólica." /></Campo>
            <Campo rotulo="Em caso de acidente / emergência"><textarea name="emergencia" rows={2} className="entrada" defaultValue="Comunicar imediatamente o encarregado e a Segurança do Trabalho. SAMU 192 • Bombeiros 193." /></Campo>
            <Botao grande>Emitir OS</Botao>
          </FormAcao>)}
      </Cartao>
    </>
  );
}
