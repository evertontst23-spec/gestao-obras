import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Vazio } from '@/components/ui';
import { AbasFinanceiro } from '@/components/AbasFinanceiro';
import { FormLancamento } from '@/components/FormLancamento';
import { BaixarCSV } from '@/components/BaixarCSV';
import { ContasPagaveis, type SGrupo } from '@/components/ContasPagaveis';
import { CATEGORIAS_FIN, ORIGEM_LANC, codLanc, reais, situacaoLanc } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';

export const metadata = { title: 'Contas a pagar e receber' };
type F = { tipo?: string; situacao?: string; obra?: string; mes?: string; restrito?: string };

export default async function Lancamentos({ searchParams }: { searchParams: Promise<F> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'financeiro');
  const hoje = hojeISO();
  // aba à parte (pró-labore dos sócios): só aparece para quem tem o acesso restrito — a trava é no banco
  const { data: ve } = await supabase.rpc('ve_restrito');
  const restrito = !!ve && sp.restrito === '1';
  const situacao = sp.situacao ?? (restrito ? 'todos' : 'abertos');
  let q = supabase.from('lancamentos').select('*, obras(codigo), fornecedores(nome, pix), pagamentos(titulo)').eq('restrito', restrito).order('vencimento').limit(1000);
  if (sp.tipo) q = q.eq('tipo', sp.tipo);
  if (sp.obra === 'adm') q = q.is('obra_id', null); else if (sp.obra) q = q.eq('obra_id', sp.obra);
  if (situacao === 'abertos') q = q.eq('status', 'aberto');
  if (situacao === 'vencidos') q = q.eq('status', 'aberto').lt('vencimento', hoje);
  if (situacao === 'liquidados') q = q.eq('status', 'liquidado');
  if (situacao === 'cancelados') q = q.eq('status', 'cancelado');
  if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
    const [a, m] = sp.mes.split('-').map(Number);
    q = q.gte('vencimento', `${sp.mes}-01`).lte('vencimento', new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10));
  }
  const [{ data: lista }, { data: obras }, { data: forn }] = await Promise.all([
    q, supabase.from('obras').select('id, codigo, nome').order('codigo'), supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome'),
  ]);
  const ls = lista ?? [];
  const tot = (t: string) => ls.filter((l) => l.tipo === t && l.status !== 'cancelado').reduce((s, l) => s + Number(l.status === 'liquidado' ? l.valor_liquidado : l.valor), 0);
  const nomeObra = (l: (typeof ls)[number]) => (l.obras as unknown as { codigo: string } | null)?.codigo ?? 'Administração';

  // agrupa as contas vindas de um mesmo pagamento (folha) sob um cabeçalho com subtotal
  type Row = (typeof ls)[number];
  const grupos: { key: string; pag: string | null; titulo: string; rows: Row[] }[] = [];
  const gidx = new Map<string, number>();
  for (const l of ls) {
    const pid = l.origem === 'folha' && l.pagamento_id ? (l.pagamento_id as string) : null;
    if (pid) {
      let gi = gidx.get(pid);
      if (gi === undefined) { gi = grupos.length; gidx.set(pid, gi); grupos.push({ key: `p:${pid}`, pag: pid, titulo: (l.pagamentos as unknown as { titulo: string } | null)?.titulo ?? 'Pagamento da folha', rows: [] }); }
      grupos[gi].rows.push(l);
    } else grupos.push({ key: `l:${l.id}`, pag: null, titulo: '', rows: [l] });
  }
  // serializa para o componente de seleção (marcar → planilha C6 → anexar comprovante → baixa em lote)
  const sGrupos: SGrupo[] = [];
  for (const g of grupos) {
    if (g.pag) {
      const vivos = g.rows.filter((l) => l.status !== 'cancelado');
      if (!vivos.length) continue;
      const sub = vivos.reduce((t, l) => t + Number(l.valor), 0);
      const venc = vivos[0].vencimento;
      const st = vivos.some((l) => l.status === 'aberto') ? situacaoLanc({ status: 'aberto', vencimento: venc, tipo: 'despesa' }, hoje)
        : vivos.every((l) => l.status === 'liquidado') ? { cor: 'bg-ok-50 text-ok-700', rotulo: 'Pago' } : { cor: 'bg-concreto-100 text-concreto-600', rotulo: '—' };
      const obrasSet = new Set(vivos.map(nomeObra));
      sGrupos.push({ kind: 'pag', key: g.key, pag: g.pag, titulo: g.titulo, count: vivos.length,
        quem: [...new Set(vivos.map((l) => l.favorecido).filter(Boolean))].join(', '),
        obra: obrasSet.size > 1 ? 'Várias' : [...obrasSet][0] as string, venc, valor: sub, cor: st.cor, rotulo: st.rotulo });
    } else {
      const l = g.rows[0];
      const forn = l.fornecedores as unknown as { nome: string; pix: string | null } | null;
      sGrupos.push({ kind: 'row', key: g.key, row: {
        id: l.id, vencimento: l.vencimento, descricao: l.descricao, numero: l.numero, categoria: l.categoria,
        origem: l.origem, tipo: l.tipo, valor: Number(l.valor), valor_liquidado: l.valor_liquidado != null ? Number(l.valor_liquidado) : null,
        status: l.status, boleto: !!l.boleto_caminho, comprovante: !!l.comprovante_caminho, pix: (l.pix as string | null) ?? null,
        fornecedor: forn?.nome ?? null, favorecido: l.favorecido, obra: nomeObra(l),
        pagavel: l.tipo === 'despesa' && l.status === 'aberto',
        temChave: !!((l.pix as string | null) || forn?.pix),
      } });
    }
  }

  // transferências de material da obra selecionada entram como custo (realocação) — só exibição, não vira conta a pagar nem mexe no caixa
  const obraSel = sp.obra && sp.obra !== 'adm' ? sp.obra : null;
  if (obraSel && !restrito && ['abertos', 'todos', 'vencidos'].includes(situacao)) {
    const { data: tr } = await supabase.from('v_transferencias')
      .select('id, criado_em, descricao, quantidade, unidade, origem_id, origem_nome, destino_id, destino_nome, valor_total')
      .or(`origem_id.eq.${obraSel},destino_id.eq.${obraSel}`).order('criado_em', { ascending: false }).limit(200);
    const tg: SGrupo[] = (tr ?? []).filter((t) => t.valor_total != null).map((t) => {
      const recebeu = t.destino_id === obraSel;
      return { kind: 'transf' as const, key: `t:${t.id}`, venc: t.criado_em as string,
        material: `${Number(t.quantidade).toLocaleString('pt-BR')} ${t.unidade} — ${t.descricao}`,
        fluxo: `${t.origem_nome} → ${t.destino_nome}`, obra: (recebeu ? t.destino_nome : t.origem_nome) as string,
        valor: Number(t.valor_total), recebeu };
    });
    sGrupos.unshift(...tg);
  }

  return (
    <>
      <Cabecalho titulo={restrito ? 'Pró-labore dos sócios' : 'Contas a pagar e receber'}
        sub={restrito ? '🔒 Lançamentos restritos: só os usuários autorizados enxergam. Não aparecem na lista geral nem para os outros usuários.' : undefined}
        acoes={<BaixarCSV nome={`lancamentos-${hoje}`} cabecalho={['Nº', 'Tipo', 'Categoria', 'Descrição', 'Obra', 'Fornecedor/Pagador', 'Competência', 'Vencimento', 'Valor', 'Situação', 'Baixa em', 'Valor baixado', 'Origem']}
          linhas={ls.map((l) => [codLanc(l.numero), l.tipo, CATEGORIAS_FIN[l.categoria], l.descricao, nomeObra(l), (l.fornecedores as unknown as { nome: string } | null)?.nome ?? l.favorecido, data(l.competencia), data(l.vencimento), Number(l.valor), situacaoLanc(l, hoje).rotulo, l.liquidado_em ? data(l.liquidado_em) : '', l.valor_liquidado ? Number(l.valor_liquidado) : null, ORIGEM_LANC[l.origem]])} />} />
      <AbasFinanceiro atual={restrito ? 'restrito' : 'lanc'} />
      <form className="mb-4 flex flex-wrap gap-2">
        {restrito && <input type="hidden" name="restrito" value="1" />}
        <select name="tipo" defaultValue={sp.tipo ?? ''} className="entrada w-auto"><option value="">Pagar e receber</option><option value="despesa">A pagar</option><option value="receita">A receber</option></select>
        <select name="situacao" defaultValue={situacao} className="entrada w-auto"><option value="abertos">Em aberto</option><option value="vencidos">Vencidos</option><option value="liquidados">Pagos/recebidos</option><option value="cancelados">Cancelados</option><option value="todos">Todos</option></select>
        <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto"><option value="">Todas as obras</option><option value="adm">Administração central</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select>
        <input type="month" name="mes" defaultValue={sp.mes ?? ''} className="entrada w-auto" title="Mês de vencimento" />
        <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {!ls.length ? <Vazio>Nenhum lançamento com esses filtros.</Vazio>
            : <ContasPagaveis grupos={sGrupos} totReceita={tot('receita')} totDespesa={tot('despesa')} />}
        </div>
        <Cartao titulo={restrito ? 'Novo lançamento restrito' : 'Novo lançamento'}>
          <FormLancamento obras={obras ?? []} fornecedores={forn ?? []} hoje={hoje} restrito={restrito} />
          <p className="mt-3 text-xs text-concreto-500">{restrito ? 'Tudo o que for lançado nesta aba fica restrito (ex.: pró-labore). Informe o sócio na descrição. ' : ''}Compras (OC), folha e medições entram automaticamente — lance aqui o restante (aluguéis, terceirizados, contas da administração).</p>
        </Cartao>
      </div>
    </>
  );
}
