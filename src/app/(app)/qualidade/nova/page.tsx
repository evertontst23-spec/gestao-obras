import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { abrirNC } from '../acoes';
import { GRAVIDADE } from '@/components/SelosQualidade';
import { codTarefa } from '@/lib/dominio';
import { hojeISO, somarDias } from '@/lib/formato';

export const metadata = { title: 'Nova não conformidade' };

export default async function NovaNC({ searchParams }: { searchParams: Promise<{ obra?: string; tarefa?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await obterSessao();
  if (!['engenheiro', 'admin', 'encarregado'].includes(perfil.papel)) return <Vazio>Seu perfil não registra não conformidades.</Vazio>;

  let obraId = sp.obra;
  let tarefa: { id: string; numero: number; titulo: string; obra_id: string; encarregado_id: string; local: string | null } | null = null;
  if (sp.tarefa) {
    const { data } = await supabase.from('tarefas').select('id, numero, titulo, obra_id, encarregado_id, local').eq('id', sp.tarefa).maybeSingle();
    tarefa = data; obraId = data?.obra_id ?? obraId;
  }
  if (!obraId) {
    const { data: obras } = await supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome');
    return (
      <div className="mx-auto max-w-xl">
        <Cabecalho titulo="Nova não conformidade" sub="Em qual obra?" />
        <div className="space-y-2">{obras?.map((o) => (
          <Link key={o.id} href={`/qualidade/nova?obra=${o.id}`} className="block rounded-lg border border-concreto-200 bg-white p-4 font-semibold hover:border-sinal-400">
            <span className="font-mono text-xs text-concreto-500">{o.codigo}</span><br />{o.nome}</Link>))}</div>
      </div>
    );
  }
  const { data: planilha } = await supabase.from('planilhas').select('id').eq('obra_id', obraId).eq('ativa', true).maybeSingle();
  const [{ data: obra }, { data: tarefas }, { data: pessoas }, { data: itens }] = await Promise.all([
    supabase.from('obras').select('id, nome, encarregado_id').eq('id', obraId).maybeSingle(),
    tarefa ? Promise.resolve({ data: [] as { id: string; numero: number; titulo: string }[] })
      : supabase.from('tarefas').select('id, numero, titulo').eq('obra_id', obraId).neq('status', 'aprovado').order('numero'),
    supabase.from('perfis').select('id, nome, papel').in('papel', ['encarregado', 'engenheiro']).eq('ativo', true).order('nome'),
    planilha ? supabase.from('planilha_itens').select('id, codigo, descricao').eq('planilha_id', planilha.id).eq('tipo', 'servico').order('ordem')
      : Promise.resolve({ data: [] as { id: string; codigo: string | null; descricao: string }[] }),
  ]);
  if (!obra) return <Vazio>Obra não encontrada.</Vazio>;
  const respPadrao = tarefa?.encarregado_id ?? obra.encarregado_id ?? '';

  return (
    <div className="mx-auto max-w-2xl">
      <Cabecalho titulo="Nova não conformidade" sub={<>Obra: <b>{obra.nome}</b>{tarefa && <> • {codTarefa(tarefa.numero)} {tarefa.titulo}</>}</>} />
      <Cartao>
        <FormAcao acao={abrirNC} className="space-y-4">
          <input type="hidden" name="obra_id" value={obra.id} />
          {tarefa ? <input type="hidden" name="tarefa_id" value={tarefa.id} /> : (
            <Campo rotulo="Serviço / tarefa relacionada"><select name="tarefa_id" defaultValue="" className="entrada"><option value="">—</option>
              {tarefas?.map((t) => <option key={t.id} value={t.id}>{codTarefa(t.numero)} — {t.titulo}</option>)}</select></Campo>)}
          {!!itens?.length && !tarefa && (
            <Campo rotulo="Item da planilha"><select name="item_id" defaultValue="" className="entrada"><option value="">—</option>
              {itens.map((i) => <option key={i.id} value={i.id}>{i.codigo ? `${i.codigo} — ` : ''}{i.descricao.slice(0, 80)}</option>)}</select></Campo>)}
          <Campo rotulo="O que está fora do padrão? *"><textarea name="descricao" required minLength={5} rows={3} className="entrada" placeholder="Ex.: fiadas fora de prumo no eixo 3, desvio de 2 cm" /></Campo>
          <Campo rotulo="Local"><input name="local" defaultValue={tarefa?.local ?? ''} className="entrada" placeholder="Bloco, pavimento, ambiente" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Gravidade"><select name="gravidade" defaultValue="moderada" className="entrada">
              {Object.entries(GRAVIDADE).map(([k, v]) => <option key={k} value={k}>{v.r}</option>)}</select></Campo>
            <Campo rotulo="Corrigir até *"><input type="date" name="prazo" required min={hojeISO()} defaultValue={somarDias(hojeISO(), 3)} className="entrada" /></Campo>
          </div>
          <Campo rotulo="Responsável pela correção *"><select name="responsavel_id" required defaultValue={respPadrao} className="entrada">
            <option value="" disabled>Selecionar…</option>
            {pessoas?.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.papel})</option>)}</select></Campo>
          <p className="text-xs text-concreto-500">Na próxima tela, anexe as fotos da não conformidade. Uma tarefa com NC aberta não pode ser aprovada.</p>
          <Botao grande variante="perigo">Registrar não conformidade</Botao>
        </FormAcao>
      </Cartao>
    </div>
  );
}
