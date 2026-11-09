import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { COR_BENEFICIO, Icone, TagBeneficio } from '@/components/Icone';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP, mesAtual, nomeMes } from '@/components/AbasDP';
import { Botao, FormAcao } from '@/components/formulario';
import { BotaoImprimir } from '@/components/BotaoImprimir';
import { reais } from '@/lib/dominio';
import { data, dataHora } from '@/lib/formato';
import { recebedoresBeneficios } from '@/lib/c6/beneficios';
import { hojeISO } from '@/lib/formato';
import { aplicarDiasTodos, criarMesBeneficios, marcarExportadosPagos, marcarPagoBeneficio, removerLinhaBeneficio, salvarLinhaBeneficio, salvarPixEmpresa, situacaoMesBeneficios } from './acoes';

export const metadata = { title: 'Benefícios' };
const TIPOS = [['alimentacao', 'Alimentação'], ['passagem', 'Passagem']] as const;
const ADIC: Record<string, { rotulo: string; cor: string }> = {
  retroativo: { rotulo: 'Retroativo', cor: 'bg-atencao-50 text-atencao-800' },
  credito: { rotulo: 'Crédito', cor: 'bg-sky-50 text-sky-800' },
};
const nf = (v: unknown) => String(Number(v)).replace('.', ',');
type Linha = { id: number; obra_id: string | null; funcionario_id: string; tipo: string; dias: number; dias_retroativos: number; adicional_tipo: string;
  dias_desconto: number; qtd_dia: number; valor_unitario: number; valor_total: number; observacao: string | null; pago_em: string | null; pago_para: string | null; valor_pago: number;
  funcionarios: { nome: string; ativo: boolean; data_demissao: string | null; pix: string | null; banco: string | null; empregador_id: string | null; funcoes: { nome: string } | null;
    empregadores: { nome: string; pix: string | null; banco: string | null; beneficios_via_empresa: boolean } | null } | null };

