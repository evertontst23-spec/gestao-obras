import Link from 'next/link';
import { obterSessao, gestor } from '@/lib/sessao';
import { Cabecalho, LinkBotao, Progresso, Selo, Vazio } from '@/components/ui';
import { SITUACOES_OBRA } from '@/lib/dominio';
import { data } from '@/lib/formato';

export const metadata = { title: 'Obras' };

export default async function Obras() {
  const { supabase, perfil } = await obterSessao();
  const { data: obras } = await supabase.from('v_obras').select('*').order('situacao').order('nome');
  return (
    <>
      <Cabecalho titulo="Obras" sub={`${obras?.length ?? 0} obra(s) com acesso`}
        acoes={gestor(perfil.papel) && <LinkBotao href="/obras/nova">+ Nova obra</LinkBotao>} />
      {!obras?.length ? <Vazio>Nenhuma obra cadastrada ou vinculada a você.</Vazio> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {obras.map((o) => (
            <Link key={o.id} href={`/obras/${o.id}`} className="block rounded-lg border border-concreto-200 bg-white p-4 transition hover:border-sinal-400">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-concreto-500">{o.codigo}</div>
                  <div className="truncate font-bold">{o.nome}</div>
                  <div className="truncate text-xs text-concreto-500">{o.cliente ?? '—'} • {o.engenheiro_nome ?? 'sem engenheiro'}</div>
                </div>
                <Selo cor="bg-concreto-100 text-concreto-700">{SITUACOES_OBRA[o.situacao]}</Selo>
              </div>
              <div className="mt-3"><Progresso valor={o.avanco_fisico} /></div>
              <div className="mt-2 flex justify-between text-xs text-concreto-500">
                <span>{o.total_tarefas} tarefas • {o.tarefas_aprovadas} aprovadas</span>
                {o.tarefas_atrasadas > 0 ? <span className="font-bold text-atraso-700">{o.tarefas_atrasadas} atrasada(s)</span> : <span>até {data(o.data_prevista_conclusao)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
