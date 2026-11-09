import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Indicador, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { contratarEspera, mudarSituacaoEspera, salvarEspera } from '../acoes';
import { data, hojeISO } from '@/lib/formato';

export const metadata = { title: 'Banco de espera' };

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  aguardando: { rotulo: 'Aguardando', cor: 'bg-sky-100 text-sky-800' },
  chamado:    { rotulo: 'Chamado', cor: 'bg-atencao-100 text-atencao-800' },
  contratado: { rotulo: 'Contratado', cor: 'bg-ok-50 text-ok-700' },
  desistiu:   { rotulo: 'Desistiu', cor: 'bg-concreto-200 text-concreto-600' },
  nao_apto:   { rotulo: 'Não apto', cor: 'bg-atraso-50 text-atraso-700' },
};
const FUNCOES = ['Pedreiro', 'Servente / Ajudante', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Vigia', 'Almoxarife', 'Encarregado', 'Motorista', 'Operador de máquina', 'Assistente administrativo'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function CamposCandidato({ c }: { c?: any }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Campo rotulo="Nome completo *" className="sm:col-span-2"><input name="nome" required minLength={5} defaultValue={c?.nome} className="entrada" /></Campo>
      <Campo rotulo="Celular / WhatsApp *"><input name="celular" required inputMode="tel" defaultValue={c?.celular} placeholder="(81) 9 9999-9999" className="entrada" /></Campo>
      <Campo rotulo="Função pretendida"><input name="funcao_pretendida" list="funcoes-espera" defaultValue={c?.funcao_pretendida ?? ''} className="entrada" /></Campo>
      <Campo rotulo="CPF"><input name="cpf" inputMode="numeric" defaultValue={c?.cpf ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Bairro / cidade"><input name="bairro_cidade" defaultValue={c?.bairro_cidade ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Experiência" className="sm:col-span-2"><input name="experiencia" defaultValue={c?.experiencia ?? ''} placeholder="Ex.: 10 anos de alvenaria, já trabalhou na obra X" className="entrada" /></Campo>
      <Campo rotulo="Indicado por"><input name="indicado_por" defaultValue={c?.indicado_por ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Disponível a partir de"><input type="date" name="disponivel_em" defaultValue={c?.disponivel_em ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Observações" className="sm:col-span-2"><textarea name="observacoes" rows={2} defaultValue={c?.observacoes ?? ''} className="entrada" /></Campo>
    </div>
  );
}

const soDigitos = (s: string) => s.replace(/\D/g, '');
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** função do sistema mais parecida com a escolhida na ficha (prefere a versão CLT) */
function funcaoParecida(pretendida: string | null, funcoes: { id: string; nome: string }[]) {
  const p = norm(pretendida ?? '').split(/[\s/]+/)[0];
  if (!p) return '';
  const achadas = funcoes.filter((f) => norm(f.nome).startsWith(p));
  return (achadas.find((f) => norm(f.nome).includes('clt')) ?? achadas[0])?.id ?? '';
}
/** obra do sistema que bate com a escolhida na ficha (pela última palavra: Foice, Califórnia, Garapu) */
function obraParecida(pretendida: string | null, obras: { id: string; nome: string }[]) {
  const ultima = norm(pretendida ?? '').split(/\s+/).pop();
  if (!ultima || ultima.length < 4) return '';
  return obras.find((o) => norm(o.nome).includes(ultima))?.id ?? '';
}
const DOC_ROTULO: Record<string, string> = { rosto: 'Rosto', docFrente: 'RG frente', docVerso: 'RG verso', cpfDoc: 'CPF', ctps: 'CTPS', residencia: 'Comprovante', curriculo: 'Currículo' };
const FICHA_ROTULO: [string, string][] = [['sexo', 'Sexo'], ['raca_cor', 'Cor'], ['estado_civil', 'Estado civil'], ['escolaridade', 'Escolaridade'],
  ['filhos_menores_14', 'Filhos < 14'], ['deficiencia', 'Deficiência'], ['bota', 'Bota'], ['calca', 'Calça'], ['camisa', 'Camisa'],
  ['emerg_nome', 'Emergência'], ['emerg_parentesco', 'Parentesco'], ['emerg_tel', 'Tel. emergência'], ['banco', 'Banco'], ['pix', 'Pix'],
  ['vt', 'Vale-transporte'], ['carteira', 'Já teve carteira em obra']];
const zap = (cel: string) => { const d = soDigitos(cel); return `https://wa.me/${d.length <= 11 ? '55' + d : d}`; };

export default async function BancoEspera({ searchParams }: { searchParams: Promise<{ sit?: string; funcao?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'engenheiro', 'seguranca');
  const podeEditar = ['admin', 'rh', 'engenheiro'].includes(perfil.papel);
  const podeContratar = ['admin', 'rh'].includes(perfil.papel);
  const [{ data: lista }, { data: funcoes }, { data: obras }, { data: empresas }] = await Promise.all([
    supabase.from('espera_candidatos').select('*').order('criado_em'),
    supabase.from('funcoes').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome'),
    supabase.from('empregadores').select('id, nome').order('nome'),
  ]);
  const todos = lista ?? [];
  const sit = sp.sit ?? 'abertos';
  const q = (sp.q ?? '').trim().toLowerCase();
  const fn = (sp.funcao ?? '').trim().toLowerCase();
  const filtrados = todos.filter((c) => (sit === 'abertos' ? ['aguardando', 'chamado'].includes(c.status) : sit === 'todos' || c.status === sit)
    && (!fn || (c.funcao_pretendida ?? '').toLowerCase().includes(fn))
    && (!q || c.nome.toLowerCase().includes(q) || soDigitos(c.celular).includes(soDigitos(q) || '§')));
  const conta = (s: string) => todos.filter((c) => c.status === s).length;
  const porFuncao = new Map<string, number>();
  todos.filter((c) => c.status === 'aguardando').forEach((c) => { const k = c.funcao_pretendida || 'Sem função'; porFuncao.set(k, (porFuncao.get(k) ?? 0) + 1); });
  const caminhosDocs = filtrados.flatMap((c) => Object.values((c.documentos ?? {}) as Record<string, string>));
  const { data: assinadas } = caminhosDocs.length ? await supabase.storage.from('anexos').createSignedUrls(caminhosDocs, 3600) : { data: [] };
  const urlDoc = new Map((assinadas ?? []).map((u) => [u.path, u.signedUrl ?? undefined]));
  const url = (s: string) => `/cadastros/espera?sit=${s}${sp.funcao ? `&funcao=${encodeURIComponent(sp.funcao)}` : ''}`;

  return (
    <>
      <Cabecalho titulo="Banco de espera" sub="Candidatos aguardando vaga — chame pelo WhatsApp e contrate direto daqui" />
      <datalist id="funcoes-espera">{FUNCOES.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador rotulo="Aguardando" valor={conta('aguardando')} href={url('aguardando')} tom={sit === 'aguardando' ? 'sinal' : 'neutro'} />
        <Indicador rotulo="Chamados" valor={conta('chamado')} href={url('chamado')} tom={sit === 'chamado' ? 'sinal' : 'neutro'} />
        <Indicador rotulo="Contratados" valor={conta('contratado')} href={url('contratado')} tom={sit === 'contratado' ? 'sinal' : 'neutro'} />
        <Indicador rotulo="Desistiram / não aptos" valor={conta('desistiu') + conta('nao_apto')} href={url('desistiu')} />
        <Indicador rotulo="Total no banco" valor={todos.length} href={url('todos')} tom={sit === 'todos' ? 'sinal' : 'neutro'} />
      </div>
      {porFuncao.size > 0 && (
        <p className="mb-4 flex flex-wrap gap-2 text-xs">{[...porFuncao].sort((a, b) => b[1] - a[1]).map(([f, n]) => (
          <Link key={f} href={`/cadastros/espera?sit=aguardando&funcao=${encodeURIComponent(f === 'Sem função' ? '' : f)}`} className="rounded-full border border-concreto-300 bg-superficie px-3 py-1 hover:border-sinal-400"><b>{n}</b> {f}</Link>))}</p>)}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="sit" value={sit} />
            <label className="text-xs text-concreto-500">Buscar<input name="q" defaultValue={sp.q ?? ''} placeholder="Nome ou celular" className="entrada w-52" /></label>
            <label className="text-xs text-concreto-500">Função<input name="funcao" list="funcoes-espera" defaultValue={sp.funcao ?? ''} className="entrada w-44" /></label>
            <button className="rounded-md border border-concreto-300 bg-superficie px-3 py-2 text-sm font-semibold">Filtrar</button>
            {(sp.q || sp.funcao) && <Link href={url(sit).replace(/&funcao=[^&]*/, '')} className="px-2 py-2 text-sm text-concreto-500 underline">limpar</Link>}
          </form>
          {!filtrados.length ? <Vazio>Ninguém {sit === 'abertos' ? 'aguardando' : 'nesta situação'}. Cadastre ao lado quem quer entrar na fila.</Vazio> : (
            <div className="space-y-2">{filtrados.map((c, i) => {
              const st = SITUACAO[c.status] ?? SITUACAO.aguardando;
              return (
                <details key={c.id} className="rounded-lg border border-concreto-200 bg-superficie">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="w-6 text-right font-mono text-xs text-concreto-400">{i + 1}</span>
                    {c.documentos?.rosto && urlDoc.get(c.documentos.rosto)
                      ? <img src={urlDoc.get(c.documentos.rosto)} alt="" className="h-10 w-10 rounded-full object-cover" />
                      : null}
                    <span className="min-w-0 flex-1"><b>{c.nome}</b>
                      {c.origem === 'ficha' && <span className="ml-2 rounded-full bg-sinal-100 px-2 py-0.5 text-[11px] font-semibold text-sinal-700">Ficha online</span>}
                      <span className="block text-xs text-concreto-500">{c.funcao_pretendida || 'função não informada'}{c.obra_pretendida ? ` • ${c.obra_pretendida}` : ''}{c.data_inicio ? ` • começou em ${data(c.data_inicio)}` : ''}{c.bairro_cidade ? ` • ${c.bairro_cidade}` : ''} • na fila desde {data(c.criado_em)}</span></span>
                    <a href={zap(c.celular)} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-md bg-ok-500 px-3 py-1.5 text-xs font-semibold text-white">WhatsApp {c.celular}</a>
                    <Selo cor={st.cor}>{st.rotulo}</Selo>
                  </summary>
                  <div className="space-y-4 border-t border-concreto-100 p-4 text-sm">
                    <dl className="grid gap-2 sm:grid-cols-3">
                      {c.cpf && <div><dt className="text-xs text-concreto-500">CPF</dt><dd>{c.cpf}</dd></div>}
                      {c.experiencia && <div className="sm:col-span-2"><dt className="text-xs text-concreto-500">Experiência</dt><dd>{c.experiencia}</dd></div>}
                      {c.indicado_por && <div><dt className="text-xs text-concreto-500">Indicado por</dt><dd>{c.indicado_por}</dd></div>}
                      {c.disponivel_em && <div><dt className="text-xs text-concreto-500">Disponível a partir de</dt><dd>{data(c.disponivel_em)}</dd></div>}
                      {c.contato_em && <div><dt className="text-xs text-concreto-500">Chamado em</dt><dd>{data(c.contato_em)}</dd></div>}
                      {c.protocolo && <div><dt className="text-xs text-concreto-500">Nº da ficha</dt><dd>{c.protocolo}{c.ficha_em ? ` • ${data(c.ficha_em)}` : ''}</dd></div>}
                      {c.obra_pretendida && <div><dt className="text-xs text-concreto-500">Obra escolhida</dt><dd>{c.obra_pretendida}</dd></div>}
                      {c.origem === 'ficha' && <div><dt className="text-xs text-concreto-500">Começou na obra em</dt><dd className="font-semibold">{c.data_inicio ? data(c.data_inicio) : 'não informado (ficha antiga)'}</dd></div>}
                      {FICHA_ROTULO.filter(([k]) => c.ficha?.[k]).map(([k, r]) => (
                        <div key={k}><dt className="text-xs text-concreto-500">{r}</dt><dd>{c.ficha[k]}</dd></div>))}
                      {c.observacoes && <div className="sm:col-span-3"><dt className="text-xs text-concreto-500">Observações</dt><dd className="whitespace-pre-line">{c.observacoes}</dd></div>}
                    </dl>
                    {Object.keys(c.documentos ?? {}).length > 0 && (
                      <div className="flex flex-wrap gap-2">{Object.entries(c.documentos as Record<string, string>).map(([k, cam]) => {
                        const u = urlDoc.get(cam);
                        return (
                          <a key={k} href={u ?? '#'} target="_blank" rel="noreferrer" className="w-24 text-center text-xs text-concreto-600">
                            <span className="mb-1 flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-concreto-200 bg-concreto-50 font-bold">
                              {cam.endsWith('.pdf') || !u ? 'PDF' : <img src={u} alt={DOC_ROTULO[k] ?? k} className="h-full w-full object-cover" />}
                            </span>{DOC_ROTULO[k] ?? k}</a>);
                      })}</div>)}
                    {c.status === 'contratado' && c.funcionario_id && <Link href={`/cadastros/funcionarios/${c.funcionario_id}`} className="link font-semibold">Ver ficha do funcionário →</Link>}
                    {podeEditar && c.status !== 'contratado' && (
                      <FormAcao acao={mudarSituacaoEspera} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <span className="text-xs text-concreto-500">Mudar para:</span>
                        {Object.entries(SITUACAO).filter(([k]) => k !== 'contratado' && k !== c.status).map(([k, v]) => (
                          <Botao key={k} variante="secundario" name="status" value={k}>{v.rotulo}</Botao>))}
                      </FormAcao>)}
                    {podeContratar && c.status !== 'contratado' && (
                      <FormAcao acao={contratarEspera} className="space-y-2 rounded-md border-2 border-ok-500 bg-ok-50 p-3">
                        <input type="hidden" name="id" value={c.id} />
                        <div className="font-bold text-ok-700">Contratar {c.nome.split(' ')[0]}</div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <Campo rotulo="Função"><select name="funcao_id" defaultValue={funcaoParecida(c.funcao_pretendida, funcoes ?? [])} className="entrada"><option value="">—</option>{(funcoes ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>
                          <Campo rotulo="Obra"><select name="obra_id" defaultValue={obraParecida(c.obra_pretendida, obras ?? [])} className="entrada"><option value="">—</option>{(obras ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select></Campo>
                          <Campo rotulo="Empresa"><select name="empregador_id" className="entrada"><option value="">—</option>{(empresas ?? []).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Campo>
                          <Campo rotulo="Admissão"><input type="date" name="data_admissao" defaultValue={c.data_inicio ?? hojeISO()} className="entrada" /></Campo>
                        </div>
                        <Botao variante="sucesso">Contratar e abrir a ficha</Botao>
                        <p className="text-xs text-concreto-600">{c.origem === 'ficha'
                          ? 'Cria o funcionário com nome, celular, CPF, foto, documentos, banco/Pix e o resumo da ficha (tamanhos e contato de emergência).'
                          : 'Cria o funcionário com nome, celular e CPF daqui. Os documentos você anexa na ficha (dossiê).'}</p>
                      </FormAcao>)}
                    {podeEditar && (
                      <details><summary className="cursor-pointer text-xs font-semibold text-sinal-700">✎ Editar dados</summary>
                        <FormAcao acao={salvarEspera} className="mt-2 space-y-3"><CamposCandidato c={c} /><Botao variante="secundario">Salvar</Botao></FormAcao>
                      </details>)}
                  </div>
                </details>);
            })}</div>)}
        </div>
        {podeEditar && (
          <Cartao titulo="Colocar no banco de espera" className="h-fit">
            <FormAcao acao={salvarEspera} limparAoConcluir className="space-y-3">
              <CamposCandidato />
              <Botao>Cadastrar na espera</Botao>
            </FormAcao>
          </Cartao>)}
      </div>
    </>
  );
}
