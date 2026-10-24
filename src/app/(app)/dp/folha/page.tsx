import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP, mesAtual, nomeMes } from '@/components/AbasDP';
import { SeletorMes } from '@/components/SeletorMes';
import { BaixarCSV } from '@/components/BaixarCSV';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { num, dataHora } from '@/lib/formato';
import { fecharFolha, fecharFolhaObra } from '../acoes';
import { soma, type LinhaFolha } from '../tipos';

export const metadata = { title: 'Folha' };

export default async function Folha({ searchParams }: { searchParams: Promise<{ mes?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const mes = mesAtual(sp.mes);
  const [{ data: obras }, { data: fechadas }, { data: historico }, { data: par }] = await Promise.all([
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('folhas').select('*, perfis:fechada_por(nome)').eq('competencia', `${mes}-01`),
    supabase.from('folhas').select('id, competencia, obra_id, total_bruto, total_liquido, total_he, funcionarios').order('competencia', { ascending: false }).limit(24),
    supabase.from('dp_parametros').select('ponto_inicio').eq('id', 1).maybeSingle(),
  ]);
  const codObra = new Map((obras ?? []).map((o) => [o.id, o.codigo]));
  const geral = (fechadas ?? []).find((x) => !x.obra_id);
  const porObra = new Map((fechadas ?? []).filter((x) => x.obra_id).map((x) => [x.obra_id as string, x]));
  const fechada = geral ?? (sp.obra ? porObra.get(sp.obra) : undefined);
  let linhas: LinhaFolha[];
  let erro: string | null = null;
  if (fechada) {
    linhas = (fechada.itens as LinhaFolha[]).filter((l) => !sp.obra || l.obra_id === sp.obra);
  } else {
    const r = await supabase.rpc('folha_previa', { p_mes: `${mes}-01`, p_obra: sp.obra || null });
    linhas = (r.data ?? []) as LinhaFolha[];
    erro = r.error?.message ?? null;
    // obras com folha já fechada: valem os valores congelados
    if (!sp.obra && porObra.size) {
      linhas = [...linhas.filter((l) => !l.obra_id || !porObra.has(l.obra_id)),
                ...[...porObra.values()].flatMap((x) => x.itens as LinhaFolha[])].sort((a, b) => a.nome.localeCompare(b.nome));
    }
  }
  const incompletos = linhas.filter((l) => l.incompletos > 0);
  const rh = ['admin', 'rh'].includes(perfil.papel);
  const podeFechar = !geral && !porObra.size && !sp.obra && rh;
  // resumo por obra (centro de custo)
  const grupos = new Map<string, LinhaFolha[]>();
  linhas.forEach((l) => { const k = l.obra_id ?? ''; grupos.set(k, [...(grupos.get(k) ?? []), l]); });
  const resumo = [...grupos.entries()].map(([k, ls]) => ({ obra: k, codigo: k ? codObra.get(k) ?? ls[0].obra_codigo ?? '—' : 'Escritório / sem obra', ls,
    fechadaObra: geral ? geral : k ? porObra.get(k) : undefined })).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const cab = ['Matrícula', 'Nome', 'Empresa', 'Função', 'Obra', 'Salário', 'Insalubridade', 'Periculosidade', 'HE 70% (h)', 'HE 70% (R$)', 'HE 100% (h)', 'HE 100% (R$)', 'DSR s/ HE', 'Faltas', 'Desc. faltas', 'Atrasos (h)', 'Desc. atrasos', 'Bruto', 'INSS', 'Desc. VT', 'Líquido estimado', 'VA', 'VT'];
  const csv = linhas.map((l) => [l.matricula, l.nome, l.empregador ?? '', l.funcao, l.obra_codigo, l.salario_base, l.insalubridade, l.periculosidade, l.he_util_h, l.he_util_valor, l.he_100_h, l.he_100_valor, l.dsr_he, l.faltas, l.desconto_faltas, l.atraso_h, l.desconto_atrasos, l.bruto, l.inss, l.desconto_vt, l.liquido_estimado, l.vale_alimentacao, l.vale_transporte]);

  return (
    <>
      <Cabecalho titulo={`Folha — ${nomeMes(mes)}`}
        sub={fechada ? <>{fechada.obra_id ? `Obra ${codObra.get(fechada.obra_id) ?? ''} — fechada` : 'Fechada'} em {dataHora(fechada.fechada_em)} por {(fechada.perfis as unknown as { nome: string })?.nome}. Valores congelados.</> : porObra.size ? `Obras com folha fechada: ${[...porObra.keys()].map((k) => codObra.get(k)).join(', ')}. As demais estão em prévia.` : 'Prévia calculada a partir do ponto, atestados e cadastro. Confira e feche ao final do mês — a folha toda ou obra por obra.'}
        acoes={<div className="flex gap-2"><BaixarCSV nome={`folha-${mes}`} cabecalho={cab} linhas={csv} /><BotaoImprimir /></div>} />
      <AbasDP atual="folha" mes={mes} />
      <SeletorMes mes={mes} extra={<select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}{porObra.has(o.id) || geral ? ' (fechada)' : ''}</option>)}</select>} />
      {erro && <p className="mb-4 rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{erro}</p>}
      <p className="nao-imprimir mb-4 rounded-md bg-concreto-50 px-3 py-2 text-sm text-concreto-700">
        {par?.ponto_inicio
          ? <>Faltas, atrasos e horas extras contam a partir de <b>{par.ponto_inicio.split('-').reverse().join('/')}</b> (início do controle de ponto). </>
          : <>O controle de ponto ainda não começou: a folha <b>não desconta faltas</b> nem calcula horas extras. Quando o ponto entrar em uso, informe a data em <a className="link" href="/dp/parametros">Parâmetros</a>. </>}
        Os valores do dia 20 e do dia 05, por empresa, ficam em <a className="link" href="/dp/pagamentos">Pagamentos</a>.
      </p>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Indicador rotulo="Funcionários" valor={linhas.length} />
        <Indicador rotulo="Total bruto" valor={reais(soma(linhas, 'bruto'))} />
        <Indicador rotulo="Horas extras (R$)" valor={reais(soma(linhas, 'he_util_valor') + soma(linhas, 'he_100_valor') + soma(linhas, 'dsr_he'))} tom="atencao" />
        <Indicador rotulo="INSS (empregado)" valor={reais(soma(linhas, 'inss'))} />
        <Indicador rotulo="Líquido estimado" valor={reais(soma(linhas, 'liquido_estimado'))} tom="ok" />
      </div>
      {incompletos.length > 0 && (
        <p className="nao-imprimir mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">
          ⚠ {incompletos.length} funcionário(s) com marcação incompleta (entrada sem saída): {incompletos.map((l) => l.nome).join(', ')}. Corrija no ponto (lançamento manual) antes de fechar — esses dias não entram no cálculo.
        </p>)}
      {!sp.obra && resumo.length > 0 && (
        <Cartao titulo="Por obra (centro de custo)" className="mb-5">
          <div className="overflow-x-auto"><table className="tabela whitespace-nowrap">
            <thead><tr><th>Obra</th><th className="text-right">Func.</th><th className="text-right">Horas extras</th><th className="text-right">Bruto</th><th className="text-right">Líquido</th><th>Situação</th><th className="nao-imprimir"></th></tr></thead>
            <tbody>{resumo.map((g) => (
              <tr key={g.obra || 'sem'}>
                <td>{g.obra ? <a className="link" href={`/dp/folha?mes=${mes}&obra=${g.obra}`}>{g.codigo}</a> : g.codigo}</td>
                <td className="text-right">{g.ls.length}</td>
                <td className="text-right font-mono">{reais(soma(g.ls, 'he_util_valor') + soma(g.ls, 'he_100_valor') + soma(g.ls, 'dsr_he'))}</td>
                <td className="text-right font-mono">{reais(soma(g.ls, 'bruto'))}</td>
                <td className="text-right font-mono font-semibold">{reais(soma(g.ls, 'liquido_estimado'))}</td>
                <td>{g.fechadaObra ? <Selo cor="bg-ok-50 text-ok-700">Fechada</Selo> : <Selo cor="bg-concreto-100 text-concreto-700">Prévia</Selo>}</td>
                <td className="nao-imprimir">{!g.fechadaObra && g.obra && rh && (
                  <FormAcao acao={fecharFolhaObra}><input type="hidden" name="mes" value={mes} /><input type="hidden" name="obra" value={g.obra} /><input type="hidden" name="codigo" value={g.codigo} />
                    <button className="rounded-md border border-concreto-300 bg-white px-2 py-1 text-xs font-semibold hover:border-sinal-400">Fechar folha da obra</button></FormAcao>)}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="mt-2 text-xs text-concreto-500">Cada obra pode ter a sua folha fechada separadamente. Os custos de cada folha fechada entram no centro de custo da obra (Financeiro). Quem está no escritório (sem obra) entra na folha geral.</p>
        </Cartao>)}
      {sp.obra && !fechada && rh && (
        <Cartao titulo={`Fechar a folha da obra ${codObra.get(sp.obra) ?? ''}`} className="nao-imprimir mb-5">
          <p className="mb-3 text-sm text-concreto-600">Grava os valores desta obra em {nomeMes(mes)} e lança os custos no centro de custo dela. As outras obras continuam abertas.</p>
          <FormAcao acao={fecharFolhaObra}><input type="hidden" name="mes" value={mes} /><input type="hidden" name="obra" value={sp.obra} /><input type="hidden" name="codigo" value={codObra.get(sp.obra) ?? ''} />
            <Botao variante="escuro">Fechar folha da obra {codObra.get(sp.obra)}</Botao></FormAcao>
        </Cartao>)}
      {!linhas.length ? <Vazio>Nenhum funcionário ativo nesta competência.</Vazio> : (
        <div className="overflow-x-auto rounded-lg border border-concreto-200 bg-white"><table className="tabela whitespace-nowrap">
          <thead><tr><th>Funcionário</th><th>Obra</th><th className="text-right">Salário + adic.</th><th className="text-right">HE 70%</th><th className="text-right">HE 100%</th><th className="text-right">DSR</th><th className="text-right">Faltas / atrasos</th><th className="text-right">Bruto</th><th className="text-right">INSS</th><th className="text-right">VT</th><th className="text-right">Líquido</th></tr></thead>
          <tbody>{linhas.map((l) => (
            <tr key={l.funcionario_id}>
              <td><a href={`/dp/espelho?mes=${mes}&func=${l.funcionario_id}`} className="link">{l.nome}</a><div className="text-xs text-concreto-500">{l.matricula} • {l.funcao ?? 'sem função'}{l.empregador && ` • ${l.empregador}`}{l.fechamento_externo && ' (fechamento pela empresa)'}{l.incompletos > 0 && <> • <Selo cor="bg-atencao-100 text-atencao-800">{l.incompletos} incompleto(s)</Selo></>}</div></td>
              <td className="text-xs">{l.obra_codigo ?? '—'}</td>
              <td className="text-right font-mono">{reais(Number(l.salario_base) + Number(l.insalubridade) + Number(l.periculosidade))}{(Number(l.insalubridade) > 0 || Number(l.periculosidade) > 0) && <div className="text-xs text-concreto-500">{Number(l.insalubridade) > 0 && `ins. ${reais(l.insalubridade)}`}{Number(l.periculosidade) > 0 && ` per. ${reais(l.periculosidade)}`}</div>}</td>
              <td className="text-right font-mono">{reais(l.he_util_valor)}<div className="text-xs text-concreto-500">{num(l.he_util_h)} h</div></td>
              <td className="text-right font-mono">{reais(l.he_100_valor)}<div className="text-xs text-concreto-500">{num(l.he_100_h)} h</div></td>
              <td className="text-right font-mono">{reais(l.dsr_he)}</td>
              <td className="text-right font-mono text-atraso-700">{Number(l.desconto_faltas) + Number(l.desconto_atrasos) > 0 ? `−${reais(Number(l.desconto_faltas) + Number(l.desconto_atrasos))}` : '—'}<div className="text-xs text-concreto-500">{l.faltas} falta(s) • {num(l.atraso_h)} h</div></td>
              <td className="text-right font-mono font-semibold">{reais(l.bruto)}</td>
              <td className="text-right font-mono">{reais(l.inss)}</td>
              <td className="text-right font-mono">{reais(l.desconto_vt)}</td>
              <td className="text-right font-mono font-bold">{reais(l.liquido_estimado)}</td>
            </tr>))}
            <tr className="bg-concreto-50 font-semibold"><td colSpan={2}>Totais</td>
              <td className="text-right font-mono">{reais(soma(linhas, 'salario_base') + soma(linhas, 'insalubridade') + soma(linhas, 'periculosidade'))}</td>
              <td className="text-right font-mono">{reais(soma(linhas, 'he_util_valor'))}</td><td className="text-right font-mono">{reais(soma(linhas, 'he_100_valor'))}</td>
              <td className="text-right font-mono">{reais(soma(linhas, 'dsr_he'))}</td><td className="text-right font-mono">−{reais(soma(linhas, 'desconto_faltas') + soma(linhas, 'desconto_atrasos'))}</td>
              <td className="text-right font-mono">{reais(soma(linhas, 'bruto'))}</td><td className="text-right font-mono">{reais(soma(linhas, 'inss'))}</td>
              <td className="text-right font-mono">{reais(soma(linhas, 'desconto_vt'))}</td><td className="text-right font-mono">{reais(soma(linhas, 'liquido_estimado'))}</td></tr>
          </tbody>
        </table></div>)}
      <p className="mt-2 text-xs text-concreto-500">Benefícios fora do bruto: VA {reais(soma(linhas, 'vale_alimentacao'))} • VT {reais(soma(linhas, 'vale_transporte'))}. Valores estimados (INSS progressivo; IRRF, FGTS e encargos patronais ficam com a contabilidade).</p>
      <div className="nao-imprimir mt-5 grid gap-5 lg:grid-cols-2">
        {podeFechar && (
          <Cartao titulo="Fechar a folha">
            <p className="mb-3 text-sm text-concreto-600">Ao fechar, os valores desta competência são gravados e não mudam mais, mesmo que o ponto seja corrigido depois. Só é permitido após o fim do mês e sem marcações incompletas.</p>
            <FormAcao acao={fecharFolha}><input type="hidden" name="mes" value={mes} /><Botao variante="escuro">Fechar folha de {nomeMes(mes)}</Botao></FormAcao>
          </Cartao>)}
        <Cartao titulo="Folhas fechadas">
          {!historico?.length ? <Vazio>Nenhuma folha fechada ainda.</Vazio> : (
            <table className="tabela"><thead><tr><th>Competência</th><th>Obra</th><th>Func.</th><th className="text-right">HE</th><th className="text-right">Bruto</th><th className="text-right">Líquido</th></tr></thead>
              <tbody>{historico.map((h) => <tr key={h.id}><td><a className="link" href={`/dp/folha?mes=${h.competencia.slice(0, 7)}${h.obra_id ? `&obra=${h.obra_id}` : ''}`}>{nomeMes(h.competencia.slice(0, 7))}</a></td><td className="text-xs">{h.obra_id ? codObra.get(h.obra_id) : 'Todas'}</td><td>{h.funcionarios}</td><td className="text-right font-mono">{reais(h.total_he)}</td><td className="text-right font-mono">{reais(h.total_bruto)}</td><td className="text-right font-mono">{reais(h.total_liquido)}</td></tr>)}</tbody></table>)}
        </Cartao>
      </div>
    </>
  );
}
