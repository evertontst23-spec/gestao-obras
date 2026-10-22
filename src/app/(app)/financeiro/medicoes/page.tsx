import Link from 'next/link';
import { obterSessao } from '@/lib/sessao';
import { redirect } from 'next/navigation';
import { Cabecalho, Campo, Cartao, Selo, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { Botao, FormAcao } from '@/components/formulario';
import { STATUS_BM, codBM, reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { gerarBM } from '../acoes';

export const metadata = { title: 'Medições (BM)' };

export default async function Medicoes() {
  const { supabase, perfil } = await obterSessao();
  if (!['admin', 'financeiro', 'engenheiro'].includes(perfil.papel)) redirect('/');
  const hoje = hojeISO();
  const [{ data: bms }, { data: pend }, { data: obras }] = await Promise.all([
    supabase.from('boletins_medicao').select('*, obras(codigo, nome)').order('criado_em', { ascending: false }).limit(200),
    supabase.from('v_medicoes').select('obra_id, valor, status, data').is('bm_id', null).in('status', ['validada', 'lancada']),
    supabase.from('v_financeiro_obras').select('id, codigo, nome, situacao').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
  ]);
  const gerivel = new Map<string, { validado: number; pendentes: number; desde: string }>();
  (pend ?? []).forEach((m) => {
    const g = gerivel.get(m.obra_id) ?? { validado: 0, pendentes: 0, desde: m.data };
    if (m.status === 'validada') g.validado += Number(m.valor); else g.pendentes++;
    if (m.data < g.desde) g.desde = m.data;
    gerivel.set(m.obra_id, g);
  });
  const ini = (() => { const d = new Date(hoje + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })();
  const fim = (() => { const d = new Date(hoje.slice(0, 7) + '-01T12:00:00'); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const gestorFin = ['admin', 'financeiro'].includes(perfil.papel);

  return (
    <>
      <Cabecalho titulo="Boletins de medição" sub="A medição soma o que foi executado e validado pelo engenheiro no período × preço da planilha da obra, e aplica as retenções do contrato." />
      {gestorFin && <AbasFinanceiro atual="bm" />}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao titulo="Execução pronta para medir">
            {!obras?.length ? <Vazio>Nenhuma obra ativa.</Vazio> : (
              <table className="tabela"><thead><tr><th>Obra</th><th className="text-right">Validado, não medido</th><th>Pendências</th></tr></thead>
                <tbody>{obras.map((o) => { const g = gerivel.get(o.id); return (
                  <tr key={o.id}><td><b>{o.codigo}</b> <span className="text-xs text-concreto-500">{o.nome}</span></td>
                    <td className="text-right font-mono">{reais(g?.validado ?? 0)}{g && <div className="text-xs text-concreto-500">desde {data(g.desde)}</div>}</td>
                    <td className="text-xs">{g?.pendentes ? <Link className="link" href={`/obras/${o.id}/avanco`}>{g.pendentes} lançamento(s) aguardando validação</Link> : '—'}</td></tr>); })}</tbody></table>)}
          </Cartao>
          <Cartao titulo="Boletins">
            {!bms?.length ? <Vazio>Nenhum boletim gerado.</Vazio> : (
              <div className="overflow-x-auto"><table className="tabela whitespace-nowrap">
                <thead><tr><th>BM</th><th>Obra</th><th>Período</th><th className="text-right">Bruto</th><th className="text-right">Líquido</th><th>Situação</th></tr></thead>
                <tbody>{bms.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="link font-mono" href={`/financeiro/medicoes/${b.id}`}>{codBM(b.numero)}</Link></td>
                    <td>{(b.obras as unknown as { codigo: string }).codigo}</td>
                    <td className="text-sm">{data(b.periodo_inicio)} a {data(b.periodo_fim)}</td>
                    <td className="text-right font-mono">{reais(b.valor_bruto)}</td><td className="text-right font-mono font-semibold">{reais(b.valor_liquido)}</td>
                    <td><Selo cor={STATUS_BM[b.status].cor}>{STATUS_BM[b.status].rotulo}</Selo></td>
                  </tr>))}</tbody>
              </table></div>)}
          </Cartao>
        </div>
        <Cartao titulo="Gerar boletim">
          <FormAcao acao={gerarBM} className="space-y-3">
            <Campo rotulo="Obra"><select name="obra_id" required className="entrada"><option value="">Selecionar…</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="De"><input type="date" name="inicio" required defaultValue={ini} className="entrada" /></Campo>
              <Campo rotulo="Até"><input type="date" name="fim" required defaultValue={fim} max={hoje} className="entrada" /></Campo>
            </div>
            <Campo rotulo="Observações"><textarea name="observacoes" rows={2} className="entrada" /></Campo>
            <Botao>Gerar boletim</Botao>
          </FormAcao>
          <p className="mt-3 text-xs text-concreto-500">Só entram execuções validadas e ainda não medidas. Se houver lançamentos aguardando validação no período, valide-os antes.</p>
        </Cartao>
      </div>
    </>
  );
}
