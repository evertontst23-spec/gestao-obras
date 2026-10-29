import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Indicador, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { FormAcao, Botao } from '@/components/formulario';
import { FormEstoqueEPI } from '@/components/FormEstoqueEPI';
import { definirMinimoEPI } from '../../acoes';
import { data, dataHora, hojeISO, num, somarDias } from '@/lib/formato';

export const metadata = { title: 'Estoque de EPI' };
const ORIGEM: Record<string, string> = { entrega_epi: 'Entrega na ficha', entrada_avulsa: 'Entrada', consumo: 'Saída avulsa', transferencia: 'Transferência', ajuste_inventario: 'Ajuste', recebimento_oc: 'Recebimento de OC', envio_solicitacao: 'Envio para obra' };

export default async function EstoqueEPI() {
  const { supabase, perfil } = await exigirPapel('admin', 'seguranca', 'almoxarifado', 'engenheiro', 'encarregado');
  const pode = ['admin', 'seguranca', 'almoxarifado'].includes(perfil.papel);
  const [{ data: epis }, { data: saldos }, { data: obras }] = await Promise.all([
    supabase.from('insumos').select('id, codigo, descricao, unidade, ca, ca_validade, estoque_minimo').eq('categoria', 'EPI').eq('ativo', true).order('descricao'),
    supabase.from('v_estoque').select('obra_id, insumo_id, saldo, local_nome, obra_codigo').eq('categoria', 'EPI'),
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome'),
  ]);
  const ids = (epis ?? []).map((e) => e.id);
  const { data: movs } = ids.length
    ? await supabase.from('estoque_movimentos').select('id, obra_id, insumo_id, tipo, quantidade, origem, observacao, criado_em, perfis(nome)').in('insumo_id', ids).order('criado_em', { ascending: false }).limit(30)
    : { data: [] };
  const hoje = hojeISO(), em30 = somarDias(hoje, 30);

  // colunas: locais que têm EPI (ou já tiveram movimento)
  const locais = new Map<string, string>();
  (saldos ?? []).forEach((s) => locais.set(s.obra_id ?? 'central', s.obra_codigo ?? 'Depósito'));
  const saldo = new Map<string, number>((saldos ?? []).map((s) => [`${s.obra_id ?? 'central'}:${s.insumo_id}`, Number(s.saldo)]));
  const cols = [...locais.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const nomeEpi = new Map((epis ?? []).map((e) => [e.id, `${e.descricao}`]));
  const nomeLocal = new Map<string, string>([['central', 'Depósito central'], ...(obras ?? []).map((o) => [o.id, o.codigo] as [string, string])]);

  const abaixo = (epis ?? []).filter((e) => Number(e.estoque_minimo) > 0 && cols.some(([k]) => saldo.has(`${k}:${e.id}`) && saldo.get(`${k}:${e.id}`)! < Number(e.estoque_minimo)));
  const zerados = (epis ?? []).filter((e) => cols.length && cols.every(([k]) => (saldo.get(`${k}:${e.id}`) ?? 0) <= 0));
  const semCA = (epis ?? []).filter((e) => !e.ca);
  const caVenc = (epis ?? []).filter((e) => e.ca_validade && e.ca_validade < em30);

  return (
    <>
      <Cabecalho titulo="Estoque de EPI" sub="Saldo de EPI por obra — o mesmo estoque de Suprimentos, com baixa automática a cada entrega na ficha" />
      <AbasSST atual="estoque" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="EPIs cadastrados" valor={(epis ?? []).length} />
        <Indicador rotulo="Abaixo do mínimo" valor={abaixo.length} tom={abaixo.length ? 'atraso' : 'ok'} detalhe="em alguma obra" />
        <Indicador rotulo="Sem saldo em nenhum local" valor={zerados.length} tom={zerados.length ? 'atencao' : 'ok'} />
        <Indicador rotulo="CA vencido / vence em 30 dias" valor={caVenc.length + semCA.length} tom={caVenc.length + semCA.length ? 'atencao' : 'ok'} detalhe={semCA.length ? `${semCA.length} sem CA` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Cartao titulo="Saldo por obra">
            {!(epis ?? []).length ? <Vazio>Nenhum EPI cadastrado.</Vazio> : (
              <div className="overflow-x-auto">
                <table className="tabela">
                  <thead><tr><th>EPI</th><th>CA</th>{cols.map(([k, n]) => <th key={k} className="text-right">{n}</th>)}<th className="text-right">Total</th><th className="w-36">Mínimo por obra</th></tr></thead>
                  <tbody>{(epis ?? []).map((e) => {
                    const min = Number(e.estoque_minimo);
                    const total = cols.reduce((t, [k]) => t + (saldo.get(`${k}:${e.id}`) ?? 0), 0);
                    const venc = e.ca_validade && e.ca_validade < hoje, avencer = e.ca_validade && !venc && e.ca_validade < em30;
                    return (
                      <tr key={e.id}>
                        <td className="min-w-[180px] font-semibold">{e.descricao}<div className="font-mono text-[11px] font-normal text-concreto-500">{e.codigo}</div></td>
                        <td className="whitespace-nowrap text-xs">{e.ca ? <span className="font-mono">{e.ca}</span> : <b className="text-atraso-700">sem CA</b>}
                          {e.ca_validade && <div className={venc ? 'font-bold text-atraso-700' : avencer ? 'font-semibold text-atencao-800' : 'text-concreto-500'}>{venc ? 'venceu ' : 'até '}{data(e.ca_validade)}</div>}</td>
                        {cols.map(([k]) => { if (!saldo.has(`${k}:${e.id}`)) return <td key={k} className="text-right text-concreto-300">—</td>;
                          const v = saldo.get(`${k}:${e.id}`)!;
                          return <td key={k} className={`text-right font-mono ${v <= 0 ? 'font-bold text-atraso-700' : min > 0 && v < min ? 'font-bold text-atencao-800' : ''}`}>{num(v)}</td>; })}
                        <td className="text-right font-mono font-bold">{num(total)} <span className="text-[10px] font-normal text-concreto-500">{e.unidade}</span></td>
                        <td>{pode ? (
                          <FormAcao acao={definirMinimoEPI} className="flex gap-1">
                            <input type="hidden" name="insumo_id" value={e.id} />
                            <input name="minimo" inputMode="decimal" defaultValue={min || ''} placeholder="0" className="entrada w-16 py-1" />
                            <Botao variante="secundario" className="px-2 py-1 text-xs">ok</Botao>
                          </FormAcao>) : <span className="font-mono">{num(min)}</span>}</td>
                      </tr>);
                  })}</tbody>
                </table>
                <p className="mt-2 text-xs text-concreto-500">Vermelho = acabou naquela obra • laranja = abaixo do mínimo • — = EPI nunca esteve naquela obra. O mínimo vale para cada obra onde o EPI é usado.</p>
              </div>)}
          </Cartao>

          <Cartao titulo="Últimas movimentações">
            {!(movs ?? []).length ? <Vazio>Nenhuma movimentação.</Vazio> : (
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Quando</th><th>EPI</th><th>Local</th><th className="text-right">Qtd.</th><th>Tipo</th><th>Nota / motivo</th></tr></thead>
                <tbody>{(movs ?? []).map((m) => {
                  const q = m.tipo === 'saida' ? -Math.abs(Number(m.quantidade)) : Number(m.quantidade);
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-xs">{dataHora(m.criado_em)}<div className="text-concreto-500">{(m.perfis as unknown as { nome: string })?.nome}</div></td>
                      <td className="text-xs">{nomeEpi.get(m.insumo_id)}</td>
                      <td className="text-xs">{nomeLocal.get(m.obra_id ?? 'central') ?? '—'}</td>
                      <td className={`text-right font-mono ${q < 0 ? 'text-atraso-700' : 'text-ok-700'}`}>{q > 0 ? '+' : ''}{num(q)}</td>
                      <td className="text-xs">{ORIGEM[m.origem] ?? m.origem}</td>
                      <td className="max-w-[260px] truncate text-xs" title={m.observacao ?? ''}>{m.observacao}</td>
                    </tr>);
                })}</tbody>
              </table></div>)}
          </Cartao>
        </div>

        {pode && (
          <Cartao titulo="Lançar no estoque de EPI" className="h-fit">
            <FormEstoqueEPI epis={(epis ?? []).map((e) => ({ id: e.id, rotulo: `${e.descricao}${e.ca ? ` (CA ${e.ca})` : ''}` }))}
              locais={[{ id: 'central', rotulo: 'Depósito central' }, ...(obras ?? []).map((o) => ({ id: o.id, rotulo: `${o.codigo} — ${o.nome}` }))]} />
            <p className="mt-3 text-xs text-concreto-500">A entrega ao funcionário não se lança aqui: ela sai sozinha do estoque quando é registrada na ficha de EPI.</p>
          </Cartao>)}
      </div>
    </>
  );
}
