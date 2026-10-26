/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirPapel } from '@/lib/sessao';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { reais } from '@/lib/dominio';
import { data, dataHora, hojeISO } from '@/lib/formato';
import { CAT_PAG } from '@/app/(app)/dp/pagamentos/comum';
import { UploadArquivo } from '@/components/UploadArquivo';
import { registrarDocumento, salvarFotoFuncionario } from '../../../acoes';
import { PASTAS, docsDoSlot, resumoDossie, slotPreenchido, type Doc } from '@/lib/dossie';

export const metadata = { title: 'Dossiê do funcionário' };
const VINCULO: Record<string, string> = { clt: 'CLT (próprio)', terceirizado: 'Terceirizado', clt_parceira: 'CLT de empresa parceira', autonomo: 'Autônomo / diarista' };
const ATEST: Record<string, string> = { medico: 'Atestado médico', declaracao_horas: 'Declaração de horas', odontologico: 'Atestado odontológico', acompanhante: 'Acompanhante' };

function Item({ r, children, largo }: { r: string; children: React.ReactNode; largo?: boolean }) {
  return <div className={largo ? 'col-span-2' : ''}><dt className="text-[10px] uppercase tracking-wide text-concreto-500">{r}</dt><dd className="font-medium">{children || '—'}</dd></div>;
}
function Secao({ t, children }: { t: string; children: React.ReactNode }) {
  return <section className="mt-5"><h2 className="mb-2 border-b border-concreto-800 pb-1 text-xs font-black uppercase tracking-[0.15em]">{t}</h2>{children}</section>;
}
const th = 'border border-concreto-300 bg-concreto-100 px-2 py-1 text-left';
const td = 'border border-concreto-300 px-2 py-1 align-top';

