import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { CamposTarefa } from '@/components/FormTarefa';
import { criarTarefa } from '../acoes';
import type { Perfil } from '@/lib/dominio';

export const metadata = { title: 'Nova tarefa' };

export default async function NovaTarefa({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const { obra } = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'engenheiro');
  // RLS já restringe às obras em que o usuário atua
  const { data: obras } = await supabase.from('obras').select('id, codigo, nome, encarregado_id, engenheiro_id').not('situacao', 'in', '(concluida,cancelada)').order('nome');
  void perfil;

  if (!obras?.length) return <><Cabecalho titulo="Nova tarefa" /><Vazio>Cadastre uma obra antes. <Link className="link" href="/obras/nova">Nova obra</Link></Vazio></>;
  const obraSel = obra && obras.some((o) => o.id === obra) ? obra : null;

  if (!obraSel) {
    return (
      <>
        <Cabecalho titulo="Nova tarefa" sub="Selecione a obra" />
        <div className="grid gap-2 sm:grid-cols-2">
          {obras.map((o) => <Link key={o.id} href={`/tarefas/nova?obra=${o.id}`} className="rounded-lg border border-concreto-200 bg-white p-4 hover:border-sinal-400">
            <div className="font-mono text-xs text-concreto-500">{o.codigo}</div><div className="font-bold">{o.nome}</div></Link>)}
        </div>
      </>
    );
  }

  const { data: pl } = await supabase.from('planilhas').select('id').eq('obra_id', obraSel).eq('ativa', true).maybeSingle();
  const [{ data: itensPl }, { data: etapas }, { data: membros }] = await Promise.all([
    pl ? supabase.from('v_planilha_itens').select('id, codigo, descricao, unidade, saldo').eq('planilha_id', pl.id).eq('tipo', 'servico').order('ordem') : Promise.resolve({ data: [] }),
    supabase.from('etapas').select('id, nome').eq('obra_id', obraSel).order('ordem'),
    supabase.from('perfis').select('*').in('papel', ['encarregado', 'engenheiro', 'admin']).eq('ativo', true).order('nome'),
  ]);
  const o = obras.find((x) => x.id === obraSel)!;
  return (
    <>
      <Cabecalho titulo="Nova tarefa" sub={<>Obra: <b>{o.codigo} — {o.nome}</b> · <Link href="/tarefas/nova" className="link">trocar</Link></>}
        acoes={<Link href={`/tarefas/importar?obra=${obraSel}`} className="inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold hover:border-sinal-400">⬆ Importar várias pela planilha</Link>} />
      <Cartao>
        <FormAcao acao={criarTarefa} limparAoConcluir>
          <input type="hidden" name="obra_id" value={obraSel} />
          <CamposTarefa tarefa={{ encarregado_id: o.encarregado_id ?? o.engenheiro_id ?? '' }} itens={(itensPl ?? []) as { id: string; codigo: string | null; descricao: string; unidade: string | null; saldo: number }[]} etapas={etapas ?? []} encarregados={(membros ?? []) as Perfil[]} comPrazo />
          <div className="mt-5 flex flex-wrap gap-2">
            <Botao>Criar e abrir tarefa</Botao>
            <Botao variante="secundario" name="continuar" value="1">Criar e cadastrar outra</Botao>
          </div>
          <p className="mt-2 text-xs text-concreto-500">O encarregado recebe a notificação na hora e precisa confirmar o recebimento.</p>
        </FormAcao>
      </Cartao>
    </>
  );
}
