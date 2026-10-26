/* eslint-disable @next/next/no-img-element */
import { notFound } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Info, Selo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { CamposFuncionario } from '@/components/FormFuncionario';
import { UploadArquivo } from '@/components/UploadArquivo';
import { CadastroBiometria } from '@/components/CadastroBiometria';
import { removerBiometria } from '@/app/(app)/sst/acoes';
import Link from 'next/link';
import { atualizarFuncionario, desligarFuncionario, reativarFuncionario, registrarDocumento, salvarFotoFuncionario } from '../../acoes';
import { reais } from '@/lib/dominio';
import { TIPOS_DOSSIE } from '@/lib/dossie';
import { data, dataHora, hojeISO } from '@/lib/formato';

export default async function DossieFuncionario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obterSessao();
  const { data: f } = await supabase.from('v_funcionarios').select('*').eq('id', id).maybeSingle();
  if (!f) notFound();
  const pode = perfil.papel === 'admin' || perfil.papel === 'rh';
  const podeDoc = pode || perfil.papel === 'seguranca';
  const [{ data: empregadores }, { data: docs }, { data: funcoes }, { data: obras }, { data: epis }, { data: oss }, { data: foto }] = await Promise.all([
    supabase.from('empregadores').select('id, nome').order('nome'),
    supabase.from('funcionario_documentos').select('*').eq('funcionario_id', id).order('substituido').order('criado_em', { ascending: false }),
    supabase.from('funcoes').select('*').order('nome'),
    supabase.from('obras').select('id, codigo, nome').order('nome'),
    supabase.from('epi_entregas').select('id, data').eq('funcionario_id', id).order('data', { ascending: false }),
    supabase.from('ordens_servico').select('id, numero, data, ciencia_em').eq('funcionario_id', id).eq('substituida', false),
    supabase.from('funcionarios').select('foto_caminho').eq('id', id).maybeSingle(),
  ]);
  const ativos = (docs ?? []).filter((d) => !d.substituido);
  const caminhos = [...(docs ?? []).map((d) => d.caminho), foto?.foto_caminho].filter(Boolean) as string[];
  const { data: urls } = caminhos.length ? await supabase.storage.from('anexos').createSignedUrls(caminhos, 3600) : { data: [] };
  const url = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  const fotoUrl = foto?.foto_caminho ? url.get(foto.foto_caminho) : undefined;
  const hoje = hojeISO();
  const tiposPresentes = new Set(ativos.map((d) => d.tipo));
  const faltando = ['ASO', 'Contrato de trabalho', 'NR-06 (EPI)', 'NR-18'].filter((t) => !tiposPresentes.has(t));

  return (
    <>
      <Cabecalho titulo={f.nome}
        acoes={<Link href={`/cadastros/funcionarios/${id}/dossie`} className="inline-flex items-center rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold hover:border-sinal-400">📁 Abrir pasta (dossiê)</Link>}
        sub={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">Matrícula {f.matricula}</span> • {f.funcao_nome ?? 'função a definir'} • {f.empregador_nome ?? 'sem empresa'} • {f.obra_codigo ?? 'Escritório'}
          {f.ativo ? <Selo cor="bg-ok-50 text-ok-700">Ativo</Selo> : <Selo cor="bg-concreto-200 text-concreto-700">Desligado em {data(f.data_demissao)}</Selo>}</span>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {f.pendencias && <p className="rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">⚠ Completar cadastro: <b>{f.pendencias}</b>. Corrija nos dados abaixo e apague o campo “Dados a confirmar”.</p>}
          <Cartao titulo="Dados cadastrais">
            <FormAcao acao={atualizarFuncionario}>
              <CamposFuncionario f={f} funcoes={funcoes ?? []} obras={obras ?? []} empregadores={empregadores ?? []} rotulo="Salvar alterações" editavel={pode && f.ativo} />
            </FormAcao>
          </Cartao>

          <Cartao titulo={`Dossiê — documentos (${ativos.length})`}>
            {faltando.length > 0 && <p className="mb-3 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-700">Faltam no dossiê: {faltando.join(', ')}</p>}
            {!docs?.length ? <p className="text-sm text-concreto-500">Nenhum documento anexado.</p> : (
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Documento</th><th>Emissão</th><th>Validade</th><th>Enviado</th><th></th></tr></thead>
                <tbody>{docs.map((d) => {
                  const venc = d.validade && d.validade < hoje, breve = d.validade && !venc && d.validade <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
                  return (
                    <tr key={d.id} className={d.substituido ? 'opacity-50' : ''}>
                      <td><b>{d.tipo}</b>{d.descricao && <div className="text-xs text-concreto-500">{d.descricao}</div>}{d.substituido && <div className="text-[11px]">substituído (histórico)</div>}</td>
                      <td className="whitespace-nowrap">{data(d.emissao)}</td>
                      <td className="whitespace-nowrap">{d.validade ? <Selo cor={venc ? 'bg-atraso-50 text-atraso-700' : breve ? 'bg-atencao-50 text-atencao-700' : 'bg-ok-50 text-ok-700'}>{data(d.validade)}{venc ? ' • vencido' : ''}</Selo> : '—'}</td>
                      <td className="whitespace-nowrap text-xs">{dataHora(d.criado_em)}</td>
                      <td>{d.caminho && url.get(d.caminho) && <a href={url.get(d.caminho) ?? undefined} target="_blank" rel="noreferrer" className="link text-sm">abrir</a>}</td>
                    </tr>);
                })}</tbody>
              </table></div>
            )}
            <div className="mt-4 grid gap-2 border-t border-concreto-100 pt-3 text-sm sm:grid-cols-2">
              <Link href={`/sst/epi/ficha/${id}`} className="rounded-md border border-concreto-200 p-3 hover:border-sinal-400"><b>Ficha de EPI (NR-06)</b>
                <span className="block text-xs text-concreto-500">{epis?.length ? `${epis.length} entrega(s) • última ${data(epis[0].data)}` : 'nenhuma entrega'}</span></Link>
              {oss?.[0] ? <Link href={`/sst/os/${oss[0].id}`} className="rounded-md border border-concreto-200 p-3 hover:border-sinal-400"><b>Ordem de Serviço OS-{String(oss[0].numero).padStart(4, '0')}</b>
                <span className="block text-xs text-concreto-500">{oss[0].ciencia_em ? `assinada em ${data(oss[0].ciencia_em)}` : 'aguardando ciência'}</span></Link>
                : <Link href={`/sst/os/nova?func=${id}`} className="rounded-md border border-atraso-500 p-3 text-atraso-700"><b>Sem Ordem de Serviço</b><span className="block text-xs">emitir agora →</span></Link>}
            </div>
          </Cartao>
        </div>

        <div className="space-y-5">
          <Cartao titulo="Resumo">
            <div className="mb-3 flex items-center gap-3">
              {fotoUrl ? <a href={fotoUrl} target="_blank" rel="noreferrer"><img src={fotoUrl} alt={`Foto de ${f.nome}`} className="h-24 w-24 rounded-lg border border-concreto-200 object-cover" /></a>
                : <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-concreto-300 bg-concreto-50 text-center text-[11px] text-concreto-500">sem foto</div>}
              <div className="text-sm"><div className="font-semibold">{f.nome}</div><div className="text-xs text-concreto-500">Matrícula {f.matricula}</div>
                <div className="mt-1 text-xs">{f.biometria_cadastrada ? <span className="text-ok-700">🙂 Facial cadastrada</span> : <span className="text-atencao-700">Facial não cadastrada</span>}</div></div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Info rotulo="Salário">{reais(f.salario_efetivo)}</Info>
              <Info rotulo="Jornada">{f.carga_diaria_horas} h/dia</Info>
              <Info rotulo="VA / dia">{reais(f.vale_alimentacao_dia)}</Info>
              <Info rotulo="VT / dia">{reais(f.vale_transporte_dia)}</Info>
              <Info rotulo="Admissão">{data(f.data_admissao)}</Info>
              <Info rotulo="Biometria">{f.biometria_cadastrada ? 'Cadastrada' : 'Não cadastrada'}</Info>
              <div className="col-span-2"><Info rotulo="EPIs da função">{(f.epis_obrigatorios ?? []).join(', ') || '—'}</Info></div>
              <div className="col-span-2"><Info rotulo="Riscos da função">{(f.riscos ?? []).join(', ') || '—'}</Info></div>
            </dl>
          </Cartao>

          {podeDoc && f.ativo && (
            <Cartao titulo="Anexar documento">
              <UploadArquivo pasta={`rh/${id}`} acao={registrarDocumento} rotuloBotao="Anexar ao dossiê">
                <input type="hidden" name="funcionario_id" value={id} />
                <Campo rotulo="Tipo"><select name="tipo" className="entrada">{TIPOS_DOSSIE.map((t) => <option key={t}>{t}</option>)}</select></Campo>
                <Campo rotulo="Descrição"><input name="descricao" className="entrada" placeholder="Ex.: ASO admissional" /></Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Emissão"><input type="date" name="emissao" className="entrada" /></Campo>
                  <Campo rotulo="Validade"><input type="date" name="validade" className="entrada" /></Campo>
                </div>
              </UploadArquivo>
            </Cartao>
          )}

          {f.ativo && ['admin', 'rh', 'seguranca'].includes(perfil.papel) && (
            <Cartao titulo="Biometria facial (ponto e EPI)">
              {f.biometria_cadastrada ? (
                <div className="space-y-2 text-sm">
                  {fotoUrl && <img src={fotoUrl} alt="" className="mx-auto h-40 w-40 rounded-lg object-cover" />}
                  <p className="text-ok-700">✓ Cadastrada com consentimento em {dataHora(f.biometria_consentida_em)}.</p>
                  {!fotoUrl && <p className="rounded-md bg-atencao-50 px-2 py-1 text-xs text-atencao-800">Cadastro feito antes da foto ser guardada. Tire uma foto do funcionário abaixo para aparecer na ficha e no dossiê.</p>}
                  <FormAcao acao={removerBiometria} className="flex gap-2"><input type="hidden" name="funcionario_id" value={id} />
                    <input name="motivo" placeholder="Motivo da remoção" className="entrada flex-1" /><Botao variante="secundario">Remover</Botao></FormAcao>
                </div>) : <CadastroBiometria funcionario={id} nome={f.nome} />}
            </Cartao>)}

          {['admin', 'rh', 'seguranca'].includes(perfil.papel) && (
            <Cartao titulo={fotoUrl ? 'Trocar a foto' : 'Foto do funcionário'}>
              <UploadArquivo pasta={`rh/${id}`} acao={salvarFotoFuncionario} rotuloBotao="Salvar foto" accept="image/*">
                <input type="hidden" name="funcionario_id" value={id} />
              </UploadArquivo>
            </Cartao>)}

          {pode && (f.ativo ? (
            <details className="rounded-lg border border-concreto-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-atraso-700">Desligar funcionário</summary>
              <FormAcao acao={desligarFuncionario} className="space-y-2 border-t border-concreto-100 p-4">
                <input type="hidden" name="id" value={id} />
                <Campo rotulo="Data do desligamento"><input type="date" name="data" defaultValue={hojeISO()} className="entrada" /></Campo>
                <Campo rotulo="Motivo"><input name="motivo" required className="entrada" placeholder="Pedido de demissão, término de contrato…" /></Campo>
                <p className="text-xs text-concreto-500">A pasta e todo o histórico continuam guardados (proteção em caso de ação trabalhista).</p>
                <Botao variante="perigo">Confirmar desligamento</Botao>
              </FormAcao>
            </details>
          ) : (
            <Cartao>
              <p className="mb-2 text-sm">Motivo: {f.motivo_demissao}</p>
              <FormAcao acao={reativarFuncionario}><input type="hidden" name="id" value={id} /><Botao variante="secundario">Reativar (readmissão)</Botao></FormAcao>
            </Cartao>
          ))}
        </div>
      </div>
    </>
  );
}
