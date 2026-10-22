import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Vazio } from '@/components/ui';
import { AbasDP, mesAtual, nomeMes } from '@/components/AbasDP';
import { SeletorMes } from '@/components/SeletorMes';
import { BaixarCSV } from '@/components/BaixarCSV';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { reais } from '@/lib/dominio';
import { num } from '@/lib/formato';
import { soma, type LinhaFolha } from '../tipos';

export const metadata = { title: 'Horas extras e faltas' };

export default async function HorasExtras({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'rh', 'financeiro');
  const mes = mesAtual(sp.mes);
  const r = await supabase.rpc('folha_previa', { p_mes: `${mes}-01`, p_obra: null });
  const l = (r.data ?? []) as LinhaFolha[];
  const he = l.filter((x) => Number(x.he_util_h) + Number(x.he_100_h) > 0).sort((a, b) => (Number(b.he_util_valor) + Number(b.he_100_valor)) - (Number(a.he_util_valor) + Number(a.he_100_valor)));
  const ausencias = l.filter((x) => x.faltas > 0 || Number(x.atraso_h) > 0).sort((a, b) => b.faltas - a.faltas || Number(b.atraso_h) - Number(a.atraso_h));
  const porObra = new Map<string, { h70: number; h100: number; valor: number; faltas: number }>();
  l.forEach((x) => {
    const k = x.obra_codigo ?? 'Sem obra';
    const o = porObra.get(k) ?? { h70: 0, h100: 0, valor: 0, faltas: 0 };
    o.h70 += Number(x.he_util_h); o.h100 += Number(x.he_100_h); o.valor += Number(x.he_util_valor) + Number(x.he_100_valor) + Number(x.dsr_he); o.faltas += x.faltas;
    porObra.set(k, o);
  });
  const totalHE = soma(l, 'he_util_valor') + soma(l, 'he_100_valor') + soma(l, 'dsr_he');

  return (
    <>
      <Cabecalho titulo={`Horas extras e faltas — ${nomeMes(mes)}`} sub="Calculado do ponto facial/manual. HE 70% em dias úteis e sábados, 100% em domingos e feriados."
        acoes={<div className="flex gap-2"><BaixarCSV nome={`horas-extras-${mes}`} cabecalho={['Matrícula', 'Nome', 'Obra', 'HE 70% (h)', 'HE 70% (R$)', 'HE 100% (h)', 'HE 100% (R$)', 'DSR', 'Faltas', 'Atrasos (h)', 'Desconto']}
          linhas={l.map((x) => [x.matricula, x.nome, x.obra_codigo, x.he_util_h, x.he_util_valor, x.he_100_h, x.he_100_valor, x.dsr_he, x.faltas, x.atraso_h, Number(x.desconto_faltas) + Number(x.desconto_atrasos)])} /><BotaoImprimir /></div>} />
      <AbasDP atual="he" mes={mes} />
      <SeletorMes mes={mes} />
      {r.error && <p className="mb-4 rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">{r.error.message}</p>}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Horas extras 70%" valor={`${num(soma(l, 'he_util_h'), 1)} h`} tom="atencao" />
        <Indicador rotulo="Horas extras 100%" valor={`${num(soma(l, 'he_100_h'), 1)} h`} tom="atencao" />
        <Indicador rotulo="Custo HE + DSR" valor={reais(totalHE)} detalhe={soma(l, 'bruto') ? `${num(totalHE / soma(l, 'bruto') * 100, 1)}% da folha` : undefined} />
        <Indicador rotulo="Faltas no mês" valor={soma(l, 'faltas')} tom={soma(l, 'faltas') ? 'atraso' : 'neutro'} detalhe={`${num(soma(l, 'atraso_h'), 1)} h de atraso`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Por obra">
          {!porObra.size ? <Vazio>Sem dados.</Vazio> : <table className="tabela"><thead><tr><th>Obra</th><th className="text-right">HE (h)</th><th className="text-right">Custo</th><th className="text-right">Faltas</th></tr></thead>
            <tbody>{[...porObra].sort((a, b) => b[1].valor - a[1].valor).map(([k, o]) => <tr key={k}><td className="whitespace-nowrap">{k}</td><td className="text-right font-mono">{num(o.h70 + o.h100, 1)}</td><td className="text-right font-mono">{reais(o.valor)}</td><td className="text-right font-mono">{o.faltas}</td></tr>)}</tbody></table>}
        </Cartao>
        <Cartao titulo="Quem mais fez hora extra" className="lg:col-span-2">
          {!he.length ? <Vazio>Nenhuma hora extra no mês.</Vazio> : <div className="overflow-x-auto"><table className="tabela whitespace-nowrap"><thead><tr><th>Funcionário</th><th>Obra</th><th className="text-right">70%</th><th className="text-right">100%</th><th className="text-right">Valor + DSR</th></tr></thead>
            <tbody>{he.map((x) => <tr key={x.funcionario_id}><td><a className="link" href={`/dp/espelho?mes=${mes}&func=${x.funcionario_id}`}>{x.nome}</a></td><td className="text-xs">{x.obra_codigo}</td><td className="text-right font-mono">{num(x.he_util_h)} h</td><td className="text-right font-mono">{num(x.he_100_h)} h</td><td className="text-right font-mono">{reais(Number(x.he_util_valor) + Number(x.he_100_valor) + Number(x.dsr_he))}</td></tr>)}</tbody></table></div>}
        </Cartao>
        <Cartao titulo="Faltas e atrasos (sem atestado)" className="lg:col-span-3">
          {!ausencias.length ? <Vazio>Nenhuma falta ou atraso no mês.</Vazio> : <div className="overflow-x-auto"><table className="tabela whitespace-nowrap"><thead><tr><th>Funcionário</th><th>Obra</th><th className="text-right">Faltas</th><th className="text-right">Atrasos</th><th className="text-right">Desconto</th></tr></thead>
            <tbody>{ausencias.map((x) => <tr key={x.funcionario_id}><td><a className="link" href={`/dp/espelho?mes=${mes}&func=${x.funcionario_id}`}>{x.nome}</a></td><td className="text-xs">{x.obra_codigo}</td><td className="text-right font-mono">{x.faltas}</td><td className="text-right font-mono">{num(x.atraso_h)} h</td><td className="text-right font-mono text-atraso-700">−{reais(Number(x.desconto_faltas) + Number(x.desconto_atrasos))}</td></tr>)}</tbody></table></div>}
          <p className="mt-2 text-xs text-concreto-500">Para abonar, registre o atestado ou declaração em “Atestados”. Para corrigir uma marcação, use o lançamento manual no Ponto.</p>
        </Cartao>
      </div>
    </>
  );
}
