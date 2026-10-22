import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { FotoUpload } from '@/components/FotoUpload';
import { Galeria } from '@/components/Galeria';
import { SeloGravidade, SeloNC } from '@/components/SelosQualidade';
import { cancelarNC, iniciarCorrecao, registrarCorrecao, verificarNC } from '../acoes';
import { codTarefa } from '@/lib/dominio';
import { data, dataHora } from '@/lib/formato';

export default async function DetalheNC({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const { id } = await params;
  const { nova } = await searchParams;
  const { supabase, perfil } = await obterSessao();
  const { data: n } = await supabase.from('v_nao_conformidades').select('*').eq('id', id).maybeSingle();
  if (!n) notFound();
  const [{ data: eventos }, { data: fotos }, { data: pode }] = await Promise.all([
    supabase.from('nc_eventos').select('*, perfis(nome)').eq('nc_id', id).order('criado_em', { ascending: false }),
    supabase.from('anexos').select('*').eq('nao_conformidade_id', id).order('criado_em'),
    supabase.rpc('gere_obra', { p_obra: n.obra_id }),
  ]);
  const gere = Boolean(pode);
  const resp = n.responsavel_id === perfil.id;
  const pendente = ['aberta', 'em_correcao'].includes(n.status);
  const antes = (fotos ?? []).filter((f) => f.categoria !== 'correcao');
  const depois = (fotos ?? []).filter((f) => f.categoria === 'correcao');

  return (
    <div className="mx-auto max-w-5xl">
      <Cabecalho titulo={`${n.codigo} — ${n.descricao}`}
        sub={<span className="flex flex-wrap items-center gap-2"><Link href={`/qualidade?obra=${n.obra_id}`} className="link">{n.obra_codigo} — {n.obra_nome}</Link><SeloGravidade g={n.gravidade} /><SeloNC s={n.status} /></span>} />
      {nova && <p className="mb-4 rounded-md bg-ok-50 px-4 py-3 text-sm font-semibold text-ok-700">Registrada e responsável notificado. Agora anexe as fotos da não conformidade.</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Info rotulo="Responsável">{n.responsavel_nome}</Info>
              <Info rotulo="Corrigir até"><span className={n.vencida ? 'font-bold text-atraso-700' : ''}>{data(n.prazo_correcao)}{n.vencida && ' (vencida)'}</span></Info>
              <Info rotulo="Aberta por">{n.aberta_por_nome}<div className="text-xs text-concreto-500">{dataHora(n.aberta_em)}</div></Info>
              <Info rotulo="Local">{n.local ?? '—'}</Info>
              <Info rotulo="Tarefa">{n.tarefa_id ? <Link href={`/tarefas/${n.tarefa_id}`} className="link">{codTarefa(n.tarefa_numero)} {n.tarefa_titulo}</Link> : '—'}</Info>
              <Info rotulo="Item da planilha">{n.item_codigo ? `${n.item_codigo} — ${n.item_descricao}` : n.item_descricao ?? '—'}</Info>
            </dl>
            {n.acao_corretiva && <p className="mt-4 rounded-md bg-concreto-50 p-3 text-sm"><b>Correção executada:</b> {n.acao_corretiva}</p>}
            {n.parecer && <p className="mt-2 text-sm text-concreto-600"><b>Parecer:</b> {n.parecer}</p>}
            {n.reaberturas > 0 && <p className="mt-2 text-xs font-semibold text-atraso-700">Reaberta {n.reaberturas} vez(es)</p>}
          </Cartao>

          <div className="grid gap-5 md:grid-cols-2">
            <Cartao titulo="Fotos da não conformidade">
              <div className="space-y-3">
                {pendente && (gere || resp || n.aberta_por === perfil.id) && <FotoUpload obraId={n.obra_id} naoConformidadeId={id} categoria="nao_conformidade" rotulo="📷 Foto do problema" />}
                <Galeria anexos={antes} vazio="Sem fotos do problema." />
              </div>
            </Cartao>
            <Cartao titulo="Fotos da correção">
              <div className="space-y-3">
                {pendente && (resp || gere) && <FotoUpload obraId={n.obra_id} naoConformidadeId={id} categoria="correcao" rotulo="📷 Foto da correção" />}
                <Galeria anexos={depois} vazio="A correção ainda não tem fotos." />
              </div>
            </Cartao>
          </div>
        </div>

        <div className="space-y-5">
          {pendente && (resp || gere) && (
            <Cartao titulo="Correção">
              <div className="space-y-3">
                {n.status === 'aberta' && (
                  <FormAcao acao={iniciarCorrecao}><input type="hidden" name="nc" value={id} /><Botao grande variante="escuro">Iniciar correção</Botao></FormAcao>)}
                <FormAcao acao={registrarCorrecao} className="space-y-2">
                  <input type="hidden" name="nc" value={id} />
                  <Campo rotulo="O que foi feito para corrigir"><textarea name="acao" required minLength={5} rows={3} className="entrada" /></Campo>
                  <p className="text-xs text-concreto-500">Envie antes a foto da correção (ao lado).</p>
                  <Botao grande variante="sucesso">Informar correção concluída</Botao>
                </FormAcao>
              </div>
            </Cartao>
          )}
          {gere && n.status === 'corrigida' && (
            <Cartao titulo="Verificação do engenheiro">
              <FormAcao acao={verificarNC} className="space-y-2">
                <input type="hidden" name="nc" value={id} />
                <Campo rotulo="Parecer (obrigatório para reabrir)"><textarea name="parecer" rows={2} className="entrada" /></Campo>
                <div className="flex flex-wrap gap-2">
                  <Botao variante="sucesso" name="decisao" value="aceitar">Aceitar e encerrar</Botao>
                  <Botao variante="perigo" name="decisao" value="reabrir">Reabrir</Botao>
                </div>
              </FormAcao>
            </Cartao>
          )}
          <Cartao titulo="Histórico">
            <ol className="space-y-3 border-l-2 border-concreto-200 pl-4 text-sm">
              {eventos?.map((e) => (
                <li key={e.id}>
                  <div className="flex flex-wrap items-center gap-2"><b>{(e.perfis as unknown as { nome: string })?.nome}</b>{e.status_novo && <SeloNC s={e.status_novo} />}</div>
                  <p className="text-concreto-700">{e.descricao}</p>
                  <div className="text-xs text-concreto-500">{dataHora(e.criado_em)}</div>
                </li>))}
            </ol>
          </Cartao>
          {gere && !['verificada', 'cancelada'].includes(n.status) && (
            <details className="rounded-lg border border-concreto-200 bg-white text-sm">
              <summary className="cursor-pointer px-4 py-3 text-atraso-700">Cancelar registro</summary>
              <FormAcao acao={cancelarNC} className="space-y-2 border-t border-concreto-100 p-4">
                <input type="hidden" name="nc" value={id} />
                <input name="motivo" required minLength={5} placeholder="Motivo (ex.: registrada em duplicidade)" className="entrada" />
                <Botao variante="perigo">Cancelar não conformidade</Botao>
              </FormAcao>
            </details>)}
        </div>
      </div>
    </div>
  );
}
