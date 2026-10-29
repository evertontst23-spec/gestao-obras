import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { AbasSST } from '@/components/AbasSST';
import { data, dataHora } from '@/lib/formato';
import { ConfirmarPendenteEPI } from '@/components/ConfirmarPendenteEPI';

export const metadata = { title: 'Ficha de EPI' };
const MOTIVO: Record<string, string> = { admissao: 'Admissão', periodica: 'Troca periódica', desgaste: 'Desgaste', dano: 'Dano', perda: 'Perda', substituicao: 'Substituição', visitante: 'Visitante' };

export default async function FichaEPI({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: basico } = await supabase.rpc('funcionario_basico', { p_func: id }).maybeSingle();
  const b = basico as { nome: string | null; matricula: string | null; obra_id: string | null } | null;
  if (!b?.nome) notFound();
  const [{ data: entregas }, { data: obra }, { data: f }] = await Promise.all([
    supabase.from('epi_entregas').select('*, epi_entrega_itens(*, insumos(codigo, descricao, unidade)), perfis(nome)').eq('funcionario_id', id).order('criado_em'),
    b.obra_id ? supabase.from('obras').select('codigo, nome, cliente').eq('id', b.obra_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('v_funcionarios').select('cpf, funcao_nome, data_admissao, biometria_cadastrada').eq('id', id).maybeSingle(),
  ]);
  const { data: pend } = await supabase.from('epi_pendentes').select('*').eq('funcionario_id', id).is('entrega_id', null).order('data');
  const insIds = [...new Set((pend ?? []).flatMap((p) => (p.itens as { insumo_id: string }[]).map((i) => i.insumo_id)))];
  const { data: insP } = insIds.length ? await supabase.from('insumos').select('id, descricao, unidade, ca').in('id', insIds) : { data: [] };
  const insMap = new Map((insP ?? []).map((i) => [i.id, i]));
  const podeCadastrarRosto = ['admin', 'rh', 'seguranca'].includes(perfil.papel);
  const caminhos = (entregas ?? []).map((e) => e.assinatura_caminho).filter(Boolean) as string[];
  const { data: urls } = caminhos.length ? await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600) : { data: [] };
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));

  return (
    <>
      <AbasSST atual="epi" />
      <div className="nao-imprimir mb-4 flex justify-end"><BotaoImprimir rotulo="🖨 Imprimir ficha" /></div>
      <article className="mx-auto max-w-4xl rounded-lg border border-concreto-200 bg-white p-6 text-sm print:border-0 print:p-0">
        <header className="mb-4 border-b-2 border-concreto-800 pb-3 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-700">NR-06 — Equipamento de Proteção Individual</div>
          <h1 className="text-xl font-black">FICHA DE CONTROLE DE ENTREGA DE EPI</h1>
        </header>
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <div className="col-span-2"><dt className="text-[11px] uppercase text-concreto-500">Funcionário</dt><dd className="font-semibold">{b.nome}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">Matrícula</dt><dd>{b.matricula}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">CPF</dt><dd>{f?.cpf ?? '—'}</dd></div>
          <div className="col-span-2"><dt className="text-[11px] uppercase text-concreto-500">Função</dt><dd>{f?.funcao_nome ?? '—'}</dd></div>
          <div className="col-span-2"><dt className="text-[11px] uppercase text-concreto-500">Obra</dt><dd>{obra ? `${obra.codigo} — ${obra.nome}` : '—'}</dd></div>
        </dl>
        <p className="mb-4 rounded bg-concreto-50 p-3 text-xs leading-relaxed">
          Declaro ter recebido gratuitamente os EPIs abaixo, em perfeito estado, e ter sido treinado quanto ao uso adequado, guarda e conservação,
          comprometendo-me a usá-los apenas para a finalidade a que se destinam, comunicar qualquer alteração que os torne impróprios e devolvê-los
          quando solicitado (NR-06, item 6.7.1 e art. 158 da CLT).
        </p>
        <table className="w-full border-collapse text-xs">
          <thead><tr className="bg-concreto-100">{['Data', 'EPI', 'CA', 'Qtd.', 'Motivo', 'Próx. troca', 'Confirmação'].map((h) => <th key={h} className="border border-concreto-300 px-2 py-1 text-left">{h}</th>)}</tr></thead>
          <tbody>{(entregas ?? []).flatMap((e) => (e.epi_entrega_itens as unknown as { insumo_id: string; quantidade: number; ca: string; proxima_troca: string | null; insumos: { descricao: string; unidade: string } }[]).map((i, k) => (
            <tr key={e.id + i.insumo_id}>
              <td className="border border-concreto-300 px-2 py-1">{data(e.data)}</td>
              <td className="border border-concreto-300 px-2 py-1">{i.insumos.descricao}</td>
              <td className="border border-concreto-300 px-2 py-1 font-mono">{i.ca}</td>
              <td className="border border-concreto-300 px-2 py-1">{i.quantidade} {i.insumos.unidade}</td>
              <td className="border border-concreto-300 px-2 py-1">{MOTIVO[e.motivo]}</td>
              <td className="border border-concreto-300 px-2 py-1">{data(i.proxima_troca)}</td>
              {k === 0 && <td rowSpan={(e.epi_entrega_itens as unknown[]).length} className="border border-concreto-300 px-2 py-1 align-middle">
                {e.confirmacao === 'assinatura' && e.assinatura_caminho && url.get(e.assinatura_caminho)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={url.get(e.assinatura_caminho)!} alt="Assinatura" className="h-10" />
                  : <span>🙂 Facial ({Math.round((1 - Number(e.distancia_facial)) * 100)}%)</span>}
                <div className="font-mono text-[9px] text-concreto-500">#{e.numero} {e.hash.slice(0, 16)}</div>
                <div className="text-[9px] text-concreto-500">{dataHora(e.criado_em)} • {(e.perfis as unknown as { nome: string })?.nome}</div>
              </td>}
            </tr>)))}</tbody>
        </table>
        {!entregas?.length && !pend?.length && <p className="mt-4 text-center text-concreto-500">Nenhuma entrega registrada.</p>}
        {(pend ?? []).map((p) => (
          <section key={p.id} className="mt-5 rounded-md border-2 border-atencao-500 bg-atencao-50 p-4 print:border print:bg-white">
            <div className="mb-2 font-bold text-atencao-800">⚠ Entrega de {data(p.data)} — aguardando a assinatura do funcionário</div>
            <ul className="mb-3 text-xs">{(p.itens as { insumo_id: string; quantidade: number }[]).map((i) => { const x = insMap.get(i.insumo_id);
              return <li key={i.insumo_id}>{i.quantidade ?? 1} {x?.unidade} — {x?.descricao} <span className="font-mono text-concreto-500">CA {x?.ca}</span></li>; })}</ul>
            {p.observacoes && <p className="mb-3 text-xs text-concreto-600">{p.observacoes}</p>}
            <div className="nao-imprimir"><ConfirmarPendenteEPI pendente={p.id} funcionario={id} nome={b.nome!} temRosto={!!(f as { biometria_cadastrada?: boolean } | null)?.biometria_cadastrada} podeCadastrarRosto={podeCadastrarRosto} /></div>
          </section>))}
        <p className="mt-4 text-[10px] text-concreto-500">Registros eletrônicos com data/hora do servidor e código de integridade (SHA-256); não podem ser alterados ou excluídos.</p>
      </article>
    </>
  );
}