/** Dossiê completo do funcionário, pronto para imprimir ou salvar em PDF */
export default async function Dossie({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'seguranca', 'financeiro', 'engenheiro');
  const podeDoc = ['admin', 'rh', 'seguranca'].includes(perfil.papel);
  const { data: f } = await supabase.from('v_funcionarios').select('*').eq('id', id).maybeSingle();
  if (!f) notFound();
  const [{ data: extra }, { data: docs }, { data: epis }, { data: oss }, { data: atests }, { data: pags }, { data: consent }] = await Promise.all([
    supabase.from('funcionarios').select('foto_caminho').eq('id', id).maybeSingle(),
    supabase.from('funcionario_documentos').select('*').eq('funcionario_id', id).order('substituido').order('tipo'),
    supabase.from('epi_entregas').select('id, numero, data, motivo, confirmacao, epi_entrega_itens(quantidade, ca, insumos(descricao, unidade))').eq('funcionario_id', id).order('data'),
    supabase.from('ordens_servico').select('id, numero, data, funcao_nome, ciencia_em, substituida').eq('funcionario_id', id).order('data'),
    supabase.from('atestados').select('id, tipo, data_inicio, dias, horas, profissional').eq('funcionario_id', id).order('data_inicio'),
    supabase.from('pagamento_itens').select('id, categoria, descricao, valor, pagamentos!inner(data_pagamento, titulo, status)').eq('funcionario_id', id).eq('removido', false).neq('pagamentos.status', 'cancelado'),
    supabase.from('biometria_consentimentos').select('aceito, criado_em').eq('funcionario_id', id).order('criado_em'),
  ]);
  const caminhos = [extra?.foto_caminho, ...(docs ?? []).map((d) => d.caminho)].filter(Boolean) as string[];
  const { data: urls } = caminhos.length ? await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600) : { data: [] };
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl ?? undefined]));
  const foto = extra?.foto_caminho ? url.get(extra.foto_caminho) : undefined;
  const hoje = hojeISO();
  const lista = (docs ?? []) as Doc[];
  const osAtual = (oss ?? []).filter((o) => !o.substituida).slice(-1)[0];
  const x = { foto: !!extra?.foto_caminho, epi: (epis ?? []).length, os: !!osAtual, biometria: !!f.biometria_cadastrada };
  const resumo = resumoDossie(lista, x, !f.ativo, hoje);
  const emTrinta = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  type Pag = { id: number; categoria: string; descricao: string; valor: number; pagamentos: { data_pagamento: string; titulo: string; status: string } };
  const pagamentos = ((pags ?? []) as unknown as Pag[]).sort((a, b) => a.pagamentos.data_pagamento.localeCompare(b.pagamentos.data_pagamento));

  return (
    <>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/cadastros/funcionarios/${id}`} className="link text-sm">← Voltar à ficha</Link>
        <BotaoImprimir rotulo="🖨 Imprimir / salvar PDF" />
      </div>
      <article className="mx-auto max-w-5xl rounded-lg border border-concreto-200 bg-white p-6 text-sm print:border-0 print:p-0">
        <div className="flex items-start gap-4 border-b-2 border-concreto-800 pb-3">
          {foto ? <img src={foto} alt="" className="h-28 w-28 rounded-md border border-concreto-300 object-cover" />
            : <div className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-concreto-300 text-[11px] text-concreto-400">sem foto</div>}
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sinal-700">CAD Engenharia e Segurança do Trabalho — Dossiê do funcionário</div>
            <h1 className="text-2xl font-black leading-tight">{f.nome}</h1>
            <div className="text-concreto-600">Matrícula {f.matricula} • {f.funcao_nome ?? 'função a definir'} • {f.obra_codigo ? `${f.obra_codigo} — ${f.obra_nome}` : 'Escritório'}</div>
            <div className="mt-1 text-xs">{f.ativo ? 'Ativo' : `Desligado em ${data(f.data_demissao)}${f.motivo_demissao ? ` — ${f.motivo_demissao}` : ''}`} • emitido em {dataHora(new Date().toISOString())}</div>
          </div>
        </div>

        <Secao t={`Pasta de documentos — ${resumo.ok} de ${resumo.total} obrigatórios`}>
          {resumo.faltam.length > 0 && <p className="mb-3 rounded bg-atencao-50 px-3 py-2 text-xs text-atencao-800">Faltam: {resumo.faltam.map((s) => s.rotulo).join(', ')}</p>}
          {resumo.vencidos.length > 0 && <p className="mb-3 rounded bg-atraso-50 px-3 py-2 text-xs text-atraso-700">Vencidos: {resumo.vencidos.map((d) => `${d.tipo} (${data(d.validade)})`).join(', ')}</p>}
          <div className="space-y-5">
            {PASTAS.filter((pa) => pa.id !== 'desligamento' || !f.ativo).map((pa) => (
              <div key={pa.id} className="break-inside-avoid">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><span aria-hidden>📁</span>{pa.titulo}
                  <span className="text-xs font-normal text-concreto-500">{pa.slots.filter((s) => slotPreenchido(s, lista, x)).length}/{pa.slots.length}</span></h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {pa.slots.map((s) => {
                    const ds = docsDoSlot(s, lista);
                    const cheio = slotPreenchido(s, lista, x);
                    const venc = ds.find((d) => d.validade && d.validade < hoje);
                    const breve = !venc && ds.find((d) => d.validade && d.validade <= emTrinta);
                    const img = s.sistema === 'foto' && foto ? foto : ds.map((d) => d.caminho && d.tipo_mime?.startsWith('image/') ? url.get(d.caminho) : undefined).find(Boolean);
                    const link = s.sistema === 'epi' && !ds.length ? `/sst/epi/ficha/${id}` : s.sistema === 'os' ? (osAtual ? `/sst/os/${osAtual.id}` : `/sst/os/nova?func=${id}`)
                      : ds[0]?.caminho ? url.get(ds[0].caminho) : undefined;
                    return (
                      <div key={s.tipo} className={`flex min-w-0 flex-col overflow-hidden rounded-md border text-xs ${venc ? 'border-atraso-500' : cheio ? 'border-concreto-300' : s.obrigatorio ? 'border-dashed border-atencao-500' : 'border-dashed border-concreto-300'}`}>
                        <a href={link} target={link?.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                          className={`flex h-28 items-center justify-center overflow-hidden ${cheio ? 'bg-concreto-50' : 'bg-white'} ${link ? 'hover:opacity-90' : 'pointer-events-none'}`}>
                          {img ? <img src={img} alt={s.rotulo} className="h-full w-full object-cover" />
                            : cheio ? <span className="text-3xl" aria-hidden>{s.sistema === 'epi' ? '🦺' : s.sistema === 'os' ? '📋' : s.sistema === 'biometria' ? '🙂' : '📄'}</span>
                            : <span className="px-2 text-center text-[11px] text-concreto-400">{s.obrigatorio ? 'falta' : 'vazio'}</span>}
                        </a>
                        <div className="flex flex-1 flex-col gap-1 p-2">
                          <div className="font-semibold leading-tight">{s.rotulo}{s.obrigatorio && <span className="text-atraso-700"> *</span>}</div>
                          <div className="text-[11px] text-concreto-500">
                            {s.sistema === 'epi' && x.epi > 0 ? `${x.epi} entrega(s) no sistema` : s.sistema === 'os' ? (osAtual ? `OS-${String(osAtual.numero).padStart(4, '0')}${osAtual.ciencia_em ? ' assinada' : ' sem ciência'}` : 'não emitida')
                              : s.sistema === 'biometria' ? (x.biometria ? 'consentimento registrado' : 'sem consentimento')
                              : s.sistema === 'foto' && x.foto && !ds.length ? 'da biometria / ficha'
                              : ds.length ? `${ds.length > 1 ? `${ds.length} arquivos • ` : ''}${ds[0].validade ? `validade ${data(ds[0].validade)}` : `anexado ${data(ds[0].criado_em.slice(0, 10))}`}` : '—'}
                          </div>
                          {venc && <span className="w-fit rounded bg-atraso-50 px-1.5 font-semibold text-atraso-700">vencido</span>}
                          {breve && <span className="w-fit rounded bg-atencao-50 px-1.5 font-semibold text-atencao-700">vence em breve</span>}
                          {ds.length > 1 && <div className="nao-imprimir flex flex-wrap gap-1">{ds.map((d, k) => d.caminho && <a key={d.id} className="link" href={url.get(d.caminho)} target="_blank" rel="noreferrer">arq. {k + 1}</a>)}</div>}
                          {podeDoc && !s.sistema?.match(/^(os|biometria)$/) && (
                            <details className="nao-imprimir mt-auto">
                              <summary className="cursor-pointer font-semibold text-sinal-700">{s.varios ? '+ anexar' : cheio ? 'substituir' : '+ anexar'}</summary>
                              <div className="mt-2">
                                {s.sistema === 'foto' ? (
                                  <UploadArquivo pasta={`rh/${id}`} acao={salvarFotoFuncionario} rotuloBotao="Salvar foto" accept="image/*">
                                    <input type="hidden" name="funcionario_id" value={id} />
                                  </UploadArquivo>
                                ) : (
                                  <UploadArquivo pasta={`rh/${id}`} acao={registrarDocumento} rotuloBotao="Guardar na pasta">
                                    <input type="hidden" name="funcionario_id" value={id} /><input type="hidden" name="tipo" value={s.tipo} />
                                    {s.varios && <input name="descricao" className="entrada" placeholder="Descrição (opcional)" />}
                                    {s.validade && <div className="grid grid-cols-2 gap-1">
                                      <label className="text-[10px] text-concreto-500">Emissão<input type="date" name="emissao" className="entrada" /></label>
                                      <label className="text-[10px] text-concreto-500">Validade<input type="date" name="validade" className="entrada" /></label></div>}
                                  </UploadArquivo>)}
                              </div>
                            </details>)}
                        </div>
                      </div>);
                  })}
                </div>
              </div>))}
          </div>
          {lista.some((d) => d.substituido) && (
            <details className="nao-imprimir mt-4 text-xs"><summary className="cursor-pointer text-concreto-600">Versões substituídas ({lista.filter((d) => d.substituido).length}) — guardadas como histórico</summary>
              <ul className="mt-2 space-y-1">{lista.filter((d) => d.substituido).map((d) => <li key={d.id}>{d.tipo} — anexado {dataHora(d.criado_em)} {d.caminho && url.get(d.caminho) && <a className="link" href={url.get(d.caminho)} target="_blank" rel="noreferrer">abrir</a>}</li>)}</ul>
            </details>)}
        </Secao>

        <Secao t="Dados pessoais">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Item r="CPF">{f.cpf}</Item><Item r="RG">{f.rg}</Item><Item r="Nascimento">{data(f.data_nascimento)}</Item><Item r="Telefone">{f.telefone}</Item>
            <Item r="Endereço" largo>{f.endereco}</Item><Item r="Banco / agência / conta">{[f.banco, f.agencia, f.conta].filter(Boolean).join(' / ')}</Item><Item r="PIX">{f.pix}</Item>
          </dl>
        </Secao>

        <Secao t="Contrato">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Item r="Empresa contratante">{f.empregador_nome}</Item><Item r="Vínculo">{f.vinculo ? VINCULO[f.vinculo] ?? f.vinculo : 'padrão da empresa'}</Item>
            <Item r="Admissão">{data(f.data_admissao)}</Item><Item r="Desligamento">{f.data_demissao ? data(f.data_demissao) : '—'}</Item>
            <Item r="Salário">{f.salario_efetivo !== null ? reais(f.salario_efetivo) : 'definido pela empresa parceira'}</Item><Item r="Jornada">{f.carga_diaria_horas} h/dia</Item>
            <Item r="Alimentação / dia">{reais(f.vale_alimentacao_dia)}</Item><Item r="Passagens">{f.passagem_semanal ? `${reais(f.passagem_semanal)} por semana` : f.passagens_dia ? `${f.passagens_dia} por dia` : '—'}</Item>
            <Item r="EPIs da função" largo>{(f.epis_obrigatorios ?? []).join(', ')}</Item><Item r="Riscos da função" largo>{(f.riscos ?? []).join(', ')}</Item>
          </dl>
          <p className="mt-2 text-xs text-concreto-600">Biometria facial: {f.biometria_cadastrada ? `cadastrada com consentimento (LGPD) em ${dataHora(f.biometria_consentida_em)}` : 'não cadastrada'}
            {(consent ?? []).length > 1 && ` • ${consent!.length} registros de consentimento/revogação`}.</p>
        </Secao>

        <Secao t="Segurança do trabalho">
          <p className="mb-1"><b>Ordens de serviço (NR-01):</b> {(oss ?? []).length ? (oss ?? []).map((o) => `OS-${String(o.numero).padStart(4, '0')} de ${data(o.data)}${o.ciencia_em ? ` (ciência ${data(o.ciencia_em)})` : ' (sem ciência)'}${o.substituida ? ' — substituída' : ''}`).join('; ') : 'nenhuma'}</p>
          <p className="mb-2"><b>Entregas de EPI (NR-06):</b> {(epis ?? []).length || 'nenhuma'}</p>
          {(epis ?? []).length > 0 && (
            <table className="w-full border-collapse text-xs"><thead><tr><th className={th}>Data</th><th className={th}>Itens</th><th className={th}>Confirmação</th></tr></thead>
              <tbody>{epis!.map((e) => (
                <tr key={e.id}><td className={td}>{data(e.data)}</td>
                  <td className={td}>{(e.epi_entrega_itens as unknown as { quantidade: number; ca: string; insumos: { descricao: string; unidade: string } }[]).map((i) => `${i.quantidade} ${i.insumos.unidade} ${i.insumos.descricao} (CA ${i.ca})`).join('; ')}</td>
                  <td className={td}>{e.confirmacao === 'facial' ? 'Facial' : 'Assinatura'}</td></tr>))}</tbody></table>)}
        </Secao>

        <Secao t={`Atestados (${(atests ?? []).length})`}>
          {!(atests ?? []).length ? <p className="text-concreto-500">Nenhum atestado.</p> : (
            <table className="w-full border-collapse text-xs"><thead><tr><th className={th}>Início</th><th className={th}>Tipo</th><th className={th}>Dias / horas</th><th className={th}>Profissional</th></tr></thead>
              <tbody>{atests!.map((a) => <tr key={a.id}><td className={td}>{data(a.data_inicio)}</td><td className={td}>{ATEST[a.tipo] ?? a.tipo}</td><td className={td}>{a.tipo === 'declaracao_horas' ? `${a.horas} h` : `${a.dias} dia(s)`}</td><td className={td}>{a.profissional ?? '—'}</td></tr>)}</tbody></table>)}
        </Secao>

        <Secao t="Pagamentos recebidos">
          {!pagamentos.length ? <p className="text-concreto-500">Nenhum pagamento registrado.</p> : (
            <table className="w-full border-collapse text-xs"><thead><tr><th className={th}>Data</th><th className={th}>Pagamento</th><th className={th}>Item</th><th className={`${th} text-right`}>Valor</th></tr></thead>
              <tbody>{pagamentos.map((p) => (
                <tr key={p.id}><td className={td}>{data(p.pagamentos.data_pagamento)}</td><td className={td}>{p.pagamentos.titulo}{p.pagamentos.status !== 'pago' && ' (a pagar)'}</td>
                  <td className={td}>{CAT_PAG[p.categoria] ?? p.categoria} — {p.descricao}</td><td className={`${td} text-right font-mono`}>{reais(p.valor)}</td></tr>))}
                <tr><td className={td} colSpan={3}><b>Total</b></td><td className={`${td} text-right font-mono font-bold`}>{reais(pagamentos.reduce((s, p) => s + Number(p.valor), 0))}</td></tr></tbody></table>)}
        </Secao>

        <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs">
          <div className="border-t border-concreto-800 pt-1">{f.nome}</div>
          <div className="border-t border-concreto-800 pt-1">CAD Engenharia — RH</div>
        </div>
      </article>
    </>
  );
}
