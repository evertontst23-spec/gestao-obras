import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, LinkBotao, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { AbasDP } from '@/components/AbasDP';
import { PontoFacial } from '@/components/PontoFacial';
import { pontoManual } from '@/app/(app)/sst/acoes';
import { hojeISO, somarDias } from '@/lib/formato';

export const metadata = { title: 'Ponto' };

export default async function Ponto({ searchParams }: { searchParams: Promise<{ data?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'seguranca', 'rh', 'engenheiro', 'encarregado', 'almoxarifado');
  const dia = sp.data ?? hojeISO();
  const { data: obras } = await supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome');
  let q = supabase.from('registros_ponto').select('*').eq('data', dia).order('momento');
  if (sp.obra) q = q.eq('obra_id', sp.obra);
  const { data: regs } = await q;
  const [{ data: equipeToda }, { data: externos }, { data: empExt }, { data: atests }, { data: obraDe }] = await Promise.all([
    supabase.rpc('equipe_da_obra', { p_obra: sp.obra ?? null }),
    supabase.rpc('funcionarios_ponto_externo'),
    supabase.from('empregadores').select('nome, ponto_externo_url').eq('ponto_externo', true).order('nome'),
    supabase.from('atestados').select('funcionario_id, tipo, data_inicio, dias').lte('data_inicio', dia).gte('data_inicio', somarDias(dia, -366)),
    supabase.from('funcionarios').select('id, obra_id').eq('ativo', true),
  ]);
  // falta / abono do dia: falta = dia útil já lançado na obra e a pessoa sem marcação nem atestado
  const abono = new Map<string, string>();
  (atests ?? []).forEach((a) => {
    if (a.tipo !== 'declaracao_horas' && dia <= somarDias(a.data_inicio, Math.max(a.dias - 1, 0))) abono.set(a.funcionario_id, a.tipo === 'falta_justificada' ? 'Falta justificada' : 'Atestado');
  });
  const obraDoFunc = new Map((obraDe ?? []).map((f) => [f.id, f.obra_id as string | null]));
  const obrasLancadas = new Set((regs ?? []).map((r) => r.obra_id as string | null));
  const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  const diaUtil = diaSemana >= 1 && diaSemana <= 5;
  const fora = new Set(((externos ?? []) as unknown as string[]).map(String));
  const equipe = ((equipeToda ?? []) as { id: string; matricula: string; nome: string; funcao: string; biometria: boolean }[]).filter((e) => !fora.has(e.id));
  const qtdFora = ((equipeToda ?? []) as { id: string }[]).filter((e) => fora.has(e.id)).length;
  const porFunc = new Map<string, NonNullable<typeof regs>>();
  (regs ?? []).forEach((r) => porFunc.set(r.funcionario_id, [...(porFunc.get(r.funcionario_id) ?? []), r]));
  const nomes = new Map((equipe ?? []).map((e) => [e.id, e]));
  const presentes = [...porFunc.keys()].length;
  const podeManual = ['admin', 'rh', 'engenheiro', 'seguranca'].includes(perfil.papel);
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });

  return (
    <>
      <Cabecalho titulo="Ponto" sub="Reconhecimento facial no tablet/celular da obra. Registros com data, hora do servidor, GPS e hash encadeado — não podem ser alterados." />
      <AbasDP atual="ponto" />
      {['admin', 'rh'].includes(perfil.papel) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sinal-300 bg-sinal-50 px-4 py-3">
          <p className="text-sm text-concreto-800"><b>Ponto ainda no manual?</b> Lance o dia da equipe inteira de uma vez — todos como OK, e você marca só as faltas, faltas justificadas e atestados.</p>
          <LinkBotao href={`/dp/ponto/lote${sp.obra ? `?obra=${sp.obra}` : ''}`}>Lançar o dia em lote</LinkBotao>
        </div>)}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2"><PontoFacial obras={obras ?? []} /></div>
        <div className="space-y-5 lg:col-span-3">
          <Cartao titulo={`Registros de ${dia.split('-').reverse().join('/')} — ${presentes} presente(s) de ${equipe?.length ?? 0}`}>
            <form className="mb-3 flex flex-wrap gap-2">
              <input type="date" name="data" defaultValue={dia} className="entrada w-auto" />
              <select name="obra" defaultValue={sp.obra ?? ''} className="entrada w-auto flex-1"><option value="">Todas as obras</option>{obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}</select>
              <button className="rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Ver</button>
            </form>
            {!(equipe?.length) ? <Vazio>Nenhum funcionário ativo.</Vazio> : (
              <div className="overflow-x-auto"><table className="tabela">
                <thead><tr><th>Funcionário</th><th>Marcações</th><th>Situação</th></tr></thead>
                <tbody>{(equipe ?? []).map((e) => {
                  const rs = porFunc.get(e.id) ?? [];
                  return (
                    <tr key={e.id}>
                      <td><b>{e.nome}</b><div className="text-xs text-concreto-500">{e.funcao} • {e.matricula}{!e.biometria && ' • sem biometria'}</div></td>
                      <td className="font-mono text-sm">{rs.map((r) => <span key={r.id} className={`mr-2 inline-block ${r.metodo === 'manual' ? 'text-atencao-700' : ''}`} title={r.metodo === 'manual' ? `Manual: ${r.justificativa}` : `Facial • ${r.latitude ? 'com GPS' : 'sem GPS'}`}>{r.tipo === 'entrada' ? '▶' : '■'}{hm(r.momento)}{r.metodo === 'manual' ? '*' : ''}</span>)}</td>
                      <td>{!rs.length ? (abono.has(e.id) ? <Selo cor={abono.get(e.id) === 'Atestado' ? 'bg-sky-100 text-sky-800' : 'bg-atencao-100 text-atencao-800'}>{abono.get(e.id)}</Selo>
                        : diaUtil && obrasLancadas.has(obraDoFunc.get(e.id) ?? null) ? <Selo cor="bg-atraso-50 text-atraso-700">Falta</Selo>
                        : <Selo cor="bg-concreto-100 text-concreto-600">Sem registro</Selo>) : rs[rs.length - 1].tipo === 'entrada' ? <Selo cor="bg-ok-50 text-ok-700">Na obra</Selo> : <Selo cor="bg-sky-100 text-sky-800">Saiu</Selo>}</td>
                    </tr>);
                })}</tbody>
              </table></div>)}
            {[...porFunc.keys()].some((k) => !nomes.has(k)) && <p className="mt-2 text-xs text-concreto-500">Há registros de funcionários de outras obras neste dia.</p>}
            <p className="mt-2 text-xs text-concreto-500">▶ entrada • ■ saída • * lançamento manual (passe o mouse para ver a justificativa)</p>
            {qtdFora > 0 && <p className="mt-2 rounded-md bg-atencao-50 px-3 py-2 text-xs text-atencao-800">{qtdFora} funcionário(s) de {(empExt ?? []).map((x) => x.nome).join(' e ')} não aparecem aqui: o ponto deles é marcado fora do sistema{(empExt ?? []).find((x) => x.ponto_externo_url) && <> (<a className="link" href={(empExt ?? []).find((x) => x.ponto_externo_url)!.ponto_externo_url!} target="_blank" rel="noreferrer">abrir o Ponto Diário</a>)</>}.</p>}
          </Cartao>
          {podeManual && (
            <Cartao titulo="Lançamento manual (falha de câmera, esquecimento)">
              <FormAcao acao={pontoManual} limparAoConcluir className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Funcionário" className="sm:col-span-2"><select name="funcionario_id" required className="entrada"><option value="">Selecionar…</option>
                  {(equipe ?? []).map((e) => <option key={e.id} value={e.id}>{e.nome} — {e.matricula}</option>)}</select></Campo>
                <Campo rotulo="Data"><input type="date" name="data" required defaultValue={hojeISO()} max={hojeISO()} className="entrada" /></Campo>
                <Campo rotulo="Hora"><input type="time" name="hora" required className="entrada" /></Campo>
                <Campo rotulo="Tipo"><select name="tipo" className="entrada"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></Campo>
                <Campo rotulo="Justificativa *"><input name="justificativa" required minLength={5} className="entrada" /></Campo>
                <div className="sm:col-span-2"><Botao variante="secundario">Lançar</Botao></div>
              </FormAcao>
            </Cartao>)}
        </div>
      </div>
    </>
  );
}
