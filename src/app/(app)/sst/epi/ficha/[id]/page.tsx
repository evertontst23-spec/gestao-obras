import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { AbasSST } from '@/components/AbasSST';
import { AssinarItemEPI } from '@/components/AssinarItemEPI';
import { data, dataHora } from '@/lib/formato';

export const metadata = { title: 'Ficha de EPI' };
const MOTIVO: Record<string, string> = { admissao: 'Admissão', periodica: 'Troca periódica', desgaste: 'Desgaste', dano: 'Dano', perda: 'Perda', substituicao: 'Substituição', visitante: 'Visitante' };

type Linha = {
  chave: string; data: string; qtd: number; unidade: string; epi: string; ca: string; motivo: string; troca: string | null;
  assinada?: { tipo: string; img?: string; dist?: number; em: string; numero: number; hash: string; por?: string };
  pendente?: { id: string; insumo: string };
};

export default async function FichaEPI({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: basico } = await supabase.rpc('funcionario_basico', { p_func: id }).maybeSingle();
  const b = basico as { nome: string | null; matricula: string | null; obra_id: string | null } | null;
  if (!b?.nome) notFound();
  const [{ data: entregas }, { data: obra }, { data: f }, { data: pend }] = await Promise.all([
    supabase.from('epi_entregas').select('*, epi_entrega_itens(*, insumos(codigo, descricao, unidade)), perfis(nome)').eq('funcionario_id', id).is('anulada_em', null).order('data').order('criado_em'),
    b.obra_id ? supabase.from('obras').select('codigo, nome, cliente').eq('id', b.obra_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('v_funcionarios').select('cpf, funcao_nome, data_admissao, biometria_cadastrada, empregador_id, empregador_nome').eq('id', id).maybeSingle(),
    supabase.from('epi_pendentes').select('*').eq('funcionario_id', id).is('entrega_id', null).order('data'),
  ]);
  const { data: emp } = f?.empregador_id ? await supabase.from('empregadores').select('nome, razao_social, cnpj').eq('id', f.empregador_id).maybeSingle() : { data: null };
  const insIds = [...new Set((pend ?? []).flatMap((p) => (p.itens as { insumo_id: string }[]).map((i) => i.insumo_id)))];
  const { data: insP } = insIds.length ? await supabase.from('insumos').select('id, descricao, unidade, ca, vida_util_dias').in('id', insIds) : { data: [] };
  const insMap = new Map((insP ?? []).map((i) => [i.id, i]));
  const caminhos = (entregas ?? []).map((e) => e.assinatura_caminho).filter(Boolean) as string[];
  const { data: urls } = caminhos.length ? await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600) : { data: [] };
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  const podeCadastrarRosto = ['admin', 'rh', 'seguranca'].includes(perfil.papel);
  const podeAssinar = ['admin', 'seguranca', 'almoxarifado', 'encarregado', 'engenheiro'].includes(perfil.papel);

  const linhas: Linha[] = [];
  (entregas ?? []).forEach((e) => (e.epi_entrega_itens as unknown as { insumo_id: string; quantidade: number; ca: string; proxima_troca: string | null; insumos: { descricao: string; unidade: string } }[]).forEach((i) => linhas.push({
    chave: e.id + i.insumo_id, data: e.data, qtd: Number(i.quantidade), unidade: i.insumos.unidade, epi: i.insumos.descricao, ca: i.ca, motivo: e.motivo, troca: i.proxima_troca,
    assinada: { tipo: e.confirmacao, img: e.assinatura_caminho ? (url.get(e.assinatura_caminho) ?? undefined) : undefined, dist: Number(e.distancia_facial), em: e.criado_em, numero: e.numero, hash: e.hash, por: (e.perfis as unknown as { nome: string })?.nome },
  })));
  (pend ?? []).forEach((p) => (p.itens as { insumo_id: string; quantidade?: number }[]).forEach((i) => {
    if ((p.confirmados as Record<string, string>)?.[i.insumo_id]) return;
    const x = insMap.get(i.insumo_id);
    linhas.push({ chave: p.id + i.insumo_id, data: p.data, qtd: Number(i.quantidade ?? 1), unidade: x?.unidade ?? '', epi: x?.descricao ?? '—', ca: x?.ca ?? '—', motivo: p.motivo,
      troca: null, pendente: { id: p.id, insumo: i.insumo_id } });
  }));
  linhas.sort((a, z) => a.data.localeCompare(z.data));
  const faltam = linhas.filter((l) => l.pendente).length;
  const cel = 'border border-concreto-400 px-2 py-1';

  return (
    <>
      <AbasSST atual="fichas" />
      <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/sst/epi/fichas" className="link text-sm">← Fichas de EPI</Link>
        <div className="flex gap-2">
          <Link href={`/sst/epi/nova?func=${id}`} className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">+ Entregar EPI</Link>
          <BotaoImprimir rotulo="🖨 Imprimir ficha" />
        </div>
      </div>
      {faltam > 0 && <p className="nao-imprimir mx-auto mb-3 max-w-5xl rounded-md bg-atencao-50 px-4 py-2 text-sm font-semibold text-atencao-800">⚠ {faltam} EPI(s) aguardando a assinatura do funcionário. Clique em “Assinar” em cada linha.</p>}
      <article className="mx-auto max-w-5xl rounded-lg border border-concreto-200 bg-white p-6 text-sm print:max-w-none print:border-0 print:p-0">
        <header className="mb-3 grid grid-cols-[1fr_auto] items-end gap-4 border-b-2 border-concreto-800 pb-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-700">NR-06 — Equipamento de Proteção Individual</div>
            <h1 className="text-xl font-black">FICHA DE CONTROLE DE ENTREGA DE EPI</h1>
          </div>
          <div className="text-right text-xs">
            <div className="font-bold">{emp?.razao_social || emp?.nome || f?.empregador_nome || 'Empresa'}</div>
            {emp?.cnpj && <div>CNPJ {emp.cnpj}</div>}
          </div>
        </header>
        <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <div className="col-span-2"><dt className="text-[11px] uppercase text-concreto-500">Funcionário</dt><dd className="font-semibold">{b.nome}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">Matrícula</dt><dd>{b.matricula}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">CPF</dt><dd>{f?.cpf ?? '—'}</dd></div>
          <div className="col-span-2"><dt className="text-[11px] uppercase text-concreto-500">Função</dt><dd>{f?.funcao_nome ?? '—'}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">Admissão</dt><dd>{data(f?.data_admissao)}</dd></div>
          <div><dt className="text-[11px] uppercase text-concreto-500">Obra / setor</dt><dd>{obra ? `${obra.codigo} — ${obra.nome}` : '—'}</dd></div>
        </dl>
        <p className="mb-3 rounded border border-concreto-300 bg-concreto-50 p-3 text-[11px] leading-relaxed">
          <b>Termo de responsabilidade.</b> Declaro ter recebido gratuitamente da empresa os Equipamentos de Proteção Individual abaixo relacionados, em perfeito estado
          de conservação, e ter sido orientado e treinado sobre o uso adequado, a guarda e a conservação. Comprometo-me a: usá-los apenas para a finalidade a que se
          destinam; responsabilizar-me pela guarda e conservação; comunicar ao empregador qualquer alteração que os torne impróprios para uso; e cumprir as
          determinações do empregador sobre o uso adequado (NR-06). Estou ciente de que a recusa injustificada ao uso do EPI constitui ato faltoso
          (CLT, art. 158, parágrafo único). Cada EPI recebido é confirmado por mim, individualmente, na coluna “Assinatura do empregado”.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-concreto-100">{['Data da entrega', 'Qtd.', 'EPI', 'Nº do CA', 'Motivo', 'Troca / devolução', 'Assinatura do empregado'].map((h) => <th key={h} className={`${cel} text-left`}>{h}</th>)}</tr></thead>
            <tbody>{linhas.map((l) => (
              <tr key={l.chave} className={l.pendente ? 'bg-atencao-50/60 print:bg-white' : ''}>
                <td className={`${cel} whitespace-nowrap`}>{data(l.data)}</td>
                <td className={`${cel} whitespace-nowrap`}>{l.qtd} {l.unidade}</td>
                <td className={cel}>{l.epi}</td>
                <td className={`${cel} font-mono`}>{l.ca}</td>
                <td className={cel}>{MOTIVO[l.motivo] ?? l.motivo}</td>
                <td className={`${cel} whitespace-nowrap`}>{l.troca ? `troca até ${data(l.troca)}` : ''}</td>
                <td className={`${cel} min-w-[160px] align-middle`}>
                  {l.assinada ? (<>
                    {l.assinada.tipo === 'assinatura' && l.assinada.img
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={l.assinada.img} alt="Assinatura" className="h-10" />
                      : <span>🙂 Reconhecimento facial ({Math.round((1 - l.assinada.dist!) * 100)}%)</span>}
                    <div className="text-[9px] text-concreto-500">assinado em {dataHora(l.assinada.em)}</div>
                    <div className="font-mono text-[9px] text-concreto-400">#{l.assinada.numero} {l.assinada.hash.slice(0, 12)}</div>
                  </>) : l.pendente && podeAssinar ? (
                    <AssinarItemEPI pendente={l.pendente.id} insumo={l.pendente.insumo} epi={`${l.qtd} ${l.unidade} — ${l.epi} (CA ${l.ca})`} funcionario={id} nome={b.nome!}
                      temRosto={!!f?.biometria_cadastrada} podeCadastrarRosto={podeCadastrarRosto} />
                  ) : <span className="text-atencao-800">aguardando assinatura</span>}
                </td>
              </tr>))}
              {!linhas.length && <tr><td colSpan={7} className={`${cel} py-4 text-center text-concreto-500`}>Nenhum EPI entregue.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-8 hidden grid-cols-2 gap-10 text-center text-[11px] print:grid">
          <div className="border-t border-concreto-800 pt-1">Responsável pela entrega (SESMT / empresa)</div>
          <div className="border-t border-concreto-800 pt-1">Local e data</div>
        </div>
        <p className="mt-4 text-[10px] text-concreto-500">Registro de fornecimento em sistema eletrônico, admitido pela NR-06 (inclusive por biometria): cada linha tem data, CA, confirmação individual do empregado (assinatura ou biometria facial), data/hora do servidor e código de integridade (SHA-256). Os registros não podem ser alterados ou excluídos.</p>
      </article>
    </>
  );
}
