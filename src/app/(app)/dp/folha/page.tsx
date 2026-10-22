import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP, mesAtual, nomeMes } from '@/components/AbasDP';
import { SeletorMes } from '@/components/SeletorMes';
import { BaixarCSV } from '@/components/BaixarCSV';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { num, dataHora } from '@/lib/formato';
import { fecharFolha } from '../acoes';
import { soma, type LinhaFolha } from '../tipos';

export const metadata = { title: 'Folha' };

export default async function Folha({ searchParams }: { searchParams: Promise<{ mes?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const mes = mesAtual(sp.mes);
  const [{ data: obras }, { data: fechada }, { data: historico }] = await Promise.all([
    supabase.from('obras').select('id, codigo').order('codigo'),
    supabase.from('folhas').select('*, perfis:fechada_por(nome)').eq('competencia', `${mes}-01`).maybeSingle(),
    supabase.from('folhas').select('id, competencia, total_bruto, total_liquido, total_he, funcionarios').order('competencia', { ascending: false }).limit(12),
  ]);
  let linhas: LinhaFolha[];
  let erro: string | null = null;
  if (fechada) {
    linhas = (fechada.itens as LinhaFolha[]).filter((l) => !sp.obra || l.obra_id === sp.obra);
  } else {
    const r = await supabase.rpc('folha_previa', { p_mes: `${mes}-01`, p_obra: sp.obra || null });
    linhas = (r.data ?? []) as LinhaFolha[];
    erro = r.error?.message ?? null;
  }
  const incompletos = linhas.filter((l) => l.incompletos > 0);
  const podeFechar = !fechada && !sp.obra && ['admin', 'rh'].includes(perfil.papel);
  const cab = ['Matrícula', 'Nome', 'Empresa', 'Função', 'Obra', 'Salário', 'Insalubridade', 'Periculosidade', 'HE 70% (h)', 'HE 70% (R$)', 'HE 100% (h)', 'HE 100% (R$)', 'DSR s/ HE', 'Faltas', 'Desc. faltas', 'Atrasos (h)', 'Desc. atrasos', 'Bruto', 'INSS', 'Desc. VT', 'Líquido estimado', 'VA', 'VT'];
  const csv = linhas.map((l) => [l.matricula, l.nome, l.empregador ?? '', l.funcao, l.obra_codigo, l.salario_base, l.insalubridade, l.periculosidade, l.he_util_h, l.he_util_valor, l.he_100_h, l.he_100_valor, l.dsr_he, l.faltas, l.desconto_faltas, l.atraso_h, l.desconto_atrasos, l.bruto, l.inss, l.desconto_vt, l.liquido_estimado, l.vale_alimentacao, l.vale_transporte]);

  return (
    <>
      <Cabecalho titulo={`Folha — ${nomeMes(mes)}`}
        sub={fechada ? <>Fechada em {dataHora(fechada.fechada_em)} por {(fechada.perfis as unknown as { nome: string })?.nome}. Valores congelados.</> : 'Prévia calculada a partir do ponto, atestados e cadastro. Confira e feche ao final do mês.'}
        acoes={<div className="flex gap-2"><BaixarCSV nome={`folha-${mes}`} cabecalho={cab} linhas={csv} /><BotaoImprimir /></div>} />
      <AbasDP atual="folha" mes={mes} />
      <SeletorMes mes={mes} extra={<select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select>} />
      {erro && <p className="mb-4 rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{erro}</p>}
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
            <table className="tabela"><thead><tr><th>Competência</th><th>Func.</th><th className="text-right">HE</th><th className="text-right">Bruto</th><th className="text-right">Líquido</th></tr></thead>
              <tbody>{historico.map((h) => <tr key={h.id}><td><a className="link" href={`/dp/folha?mes=${h.competencia.slice(0, 7)}`}>{nomeMes(h.competencia.slice(0, 7))}</a></td><td>{h.funcionarios}</td><td className="text-right font-mono">{reais(h.total_he)}</td><td className="text-right font-mono">{reais(h.total_bruto)}</td><td className="text-right font-mono">{reais(h.total_liquido)}</td></tr>)}</tbody></table>)}
        </Cartao>
      </div>
    </>
  );
}