export default async function Beneficios({ searchParams }: { searchParams: Promise<{ mes?: string; obra?: string; tipo?: string; ver?: string; emp?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const pode = ['admin', 'rh'].includes(perfil.papel);
  const podePagar = ['admin', 'rh', 'financeiro'].includes(perfil.papel);
  const { data: comps } = await supabase.from('beneficio_competencias').select('*').order('competencia', { ascending: false });
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : (comps?.[0]?.competencia?.slice(0, 7) ?? mesAtual());
  const comp = (comps ?? []).find((c) => c.competencia.slice(0, 7) === mes);
  const filtro = sp.tipo === 'alimentacao' || sp.tipo === 'passagem' ? sp.tipo : null;
  const [{ data: linhasRaw }, { data: obras }, { data: funcs }] = await Promise.all([
    comp ? supabase.from('beneficio_linhas').select('*, funcionarios(nome, ativo, data_demissao, pix, banco, empregador_id, funcoes(nome), empregadores(nome, pix, banco, beneficios_via_empresa))').eq('competencia_id', comp.id) : Promise.resolve({ data: [] }),
    supabase.from('obras').select('id, codigo, nome').order('codigo'),
    supabase.from('funcionarios').select('id, nome, obra_id').eq('ativo', true).is('data_demissao', null).order('nome'),
  ]);
  const todas = ((linhasRaw ?? []) as unknown as Linha[]).sort((a, b) => (a.funcionarios?.nome ?? '').localeCompare(b.funcionarios?.nome ?? ''));
  const linhas = todas.filter((l) => !filtro || l.tipo === filtro);
  const editavel = pode && comp?.status === 'aberta';
  const { recebedores } = comp && podePagar ? await recebedoresBeneficios(supabase, mes) : { recebedores: [] };
  const comChave = recebedores.filter((r) => r.chave); const semChave = recebedores.filter((r) => !r.chave);
  const nomeObra = new Map((obras ?? []).map((o) => [o.id, o.nome]));
  const codObra = new Map((obras ?? []).map((o) => [o.id, o.codigo]));
  const grupos = new Map<string, Linha[]>();
  todas.forEach((l) => { const k = l.obra_id ?? 'sem'; grupos.set(k, [...(grupos.get(k) ?? []), l]); });
  const ordem = [...grupos.keys()].sort((a, b) => (nomeObra.get(a) ?? 'zz').localeCompare(nomeObra.get(b) ?? 'zz'));
  const porEmp = sp.ver === 'empresa';
  const empDe = (l: Linha) => l.funcionarios?.empregador_id ?? 'sem';
  const nomeEmp = new Map<string, string>();
  todas.forEach((l) => nomeEmp.set(empDe(l), l.funcionarios?.empregadores?.nome ?? 'Sem empresa'));
  const gruposEmp = new Map<string, Linha[]>();
  todas.forEach((l) => { const k = empDe(l); gruposEmp.set(k, [...(gruposEmp.get(k) ?? []), l]); });
  const ordemEmp = [...gruposEmp.keys()].sort((a, b) => (nomeEmp.get(a) ?? '').localeCompare(nomeEmp.get(b) ?? ''));
  const empSel = porEmp && sp.emp && gruposEmp.has(sp.emp) ? sp.emp : null;
  const obraSel = !porEmp && sp.obra && (grupos.has(sp.obra) || (obras ?? []).some((o) => o.id === sp.obra)) ? sp.obra : null;
  const soma = (ls: Linha[], t?: string) => ls.filter((l) => (!t || l.tipo === t) && (!filtro || l.tipo === filtro)).reduce((s, l) => s + Number(l.valor_total), 0);
  const pessoas = (ls: Linha[]) => new Set(ls.filter((l) => !filtro || l.tipo === filtro).map((l) => l.funcionario_id)).size;
  const url = (o: { obra?: string | null; tipo?: string | null; ver?: 'obra' | 'empresa'; emp?: string | null }) => {
    const q = new URLSearchParams({ mes });
    const v = o.ver ?? (porEmp ? 'empresa' : 'obra'); const mudou = v !== (porEmp ? 'empresa' : 'obra');
    const ob = mudou ? null : o.obra === undefined ? obraSel : o.obra; const tp = o.tipo === undefined ? filtro : o.tipo;
    const em = mudou ? null : o.emp === undefined ? empSel : o.emp;
    if (v === 'empresa') q.set('ver', 'empresa');
    if (ob && v === 'obra') q.set('obra', ob); if (em && v === 'empresa') q.set('emp', em); if (tp) q.set('tipo', tp);
    return `/dp/beneficios?${q.toString()}`;
  };
  const chip = (ativo: boolean) => `rounded-md border px-3 py-1.5 text-sm font-semibold ${ativo ? 'border-sinal-500 bg-sinal-500 text-white' : 'border-concreto-300 bg-white text-concreto-700 hover:border-sinal-400'}`;
  const extras = linhas.filter((l) => Number(l.dias_retroativos) > 0 && (!obraSel || l.obra_id === obraSel) && (!empSel || empDe(l) === empSel));
  const tiposVisiveis = TIPOS.filter(([t]) => !filtro || t === filtro);

  const DiasTodos = ({ obra, rotulo }: { obra: string | null; rotulo: string }) => editavel && comp ? (
    <FormAcao acao={aplicarDiasTodos} className="flex flex-wrap items-center gap-2 rounded-md border border-sinal-300 bg-sinal-50 px-3 py-2 text-sm">
      <input type="hidden" name="competencia_id" value={comp.id} /><input type="hidden" name="obra_id" value={obra ?? ''} />
      <b className="inline-flex items-center gap-1 text-sinal-800"><Icone nome="espelho" />{rotulo}:</b>
      <input name="dias" inputMode="decimal" defaultValue={comp.dias_uteis} className="entrada w-16 py-1" aria-label="Dias" />
      <span>dias de</span>
      <select name="tipo" defaultValue={filtro ?? 'todos'} className="entrada w-auto py-1"><option value="todos">alimentação e passagem</option><option value="alimentacao">só alimentação</option><option value="passagem">só passagem</option></select>
      <Botao variante="secundario" className="px-3 py-1 text-xs">Aplicar para todos</Botao>
      <span className="text-xs text-concreto-500">(retroativos, créditos e faltas continuam como estão)</span>
    </FormAcao>) : null;

  return (
    <>
      <Cabecalho titulo="Benefícios" sub="Alimentação e passagem do mês por obra — dias, retroativos/créditos, faltas e valores editáveis."
        acoes={<BotaoImprimir rotulo="Imprimir / PDF" />} />
      <AbasDP atual="benef" />

      {/* mês */}
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-concreto-600">Mês:</span>
        {(comps ?? []).map((c) => (
          <Link key={c.id} href={`/dp/beneficios?mes=${c.competencia.slice(0, 7)}`} className={`${chip(c.competencia.slice(0, 7) === mes)} capitalize`}>
            {nomeMes(c.competencia.slice(0, 7))}{c.status === 'fechada' && <Icone nome="cadeado" className="ml-1 inline h-3 w-3" />}</Link>))}
        {pode && (
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-dashed border-concreto-400 px-3 py-1.5 font-semibold text-concreto-600">+ novo mês</summary>
            <FormAcao acao={criarMesBeneficios} className="absolute z-10 mt-2 flex w-72 flex-col gap-2 rounded-md border border-concreto-200 bg-white p-3 shadow">
              <Campo rotulo="Mês"><input type="month" name="mes" required className="entrada" /></Campo>
              <Campo rotulo="Dias úteis"><input name="dias_uteis" required inputMode="numeric" className="entrada" /></Campo>
              <Botao>Criar</Botao>
            </FormAcao>
          </details>)}
      </div>

      {!comp ? <Vazio>Nenhum mês de benefícios lançado ainda.</Vazio> : (<>
        <h2 className="so-imprimir mb-2 text-lg font-bold capitalize">Benefícios — {nomeMes(mes)}{obraSel ? ` — ${nomeObra.get(obraSel)}` : ''}{empSel ? ` — ${nomeEmp.get(empSel)}` : ''}{filtro ? ` (${filtro === 'passagem' ? 'passagem' : 'alimentação'})` : ''}</h2>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Indicador rotulo={filtro ? `Total (${filtro === 'passagem' ? 'passagem' : 'alimentação'})` : 'Total do mês'} valor={reais(soma(todas))} tom="sinal" />
          <Indicador rotulo="Alimentação" valor={reais(soma(todas, 'alimentacao'))} />
          <Indicador rotulo="Passagem" valor={reais(soma(todas, 'passagem'))} />
          <Indicador rotulo="Funcionários" valor={pessoas(todas)} detalhe={`${comp.dias_uteis} dias úteis`} />
        </div>

        {/* situação do mês */}
        <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Selo cor={comp.status === 'fechada' ? 'bg-ok-50 text-ok-700' : 'bg-atencao-50 text-atencao-800'}>{comp.status === 'fechada' ? <span className="inline-flex items-center gap-1"><Icone nome="cadeado" className="h-3 w-3" />Fechado {dataHora(comp.fechado_em)}</span> : 'Aberto para edição'}</Selo>
          {pode && comp.status === 'aberta' && (
            <FormAcao acao={situacaoMesBeneficios} className="flex items-center gap-2">
              <input type="hidden" name="competencia_id" value={comp.id} />
              <span className="text-xs text-concreto-500">Dias úteis do mês</span>
              <input name="dias_uteis" inputMode="numeric" defaultValue={comp.dias_uteis} className="entrada w-14 py-1" />
              <Botao variante="secundario" name="acao" value="dias" className="px-3 py-1 text-xs">Salvar</Botao>
              <Botao variante="sucesso" name="acao" value="fechar" className="px-3 py-1 text-xs"><span className="inline-flex items-center gap-1"><Icone nome="cadeado" className="h-3.5 w-3.5" />Fechar mês</span></Botao>
            </FormAcao>)}
          {perfil.papel === 'admin' && comp.status === 'fechada' && (
            <FormAcao acao={situacaoMesBeneficios}><input type="hidden" name="competencia_id" value={comp.id} />
              <Botao variante="secundario" name="acao" value="reabrir" className="px-3 py-1 text-xs">Reabrir para editar</Botao></FormAcao>)}
          {comp.observacoes && <span className="text-xs text-concreto-500">{comp.observacoes}</span>}
        </div>

        {/* filtros */}
        <div className="nao-imprimir mb-5 space-y-2 rounded-lg border border-concreto-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-semibold text-concreto-600">Separar por:</span>
            <Link href={url({ ver: 'obra' })} className={chip(!porEmp)}>Obra (centro de custo)</Link>
            <Link href={url({ ver: 'empresa' })} className={chip(porEmp)}>Empresa / instituto</Link>
          </div>
          {porEmp ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm font-semibold text-concreto-600">Empresa:</span>
              <Link href={url({ emp: null })} className={chip(!empSel)}>Resumo de todas</Link>
              {ordemEmp.map((k) => (
                <Link key={k} href={url({ emp: k })} className={chip(empSel === k)}>{nomeEmp.get(k)} <span className="font-mono text-xs opacity-80">{reais(soma(gruposEmp.get(k)!))}</span></Link>))}
            </div>
          ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-semibold text-concreto-600">Obra:</span>
            <Link href={url({ obra: null })} className={chip(!obraSel)}>Resumo de todas</Link>
            {ordem.map((k) => (
              <Link key={k} href={url({ obra: k })} className={chip(obraSel === k)}>
                {nomeObra.get(k) ?? 'Sem obra'} <span className="font-mono text-xs opacity-80">{reais(soma(grupos.get(k)!))}</span></Link>))}
            {editavel && (
              <form action="/dp/beneficios" className="flex items-center gap-1">
                <input type="hidden" name="mes" value={mes} />{filtro && <input type="hidden" name="tipo" value={filtro} />}
                <select name="obra" className="entrada w-auto py-1.5 text-sm" defaultValue=""><option value="" disabled>+ outra obra…</option>
                  {(obras ?? []).filter((o) => !grupos.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select>
                <button className="rounded-md border border-concreto-300 bg-white px-2 py-1.5 text-sm font-semibold">abrir</button>
              </form>)}
          </div>)}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm font-semibold text-concreto-600">Benefício:</span>
            <Link href={url({ tipo: null })} className={chip(!filtro)}>Mostrar tudo</Link>
            <Link href={url({ tipo: 'alimentacao' })} className={chip(filtro === 'alimentacao')}><span className="inline-flex items-center gap-1"><Icone nome="alimentacao" className="h-3.5 w-3.5" />Só alimentação</span></Link>
            <Link href={url({ tipo: 'passagem' })} className={chip(filtro === 'passagem')}><span className="inline-flex items-center gap-1"><Icone nome="passagem" className="h-3.5 w-3.5" />Só passagem</span></Link>
          </div>
        </div>

        {podePagar && (
          <Cartao titulo="Exportar para o C6 Bank — Pix em massa" className="nao-imprimir mb-5">
            {!recebedores.length ? <p className="flex items-center gap-1 text-sm text-ok-700"><Icone nome="ok" />Todos os benefícios deste mês já estão marcados como pagos.</p> : (<>
              <div className="flex flex-wrap items-end gap-3">
                <form action="/dp/beneficios/c6" method="get" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="mes" value={mes} />
                  <Campo rotulo="Data do pagamento"><input type="date" name="data" defaultValue={hojeISO()} min={hojeISO()} className="entrada" /></Campo>
                  <button disabled={!comChave.length} className="rounded-md bg-teal-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
              <span className="inline-flex items-center gap-1.5"><Icone nome="baixar" />Baixar planilha do C6 ({comChave.length} Pix • {reais(comChave.reduce((t, r) => t + r.valor, 0))})</span></button>
                </form>
                {comChave.length > 0 && (
                  <FormAcao acao={marcarExportadosPagos}>
                    <input type="hidden" name="linhas_emp" value={comChave.filter((r) => r.tipo === 'empresa').flatMap((r) => r.linhas).join(',')} />
                    <input type="hidden" name="linhas_func" value={comChave.filter((r) => r.tipo === 'funcionario').flatMap((r) => r.linhas).join(',')} />
                    <Botao variante="secundario">Depois de enviar no C6: marcar esses Pix como enviados</Botao>
                  </FormAcao>)}
              </div>
              <p className="mt-2 text-xs text-concreto-500">Modelo oficial do C6 (aba “PIX chave ou código”). Entram só os benefícios ainda não pagos de quem tem chave Pix. IDERES, FÊNIX, Mundial e A2 vão num Pix só para a empresa. Celular sai no formato +55; CPF só com números.</p>
              <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Ver quem vai na planilha ({comChave.length}){semChave.length ? ` • ${semChave.length} sem chave Pix` : ''}</summary>
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <ul className="divide-y divide-concreto-100 text-sm">{comChave.map((r) => (
                    <li key={r.tipo + r.id} className="flex justify-between gap-2 py-1"><span>{r.nome}{r.tipo === 'empresa' && <span className="text-xs text-concreto-500"> (empresa • {r.pessoas.length} func.)</span>}
                      <span className="block font-mono text-xs text-concreto-500">{r.chave} • {r.tipoChave}</span></span><b className="font-mono">{reais(r.valor)}</b></li>))}</ul>
                  {semChave.length > 0 && (
                    <div><p className="mb-1 text-sm font-semibold text-atraso-700">Ficam de fora (sem chave Pix ou chave inválida):</p>
                      <ul className="divide-y divide-concreto-100 text-sm">{semChave.map((r) => (
                        <li key={r.tipo + r.id} className="flex justify-between gap-2 py-1"><span>{r.nome}{r.tipo === 'empresa' && ' (empresa)'}{r.pixOriginal && <span className="block text-xs text-atraso-700">chave “{r.pixOriginal}” não reconhecida</span>}</span><b className="font-mono">{reais(r.valor)}</b></li>))}</ul></div>)}
                </div>
              </details>
            </>)}
          </Cartao>)}

        {porEmp && (() => {
          const grupoPag = (empSel ? [empSel] : ordemEmp).map((k) => ({ k, ls: (gruposEmp.get(k) ?? []).filter((l) => Number(l.valor_total) > 0) }));
          const viaEmp = (ls: Linha[]) => !!ls[0]?.funcionarios?.empregadores?.beneficios_via_empresa;
          const falta = (l: Linha) => Math.round((Number(l.valor_total) - Number(l.valor_pago ?? 0)) * 100) / 100;
          const totPend = grupoPag.reduce((t, g) => t + g.ls.reduce((s, l) => s + Math.max(falta(l), 0), 0), 0);
          const totPago = grupoPag.reduce((t, g) => t + g.ls.reduce((s, l) => s + Number(l.valor_pago ?? 0), 0), 0);
          const BotaoPago = ({ ls, para, rotulo }: { ls: Linha[]; para: 'empresa' | 'funcionario'; rotulo: string }) => {
            const pend = ls.filter((l) => falta(l) > 0); const pagos = ls.filter((l) => l.pago_em);
            const vPend = pend.reduce((s, l) => s + falta(l), 0);
            if (!podePagar) return pend.length ? <Selo cor="bg-atencao-50 text-atencao-800">pendente</Selo> : <Selo cor="bg-ok-50 text-ok-700"><span className="inline-flex items-center gap-1"><Icone nome="ok" className="h-3 w-3" />enviado</span></Selo>;
            return pend.length ? (
              <FormAcao acao={marcarPagoBeneficio} className="flex items-center gap-2"><input type="hidden" name="linhas" value={pend.map((l) => l.id).join(',')} /><input type="hidden" name="pago" value="1" /><input type="hidden" name="para" value={para} />
                {pagos.length > 0 && <span className="text-[11px] text-atencao-800">falta {reais(vPend)}</span>}
                <Botao variante="sucesso" className="px-3 py-1 text-xs">{rotulo}</Botao></FormAcao>
            ) : (
              <FormAcao acao={marcarPagoBeneficio} className="flex items-center gap-2"><input type="hidden" name="linhas" value={pagos.map((l) => l.id).join(',')} /><input type="hidden" name="pago" value="0" />
                <Selo cor="bg-ok-50 text-ok-700"><span className="inline-flex items-center gap-1"><Icone nome="ok" className="h-3 w-3" />Pix enviado {dataHora(pagos[0]?.pago_em).slice(0, 8)}</span></Selo>
                <button className="text-[11px] text-concreto-500 hover:underline">desfazer</button></FormAcao>);
          };
          return (
            <Cartao titulo="Pagamento dos benefícios (Pix)" className="mb-5" acoes={<span className="text-sm">pendente <b className="font-mono">{reais(totPend)}</b> • enviado <b className="font-mono text-ok-700">{reais(totPago)}</b></span>}>
              <div className="space-y-4">{grupoPag.filter((g) => g.ls.length).map(({ k, ls }) => {
                const emp = ls[0]?.funcionarios?.empregadores;
                if (viaEmp(ls)) {
                  return (
                    <div key={k} className="rounded-lg border border-concreto-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span><b>{nomeEmp.get(k)}</b> — Pix para a empresa, que repassa aos {pessoas(ls)} funcionários
                          <span className="block text-xs text-concreto-500">{emp?.pix ? <>Chave: <b className="font-mono text-concreto-800">{emp.pix}</b>{emp.banco ? ` • ${emp.banco}` : ''}</> : 'Chave Pix da empresa não cadastrada'}</span></span>
                        <span className="flex items-center gap-3"><b className="font-mono text-lg">{reais(ls.reduce((s, l) => s + Number(l.valor_total), 0))}</b><BotaoPago ls={ls} para="empresa" rotulo="Marcar Pix enviado" /></span>
                      </div>
                      <div className="mt-1 text-xs text-concreto-500">{[...new Set(ls.map((l) => l.funcionarios?.nome))].join(', ')}</div>
                      {podePagar && (
                        <details className="mt-1"><summary className="cursor-pointer text-[11px] font-semibold text-sinal-700">{emp?.pix ? 'alterar chave Pix' : 'cadastrar chave Pix da empresa'}</summary>
                          <FormAcao acao={salvarPixEmpresa} className="mt-1 flex flex-wrap items-end gap-2"><input type="hidden" name="empregador_id" value={k} />
                            <input name="pix" defaultValue={emp?.pix ?? ''} placeholder="Chave Pix" className="entrada w-56 py-1" />
                            <input name="banco" defaultValue={emp?.banco ?? ''} placeholder="Banco" className="entrada w-32 py-1" />
                            <Botao variante="secundario" className="px-3 py-1 text-xs">Salvar</Botao></FormAcao></details>)}
                    </div>);
                }
                const porPessoa = new Map<string, Linha[]>();
                ls.forEach((l) => porPessoa.set(l.funcionario_id, [...(porPessoa.get(l.funcionario_id) ?? []), l]));
                return (
                  <div key={k} className="rounded-lg border border-concreto-200 p-3">
                    <div className="mb-2 flex items-center justify-between"><b>{nomeEmp.get(k)} — Pix direto para cada funcionário</b><b className="font-mono text-lg">{reais(ls.reduce((s, l) => s + Number(l.valor_total), 0))}</b></div>
                    <div className="divide-y divide-concreto-100">{[...porPessoa.values()].sort((a, b) => (a[0].funcionarios?.nome ?? '').localeCompare(b[0].funcionarios?.nome ?? '')).map((lp) => {
                      const f = lp[0].funcionarios;
                      return (
                        <div key={lp[0].funcionario_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                          <span className="min-w-0"><b>{f?.nome}</b> <span className="text-xs text-concreto-500">{codObra.get(lp[0].obra_id ?? '') ?? 'escritório'}</span>
                            <span className="block text-xs">{f?.pix ? <>Pix: <b className="font-mono">{f.pix}</b>{f.banco ? ` • ${f.banco}` : ''}</> : <span className="text-atraso-700">sem Pix cadastrado{f?.banco ? ` (banco: ${f.banco})` : ''}</span>}</span></span>
                          <span className="flex items-center gap-3"><b className="font-mono">{reais(lp.reduce((s, l) => s + Number(l.valor_total), 0))}</b><BotaoPago ls={lp} para="funcionario" rotulo="Pago" /></span>
                        </div>);
                    })}</div>
                  </div>);
              })}</div>
              <p className="mt-2 text-xs text-concreto-500">IDERES, FÊNIX, Mundial e A2: o Pix vai para a empresa, que paga os funcionários. CAD: Pix direto para cada um. O Pix do funcionário se cadastra no cadastro dele.</p>
            </Cartao>);
        })()}

        <div className="space-y-5">
          {!obraSel && !empSel && <DiasTodos obra={null} rotulo="Todas as obras" />}

          {(obraSel || empSel) && (() => {
            const k = obraSel ?? ''; const ls = empSel ? gruposEmp.get(empSel) ?? [] : grupos.get(k) ?? [];
            return (
              <Cartao titulo={empSel ? `${nomeEmp.get(empSel)} — todas as obras` : `${codObra.get(k) ?? ''} — ${nomeObra.get(k) ?? 'Sem obra'}`}>
                {obraSel && <div className="mb-4"><DiasTodos obra={k} rotulo="Dias para todos desta obra" /></div>}
                {!ls.length && <p className="mb-2 text-sm text-concreto-500">Nenhum benefício lançado nesta obra ainda.</p>}
                <div className="space-y-6">{tiposVisiveis.map(([t, rotulo]) => {
                  const lt = ls.filter((l) => l.tipo === t).sort((a, b) => empSel ? (codObra.get(a.obra_id ?? '') ?? 'zz').localeCompare(codObra.get(b.obra_id ?? '') ?? 'zz') || (a.funcionarios?.nome ?? '').localeCompare(b.funcionarios?.nome ?? '') : 0);
                  if (!lt.length) return null;
                  const g = 'grid grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1.5fr)_60px_150px_60px_84px_104px_minmax(0,1fr)_auto]';
                  return (
                    <section key={t}>
                      <div className={`mb-2 flex items-center justify-between border-b-2 pb-1 ${t === 'passagem' ? 'border-sky-200' : 'border-amber-200'}`}>
                        <h3 className={`flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${COR_BENEFICIO[t].texto}`}><Icone nome={t} />{rotulo} <span className="font-normal normal-case text-concreto-500">({lt.length})</span></h3>
                        <b className="font-mono">{reais(lt.reduce((s, l) => s + Number(l.valor_total), 0))}</b>
                      </div>
                      <div className={`${g} mb-1 hidden text-[11px] font-semibold uppercase tracking-wide text-concreto-400 sm:grid`}>
                        <span>Funcionário</span><span>Dias</span><span>+ Retroativo / crédito</span><span>− Faltas</span><span>R$ / dia</span><span className="text-right">Total</span><span>Obs.</span><span />
                      </div>
                      <div className="divide-y divide-concreto-100">{lt.map((l) => {
                        const ex = Number(l.dias_retroativos) > 0;
                        return (
                          <div key={l.id} className="py-1.5">
                            {editavel ? (
                              <FormAcao acao={salvarLinhaBeneficio} className={g}>
                                <input type="hidden" name="competencia_id" value={comp.id} /><input type="hidden" name="funcionario_id" value={l.funcionario_id} />
                                <input type="hidden" name="obra_id" value={l.obra_id ?? ''} /><input type="hidden" name="tipo" value={l.tipo} />
                                <input type="hidden" name="qtd_dia" value={String(l.qtd_dia)} />
                                <span className="col-span-2 text-sm font-semibold sm:col-span-1">{l.funcionarios?.nome}
                                  {ex && <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${ADIC[l.adicional_tipo].cor}`}>{ADIC[l.adicional_tipo].rotulo} +{nf(l.dias_retroativos)}</span>}
                                  <span className="block text-[11px] font-normal text-concreto-500">{l.funcionarios && !l.funcionarios.ativo && <b className="text-atraso-700">desligado {l.funcionarios.data_demissao ? data(l.funcionarios.data_demissao).slice(0, 5) : ''} • </b>}{l.funcionarios?.funcoes?.nome}{empSel ? ` • ${codObra.get(l.obra_id ?? '') ?? 'sem obra'}` : ` • ${l.funcionarios?.empregadores?.nome ?? ''}`}</span></span>
                                <input name="dias" inputMode="decimal" defaultValue={nf(l.dias)} className="entrada px-2 py-1" aria-label="Dias" />
                                <span className="flex gap-1">
                                  <input name="dias_retroativos" inputMode="decimal" defaultValue={nf(l.dias_retroativos)} className="entrada w-12 px-2 py-1" aria-label="Dias a mais" />
                                  <select name="adicional_tipo" defaultValue={l.adicional_tipo} className="entrada px-1 py-1 text-xs" aria-label="Tipo"><option value="retroativo">retroativo</option><option value="credito">crédito</option></select>
                                </span>
                                <input name="dias_desconto" inputMode="decimal" defaultValue={nf(l.dias_desconto)} className="entrada px-2 py-1" aria-label="Faltas" />
                                <input name="valor_unitario" inputMode="decimal" defaultValue={Number(l.valor_unitario).toFixed(2).replace('.', ',')} className="entrada px-2 py-1" aria-label="Valor" />
                                <span className="text-right font-mono text-sm font-bold">{reais(l.valor_total)}</span>
                                <input name="observacao" defaultValue={l.observacao ?? ''} className="entrada px-2 py-1 text-xs" aria-label="Observação" />
                                <span className="flex items-center gap-1">
                                  <Botao variante="secundario" className="px-2 py-1 text-xs">Salvar</Botao>
                                </span>
                              </FormAcao>
                            ) : (
                              <div className={`${g} text-sm`}>
                                <span className="col-span-2 font-semibold sm:col-span-1">{l.funcionarios?.nome}{ex && <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${ADIC[l.adicional_tipo].cor}`}>{ADIC[l.adicional_tipo].rotulo} +{nf(l.dias_retroativos)}</span>}</span>
                                <span>{nf(l.dias)}</span><span>{ex ? `+${nf(l.dias_retroativos)} ${ADIC[l.adicional_tipo].rotulo.toLowerCase()}` : '—'}</span><span>{Number(l.dias_desconto) ? `−${nf(l.dias_desconto)}` : '—'}</span>
                                <span>{reais(Number(l.valor_unitario) * Number(l.qtd_dia))}</span>
                                <span className="text-right font-mono font-bold">{reais(l.valor_total)}</span><span className="text-xs text-concreto-500">{l.observacao}</span><span />
                              </div>)}
                            {editavel && (
                              <FormAcao acao={removerLinhaBeneficio} className="nao-imprimir text-right"><input type="hidden" name="linha" value={l.id} />
                                <button className="text-[11px] text-atraso-700 hover:underline">remover</button></FormAcao>)}
                          </div>);
                      })}</div>
                    </section>);
                })}</div>
                <div className="mt-4 flex flex-wrap justify-end gap-4 rounded-md bg-concreto-50 px-3 py-2 text-sm">
                  {!filtro && <><span className="inline-flex items-center gap-1.5"><TagBeneficio tipo="alimentacao" /><b className="font-mono">{reais(soma(ls, 'alimentacao'))}</b></span>
                    <span className="inline-flex items-center gap-1.5"><TagBeneficio tipo="passagem" /><b className="font-mono">{reais(soma(ls, 'passagem'))}</b></span></>}
                  <span>Total {empSel ? 'da empresa' : 'da obra'} ({pessoas(ls)} pessoas): <b className="font-mono text-base">{reais(soma(ls))}</b></span>
                </div>
                {editavel && obraSel && (
                  <details className="nao-imprimir mt-3 rounded-md border border-dashed border-sinal-400">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-sinal-700">+ Incluir funcionário / benefício nesta obra</summary>
                    <FormAcao acao={salvarLinhaBeneficio} limparAoConcluir className="grid gap-2 border-t border-concreto-100 p-3 sm:grid-cols-4">
                      <input type="hidden" name="competencia_id" value={comp.id} /><input type="hidden" name="obra_id" value={k === 'sem' ? '' : k} />
                      <Campo rotulo="Funcionário" className="sm:col-span-2"><select name="funcionario_id" required className="entrada"><option value="">Selecionar…</option>
                        {(funcs ?? []).slice().sort((a, b) => Number(b.obra_id === k) - Number(a.obra_id === k)).map((f) => <option key={f.id} value={f.id}>{f.nome}{f.obra_id !== k ? ' (outra obra)' : ''}</option>)}</select></Campo>
                      <Campo rotulo="Benefício"><select name="tipo" defaultValue={filtro ?? 'alimentacao'} className="entrada"><option value="alimentacao">Alimentação</option><option value="passagem">Passagem</option></select></Campo>
                      <Campo rotulo="Dias"><input name="dias" defaultValue={comp.dias_uteis} inputMode="decimal" className="entrada" /></Campo>
                      <Campo rotulo="+ Dias a mais"><input name="dias_retroativos" defaultValue="0" inputMode="decimal" className="entrada" /></Campo>
                      <Campo rotulo="São"><select name="adicional_tipo" className="entrada"><option value="retroativo">retroativo</option><option value="credito">crédito</option></select></Campo>
                      <Campo rotulo="− Faltas"><input name="dias_desconto" defaultValue="0" inputMode="decimal" className="entrada" /></Campo>
                      <input type="hidden" name="qtd_dia" value="1" />
                      <Campo rotulo="Valor por dia (R$)" dica="Passagem: total do dia (ex.: 4 × 4,50 = 18,00)"><input name="valor_unitario" required inputMode="decimal" placeholder="22,82" className="entrada" /></Campo>
                      <Campo rotulo="Observação" className="sm:col-span-2"><input name="observacao" className="entrada" /></Campo>
                      <div className="flex items-end"><Botao>Incluir</Botao></div>
                    </FormAcao>
                  </details>)}
              </Cartao>);
          })()}

          {extras.length > 0 && (
            <Cartao titulo={`Retroativos e créditos (${extras.length})`}>
              <table className="tabela">
                <thead><tr><th>Funcionário</th><th>Obra</th><th>Benefício</th><th>Tipo</th><th className="text-right">Dias a mais</th><th className="text-right">Valor</th><th>Obs.</th></tr></thead>
                <tbody>{extras.map((l) => (
                  <tr key={l.id}><td className="font-semibold">{l.funcionarios?.nome}</td><td className="text-xs">{codObra.get(l.obra_id ?? '') ?? '—'}</td>
                    <td><TagBeneficio tipo={l.tipo} /></td>
                    <td><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${ADIC[l.adicional_tipo].cor}`}>{ADIC[l.adicional_tipo].rotulo}</span></td>
                    <td className="text-right font-mono">+{nf(l.dias_retroativos)}</td>
                    <td className="text-right font-mono">{reais(Number(l.dias_retroativos) * Number(l.qtd_dia) * Number(l.valor_unitario))}</td>
                    <td className="text-xs text-concreto-500">{l.observacao}</td></tr>))}</tbody>
              </table>
            </Cartao>)}

          <Cartao titulo={`Resumo por ${porEmp ? 'empresa' : 'obra'}${filtro ? ` — só ${filtro === 'passagem' ? 'passagem' : 'alimentação'}` : ''}`}>
            <table className="tabela">
              <thead><tr><th>{porEmp ? 'Empresa / instituto' : 'Obra'}</th><th className="text-right">Pessoas</th>{!filtro && <><th className="text-right"><span className="inline-flex items-center gap-1 text-amber-800"><Icone nome="alimentacao" className="h-3.5 w-3.5" />Alimentação</span></th><th className="text-right"><span className="inline-flex items-center gap-1 text-sky-800"><Icone nome="passagem" className="h-3.5 w-3.5" />Passagem</span></th></>}<th className="text-right">Total</th></tr></thead>
              <tbody>
                {(porEmp ? ordemEmp : ordem).map((k) => { const ls = (porEmp ? gruposEmp : grupos).get(k)!; return (
                  <tr key={k} className={(porEmp ? empSel : obraSel) === k ? 'bg-sinal-50' : ''}><td>{porEmp
                    ? <Link href={url({ emp: k })} className="link">{nomeEmp.get(k)}</Link>
                    : <Link href={url({ obra: k })} className="link">{codObra.get(k) ?? ''} — {nomeObra.get(k) ?? 'Sem obra'}</Link>}</td>
                    <td className="text-right">{pessoas(ls)}</td>
                    {!filtro && <><td className="text-right font-mono">{reais(soma(ls, 'alimentacao'))}</td><td className="text-right font-mono">{reais(soma(ls, 'passagem'))}</td></>}
                    <td className="text-right font-mono font-bold">{reais(soma(ls))}</td></tr>); })}
                <tr className="bg-concreto-50 text-base font-black"><td>TOTAL GERAL</td><td className="text-right">{pessoas(todas)}</td>
                  {!filtro && <><td className="text-right font-mono">{reais(soma(todas, 'alimentacao'))}</td><td className="text-right font-mono">{reais(soma(todas, 'passagem'))}</td></>}
                  <td className="text-right font-mono">{reais(soma(todas))}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-concreto-500">Total de cada linha = (dias + retroativo/crédito − faltas) × valor por dia. Na passagem, o valor por dia já soma todas as passagens do dia (a observação mostra a conta, ex.: 4 × R$ 4,50). Toda alteração fica registrada.</p>
          </Cartao>
        </div>
      </>)}
    </>
  );
}
