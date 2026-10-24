import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP, mesAtual, nomeMes } from '@/components/AbasDP';
import { SeletorMes } from '@/components/SeletorMes';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { BaixarCSV } from '@/components/BaixarCSV';
import { CopiarTexto } from '@/components/CopiarTexto';
import { Botao, FormAcao } from '@/components/formulario';
import { data, dataHora } from '@/lib/formato';
import { origemPublica } from '@/lib/origem';
import { horas } from '../tipos';
import { corrigirPonto, gerarLinkPonto, responderPedido, revogarLinkPonto } from '../acoes';

export const metadata = { title: 'Espelho de ponto' };
type Marc = { id: number; t: string; h: string; m: string; j?: string; x?: string };
type Dia = { data: string; dia_semana: number; feriado: string | null; marcacoes: Marc[]; trabalhado_min: number; previsto_min: number;
  he_util_min: number; he_100_min: number; atraso_min: number; falta: boolean; abonado: string | null; incompleto: boolean };
const SEM = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default async function Espelho({ searchParams }: { searchParams: Promise<{ mes?: string; func?: string; dia?: string; pedido?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro', 'engenheiro');
  const rh = ['admin', 'rh'].includes(perfil.papel);
  const mes = mesAtual(sp.mes ?? sp.dia?.slice(0, 7));
  const [{ data: todos }, { data: acertados }] = await Promise.all([
    supabase.from('funcionarios').select('id, nome, matricula, cpf, telefone, obra_id, data_admissao, data_demissao, ativo, funcoes(nome), obras(codigo, nome), empregadores(nome, ponto_externo, ponto_externo_url)').order('nome'),
    supabase.from('pagamento_itens').select('funcionario_id, pagamentos!inner(status)').eq('categoria', 'rescisao').eq('removido', false).in('pagamentos.status', ['fechado', 'pago']),
  ]);
  // na lista: ativos e quem saiu neste mês ainda sem acerto (desligados antigos ou já acertados só aparecem se abertos pelo link)
  const quitados = new Set((acertados ?? []).map((x) => x.funcionario_id));
  const funcs = (todos ?? []).filter((f) => f.ativo || f.id === sp.func || (!!f.data_demissao && f.data_demissao >= `${mes}-01` && !quitados.has(f.id)));
  const func = funcs?.find((f) => f.id === sp.func) ?? funcs?.find((f) => f.ativo) ?? funcs?.[0];
  const [a, m] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const r = func ? await supabase.rpc('espelho_ponto', { p_func: func.id, p_inicio: `${mes}-01`, p_fim: fim }) : null;
  const dias = (r?.data ?? []) as Dia[];
  const t = (k: keyof Dia) => dias.reduce((s, d) => s + Number(d[k] || 0), 0);
  const fn = func?.funcoes as unknown as { nome: string } | null;
  const ob = func?.obras as unknown as { codigo: string; nome: string } | null;
  const q = (extra: string) => `/dp/espelho?mes=${mes}&func=${func?.id}${extra}`;

  // Ferramentas do RH
  const [{ data: pedidos }, { data: acesso }, { data: fechada }] = rh && func ? await Promise.all([
    supabase.from('ponto_contestacoes').select('*').eq('funcionario_id', func.id).order('criado_em', { ascending: false }).limit(20),
    supabase.from('funcionario_acessos').select('token, criado_em, ultimo_acesso').eq('funcionario_id', func.id).is('revogado_em', null).maybeSingle(),
    // folha geral do mês ou a folha da obra do funcionário
    supabase.from('folhas').select('id').eq('competencia', `${mes}-01`)
      .or(func.obra_id ? `obra_id.is.null,obra_id.eq.${func.obra_id}` : 'obra_id.is.null').limit(1).maybeSingle(),
  ]) : [{ data: null }, { data: null }, { data: null }];
  const abertos = (pedidos ?? []).filter((p) => p.status === 'aberta');
  const diaSel = sp.dia ? dias.find((d) => d.data === sp.dia) : undefined;
  const pedidoSel = sp.pedido ? abertos.find((p) => p.id === sp.pedido) : abertos.find((p) => p.data === sp.dia);
  const link = acesso ? `${await origemPublica()}/p/ponto/${acesso.token}` : null;
  const fone = func?.telefone?.replace(/\D/g, '');
  const whats = link && fone ? `https://wa.me/${fone.length <= 11 ? '55' + fone : fone}?text=${encodeURIComponent(`Olá, ${func!.nome.split(' ')[0]}! Este é o seu espelho de ponto. Confira suas marcações e, se algo estiver errado, peça a correção pelo próprio link: ${link}`)}` : null;

  return (
    <>
      <Cabecalho titulo="Espelho de ponto" sub={func ? `${func.nome} • ${nomeMes(mes)}` : undefined}
        acoes={func && <div className="flex gap-2"><BaixarCSV nome={`espelho-${func.matricula}-${mes}`} cabecalho={['Data', 'Dia', 'Marcações', 'Trabalhado (min)', 'HE 70% (min)', 'HE 100% (min)', 'Atraso (min)', 'Falta', 'Abono', 'Observação']}
          linhas={dias.map((d) => [d.data.split('-').reverse().join('/'), SEM[d.dia_semana], d.marcacoes.filter((x) => !x.x).map((x) => x.h).join(' '), d.trabalhado_min, d.he_util_min, d.he_100_min, d.atraso_min, d.falta ? 'sim' : '', d.abonado, d.incompleto ? 'incompleto' : d.feriado])} /><BotaoImprimir /></div>} />
      <AbasDP atual="espelho" mes={mes} />
      <SeletorMes mes={mes} extra={<select name="func" defaultValue={func?.id} className="entrada w-auto flex-1">{funcs?.map((f) => <option key={f.id} value={f.id}>{f.nome} — {f.matricula}{f.ativo ? '' : ' (desligado)'}</option>)}</select>} />
      {r?.error && <p className="mb-4 rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{r.error.message}</p>}
      {(() => { const em = func?.empregadores as unknown as { nome: string; ponto_externo: boolean; ponto_externo_url: string | null } | null; return em?.ponto_externo ? (
        <p className="mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">O ponto da {em.nome} é marcado fora do sistema{em.ponto_externo_url && <> — <a className="link" href={em.ponto_externo_url} target="_blank" rel="noreferrer">abrir o Ponto Diário</a></>}. Este espelho não lança falta nem hora extra para {func!.nome.split(' ')[0]}; faltas e horas extras entram em <a className="link" href="/dp/pagamentos">Pagamentos</a> (dia 05) como desconto e hora extra.</p>) : null; })()}
      {!func ? <Vazio>Nenhum funcionário cadastrado.</Vazio> : (<>
        {rh && (
          <div className="nao-imprimir mb-4 grid gap-4 lg:grid-cols-2">
            <Cartao titulo="Acesso do funcionário ao espelho">
              {link ? (
                <div className="space-y-3 text-sm">
                  <p className="text-concreto-600">O funcionário abre este link no celular, sem senha, vê as próprias marcações e pode pedir correção.</p>
                  <div className="break-all rounded-md bg-concreto-50 px-3 py-2 font-mono text-xs">{link}</div>
                  <div className="flex flex-wrap gap-2">
                    {whats ? <a href={whats} target="_blank" rel="noreferrer" className="rounded-md bg-ok-500 px-3 py-2 text-sm font-semibold text-white hover:bg-ok-700">Enviar pelo WhatsApp</a>
                      : <span className="text-xs text-concreto-500">Cadastre o telefone do funcionário para enviar pelo WhatsApp.</span>}
                    <CopiarTexto texto={link} />
                    <FormAcao acao={revogarLinkPonto}><input type="hidden" name="func" value={func.id} /><Botao variante="secundario">Desativar link</Botao></FormAcao>
                  </div>
                  <p className="text-xs text-concreto-500">Criado em {dataHora(acesso!.criado_em)} • {acesso!.ultimo_acesso ? `último acesso ${dataHora(acesso!.ultimo_acesso)}` : 'ainda não acessado'}. Se o link vazar, desative e gere outro.</p>
                </div>
              ) : func.ativo ? (
                <FormAcao acao={gerarLinkPonto} className="space-y-3">
                  <input type="hidden" name="func" value={func.id} />
                  <p className="text-sm text-concreto-600">Gere um link pessoal para o funcionário acompanhar o próprio ponto pelo celular e pedir correção quando algo estiver errado.</p>
                  <Botao>Gerar link do funcionário</Botao>
                </FormAcao>
              ) : <p className="text-sm text-concreto-500">Funcionário desligado.</p>}
            </Cartao>
            <Cartao titulo={`Pedidos de correção${abertos.length ? ` — ${abertos.length} aguardando` : ''}`}>
              {!pedidos?.length ? <p className="text-sm text-concreto-500">Nenhum pedido deste funcionário.</p> : (
                <div className="space-y-2">{pedidos.slice(0, 6).map((p) => (
                  <div key={p.id} className="rounded-md border border-concreto-200 p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={q(`&dia=${p.data}&pedido=${p.id}#corrigir`)} className="link">{data(p.data)}</Link>
                      <Selo cor={p.status === 'aberta' ? 'bg-atencao-100 text-atencao-800' : p.status === 'corrigida' ? 'bg-ok-50 text-ok-700' : 'bg-concreto-100 text-concreto-600'}>{p.status === 'aberta' ? 'Aguardando' : p.status === 'corrigida' ? 'Corrigido' : 'Indeferido'}</Selo>
                    </div>
                    <p className="mt-1 text-concreto-700">“{p.mensagem}”</p>
                    {p.resposta && <p className="mt-1 text-xs text-concreto-500">RH: {p.resposta}</p>}
                  </div>))}</div>)}
            </Cartao>
          </div>)}

        {rh && diaSel && (
          <div id="corrigir" className="nao-imprimir mb-4">
            <Cartao titulo={`Corrigir ${data(diaSel.data)} (${SEM[diaSel.dia_semana]})`} acoes={<Link href={q('')} className="text-sm text-concreto-500 hover:underline">Fechar</Link>}>
              {fechada ? <p className="text-sm text-atraso-700">A folha de {nomeMes(mes)} já foi fechada — o ponto deste mês não pode mais ser alterado.</p> : (
                <FormAcao acao={corrigirPonto} className="space-y-4">
                  <input type="hidden" name="func" value={func.id} /><input type="hidden" name="dia" value={diaSel.data} />
                  {pedidoSel && <><input type="hidden" name="contestacao" value={pedidoSel.id} />
                    <p className="rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">Pedido do funcionário: “{pedidoSel.mensagem}” — ao salvar, o pedido é marcado como corrigido.</p></>}
                  <div>
                    <div className="mb-1 text-sm font-semibold">Marcações do dia — marque as que estão erradas</div>
                    {!diaSel.marcacoes.filter((x) => !x.x).length ? <p className="text-sm text-concreto-500">Nenhuma marcação válida neste dia.</p> : (
                      <div className="flex flex-wrap gap-2">{diaSel.marcacoes.filter((x) => !x.x).map((x) => (
                        <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-concreto-300 px-3 py-2 text-sm has-[:checked]:border-atraso-500 has-[:checked]:bg-atraso-50">
                          <input type="checkbox" name="desconsiderar" value={x.id} />
                          <span className="font-mono">{x.t === 'entrada' ? '▶' : '■'} {x.h}</span><span className="text-xs text-concreto-500">{x.t}{x.m === 'manual' ? ' • manual' : ''}</span>
                        </label>))}</div>)}
                    <p className="mt-1 text-xs text-concreto-500">A marcação errada não é apagada: fica riscada no espelho, com o motivo (exigência da Portaria 671/2021).</p>
                  </div>
                  <div>
                    <div className="mb-1 text-sm font-semibold">Incluir horários corretos</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex gap-1">
                          <input type="time" name={`hora${i}`} className="entrada" aria-label={`Horário ${i}`} />
                          <select name={`tipo${i}`} defaultValue={i % 2 ? 'entrada' : 'saida'} className="entrada w-auto"><option value="entrada">Entr.</option><option value="saida">Saída</option></select>
                        </div>))}
                    </div>
                  </div>
                  <Campo rotulo="Justificativa"><input name="justificativa" required minLength={5} placeholder="ex.: esqueceu de bater a saída — confirmado pelo encarregado" className="entrada" /></Campo>
                  <Botao>Salvar correção</Botao>
                </FormAcao>)}
              {pedidoSel && !fechada && (
                <FormAcao acao={responderPedido} className="mt-4 flex flex-wrap items-end gap-2 border-t border-concreto-200 pt-4">
                  <input type="hidden" name="id" value={pedidoSel.id} /><input type="hidden" name="status" value="indeferida" />
                  <Campo rotulo="Ou indeferir o pedido — resposta ao funcionário" className="min-w-[240px] flex-1"><input name="resposta" required minLength={5} className="entrada" placeholder="ex.: marcação confere com a câmera do tablet" /></Campo>
                  <Botao variante="secundario">Indeferir</Botao>
                </FormAcao>)}
            </Cartao>
          </div>)}

        <div className="mb-4 rounded-lg border border-concreto-200 bg-white p-4 text-sm">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
            <div><span className="text-concreto-500">Funcionário:</span> <b>{func.nome}</b></div>
            <div><span className="text-concreto-500">Matrícula:</span> {func.matricula}</div>
            <div><span className="text-concreto-500">CPF:</span> {func.cpf ?? '—'}</div>
            <div><span className="text-concreto-500">Função:</span> {fn?.nome ?? '—'}</div>
            <div><span className="text-concreto-500">Obra:</span> {ob ? `${ob.codigo} — ${ob.nome}` : '—'}</div>
            <div><span className="text-concreto-500">Competência:</span> {nomeMes(mes)}</div>
          </div>
        </div>
        <div className="nao-imprimir mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Indicador rotulo="Trabalhado" valor={horas(t('trabalhado_min'))} />
          <Indicador rotulo="HE 70%" valor={horas(t('he_util_min'))} tom="atencao" />
          <Indicador rotulo="HE 100%" valor={horas(t('he_100_min'))} tom="atencao" />
          <Indicador rotulo="Atrasos" valor={horas(t('atraso_min'))} tom={t('atraso_min') ? 'atraso' : 'neutro'} />
          <Indicador rotulo="Faltas" valor={dias.filter((d) => d.falta).length} tom={dias.some((d) => d.falta) ? 'atraso' : 'neutro'} />
        </div>
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela whitespace-nowrap">
          <thead><tr><th>Dia</th><th>Marcações</th><th className="text-right">Trabalhado</th><th className="text-right">HE 70%</th><th className="text-right">HE 100%</th><th className="text-right">Atraso</th><th>Ocorrência</th>{rh && <th className="nao-imprimir" />}</tr></thead>
          <tbody>{dias.map((d) => {
            const desc = d.dia_semana === 7 || d.feriado;
            const temPedido = abertos.some((p) => p.data === d.data);
            return (
              <tr key={d.data} className={d.data === sp.dia ? 'bg-sinal-50' : desc ? 'bg-concreto-50' : ''}>
                <td className="font-mono">{d.data.slice(8)}/{d.data.slice(5, 7)} <span className="text-concreto-500">{SEM[d.dia_semana]}</span></td>
                <td className="font-mono">{d.marcacoes.map((x) => (
                  <span key={x.id} title={x.x ? `Desconsiderada pelo RH: ${x.x}` : x.j ?? (x.m === 'facial' ? 'Reconhecimento facial' : '')}
                    className={`mr-2 ${x.x ? 'text-concreto-400 line-through' : x.m === 'manual' ? 'text-atencao-700' : ''}`}>{x.t === 'entrada' ? '▶' : '■'}{x.h}{x.m === 'manual' && !x.x ? '*' : ''}</span>))}</td>
                <td className="text-right font-mono">{d.trabalhado_min ? horas(d.trabalhado_min) : ''}</td>
                <td className="text-right font-mono">{d.he_util_min ? horas(d.he_util_min) : ''}</td>
                <td className="text-right font-mono">{d.he_100_min ? horas(d.he_100_min) : ''}</td>
                <td className="text-right font-mono text-atraso-700">{d.atraso_min ? horas(d.atraso_min) : ''}</td>
                <td className="text-xs">
                  {d.incompleto && <Selo cor="bg-atencao-100 text-atencao-800">Incompleto</Selo>}
                  {d.falta && <Selo cor="bg-atraso-50 text-atraso-700">Falta</Selo>}
                  {d.abonado && <Selo cor="bg-sky-100 text-sky-800">{d.abonado}</Selo>}
                  {temPedido && <Selo cor="bg-atraso-50 text-atraso-700">Pedido de correção</Selo>}
                  {d.feriado && <span className="text-concreto-500"> {d.feriado}</span>}
                  {!d.feriado && d.dia_semana === 7 && <span className="text-concreto-500">Descanso</span>}
                </td>
                {rh && <td className="nao-imprimir text-right">{!fechada && <Link href={q(`&dia=${d.data}#corrigir`)} className="link text-xs">Corrigir</Link>}</td>}
              </tr>);
          })}
            <tr className="bg-concreto-50 font-semibold"><td colSpan={2}>Totais</td><td className="text-right font-mono">{horas(t('trabalhado_min'))}</td><td className="text-right font-mono">{horas(t('he_util_min'))}</td><td className="text-right font-mono">{horas(t('he_100_min'))}</td><td className="text-right font-mono">{horas(t('atraso_min'))}</td><td>{dias.filter((d) => d.falta).length} falta(s)</td>{rh && <td className="nao-imprimir" />}</tr>
          </tbody>
        </table></div>
        <p className="mt-2 text-xs text-concreto-500">* marcação manual ou correção do RH (passe o mouse para ver a justificativa) • <span className="line-through">riscada</span> = desconsiderada pelo RH, mantida no histórico. Dias incompletos não são calculados até o RH corrigir.</p>
        <div className="so-imprimir mt-16 grid grid-cols-2 gap-16 text-center text-sm">
          <div className="border-t border-concreto-800 pt-1">{func.nome}<br />Funcionário</div>
          <div className="border-t border-concreto-800 pt-1">Departamento Pessoal</div>
        </div>
      </>)}
    </>
  );
}
