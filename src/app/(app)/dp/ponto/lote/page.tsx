import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { PontoLote, type LinhaLote } from '@/components/PontoLote';
import { hojeISO, somarDias } from '@/lib/formato';
import type { HorariosLote } from '../acoes';

export const metadata = { title: 'Ponto do dia em lote' };
export const dynamic = 'force-dynamic';

const TZ = 'America/Recife';
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const ATEST: Record<string, string> = { falta_justificada: 'Falta justificada', declaracao_horas: 'Declaração de horas' };

/** Dia sugerido: hoje se o expediente já acabou; senão, o último dia útil. */
function diaSugerido() {
  const hoje = hojeISO();
  const agora = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const largada = dow(hoje) === 5 ? '16:05' : '17:05';
  if (dow(hoje) >= 1 && dow(hoje) <= 5 && agora >= largada) return hoje;
  let d = somarDias(hoje, -1);
  while (dow(d) === 0 || dow(d) === 6) d = somarDias(d, -1);
  return d;
}

export default async function PontoEmLote({ searchParams }: { searchParams: Promise<{ data?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'rh');
  const hoje = hojeISO();
  const dia = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) && sp.data <= hoje ? sp.data : diaSugerido();
  const obra = sp.obra || null;

  const [{ data: obras }, { data: equipeToda }, { data: externos }, { data: regs }, { data: atests }, { data: feriado }] = await Promise.all([
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
    supabase.rpc('equipe_da_obra', { p_obra: obra }),
    supabase.rpc('funcionarios_ponto_externo'),
    supabase.from('registros_ponto').select('id, funcionario_id, momento, tipo').eq('data', dia).order('momento'),
    supabase.from('atestados').select('funcionario_id, tipo, data_inicio, dias').lte('data_inicio', dia).gte('data_inicio', somarDias(dia, -366)),
    supabase.from('feriados').select('descricao').eq('data', dia).neq('ambito', 'facultativo').maybeSingle(),
  ]);
  const fora = new Set(((externos ?? []) as unknown as string[]).map(String));
  const equipe = ((equipeToda ?? []) as { id: string; nome: string; funcao: string }[]).filter((e) => !fora.has(e.id));
  const ids = equipe.map((e) => e.id);
  const regIds = (regs ?? []).map((r) => r.id);
  const vazio = Promise.resolve({ data: [] });
  const [{ data: info }, { data: desc }, { data: antes }, { data: fHoje }, { data: fOntem }] = await Promise.all([
    ids.length ? supabase.from('funcionarios').select('id, data_admissao, obras(codigo, vigia_todo_dia)').in('id', ids) : vazio,
    regIds.length ? supabase.from('ponto_desconsideracoes').select('registro_id').in('registro_id', regIds) : Promise.resolve({ data: [] }),
    // escala dos vigias (dia sim, dia não): olha ontem e anteontem para sugerir plantão ou folga
    //   (só entradas: a saída da manhã do vigia noturno é do plantão da noite anterior)
    ids.length ? supabase.from('registros_ponto').select('funcionario_id, data').in('funcionario_id', ids).eq('tipo', 'entrada')
      .in('data', [somarDias(dia, -1), somarDias(dia, -2)]) : Promise.resolve({ data: [] }),
    // função que valia no dia (e na véspera): quem trocou de função é calculado pela data
    ids.length ? supabase.rpc('funcoes_na_data', { p_ids: ids, p_data: dia }) : vazio,
    ids.length ? supabase.rpc('funcoes_na_data', { p_ids: ids, p_data: somarDias(dia, -1) }) : vazio,
  ]);
  type FuncaoDia = { funcionario_id: string; funcao: string | null; carga: number; noturno: boolean };
  const funcaoDia = new Map(((fHoje ?? []) as FuncaoDia[]).map((x) => [x.funcionario_id, x]));
  const vigiaOntem = new Set(((fOntem ?? []) as FuncaoDia[]).filter((x) => Number(x.carga) >= 12).map((x) => x.funcionario_id));
  const trabalhou = new Set((antes ?? []).map((r: { funcionario_id: string; data: string }) => `${r.funcionario_id}|${r.data}`));
  const plantaoSugerido = (id: string) => !trabalhou.has(`${id}|${somarDias(dia, -1)}`) && trabalhou.has(`${id}|${somarDias(dia, -2)}`);
  const desconsiderados = new Set((desc ?? []).map((d: { registro_id: number }) => d.registro_id));
  type Info = { id: string; data_admissao: string; obras: { codigo: string; vigia_todo_dia: boolean } | null };
  const porId = new Map(((info ?? []) as unknown as Info[]).map((i) => [i.id, i]));
  const ehVigia = (id: string) => Number(funcaoDia.get(id)?.carga ?? 8) >= 12;
  // vigia noturno (plantão 18h→06h): sai do lote e é lançado na tela "Plantão dos vigias"
  const ehVigiaNoturno = (id: string) => ehVigia(id) && !!funcaoDia.get(id)?.noturno;
  // saída da manhã de quem era vigia na véspera = fim do plantão da noite anterior
  const fimDaNoite = (r: { funcionario_id: string; momento: string; tipo: string }) => vigiaOntem.has(r.funcionario_id) && r.tipo === 'saida' && hm(r.momento) < '12:00';
  const marc = new Map<string, string[]>();
  (regs ?? []).filter((r) => !desconsiderados.has(r.id) && !fimDaNoite(r))
    .forEach((r) => marc.set(r.funcionario_id, [...(marc.get(r.funcionario_id) ?? []), hm(r.momento)]));
  const abono = new Map<string, string>();
  (atests ?? []).forEach((a) => {
    if (a.tipo !== 'declaracao_horas' && dia <= somarDias(a.data_inicio, Math.max(a.dias - 1, 0))) abono.set(a.funcionario_id, ATEST[a.tipo] ?? 'Atestado');
  });
  const nVigiasNoturnos = equipe.filter((e) => ehVigiaNoturno(e.id) && (porId.get(e.id)?.data_admissao ?? '') <= dia).length;
  const linhas: LinhaLote[] = equipe
    .filter((e) => !ehVigiaNoturno(e.id) && (porId.get(e.id)?.data_admissao ?? '') <= dia)
    .map((e): LinhaLote => {
      const i = porId.get(e.id);
      const m = marc.get(e.id);
      return {
        id: e.id, nome: e.nome, funcao: funcaoDia.get(e.id)?.funcao ?? e.funcao ?? '—', obra: i?.obras?.codigo ?? 'Sem obra',
        vigia: ehVigia(e.id),
        noturno: !!funcaoDia.get(e.id)?.noturno,
        fixo: ehVigia(e.id) && !!i?.obras?.vigia_todo_dia,
        plantao: ehVigia(e.id) && (!!i?.obras?.vigia_todo_dia || plantaoSugerido(e.id)),
        ja: m ? { tipo: 'marcacao', texto: m.join(' · ') } : abono.has(e.id) ? { tipo: 'abono', texto: abono.get(e.id)! } : null,
      };
    })
    .sort((a, b) => a.obra.localeCompare(b.obra) || a.nome.localeCompare(b.nome));

  const horarios: HorariosLote = { entrada: '07:00', saida_almoco: '12:00', volta_almoco: '13:00', largada: dow(dia) === 5 ? '16:00' : '17:00',
    noturno_entrada: '18:00', noturno_saida: '06:00' };
  const fimDeSemana = dow(dia) === 0 || dow(dia) === 6;
  // sábado, domingo e feriado: o vigia cobre o dia e a noite (24h) — o 2º turno é hora extra
  const turnoDuplo = fimDeSemana || !!feriado;

  return (
    <>
      <p className="mb-2 text-sm"><Link className="link" href="/dp/ponto">← Registro de ponto</Link></p>
      <Cabecalho titulo="Lançar o ponto do dia (em lote)"
        sub="Toda a equipe já vem como OK. Troque só quem teve falta, falta justificada ou atestado e grave tudo de uma vez. Quem está OK recebe as 4 marcações: entrada, saída para o almoço, volta do almoço e largada." />
      <AbasDP atual="ponto" />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="mb-1 block font-medium text-concreto-700">Dia</span>
          <input type="date" name="data" defaultValue={dia} max={hoje} className="entrada w-auto" /></label>
        <label className="min-w-[12rem] flex-1 text-sm"><span className="mb-1 block font-medium text-concreto-700">Obra</span>
          <select name="obra" defaultValue={obra ?? ''} className="entrada"><option value="">Todas as obras</option>
            {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></label>
        <button className="h-[42px] rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Abrir</button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3">
        <p className="text-sm text-sky-900"><b>Vigias (plantão 12×36, 18h→06h)</b> são lançados à parte, na tela de Plantão — {nVigiasNoturnos > 0 ? `${nVigiasNoturnos} vigia(s) nesta seleção.` : 'aqui ficam só a equipe do dia.'}</p>
        <Link href={`/dp/ponto/plantao${obra ? `?obra=${obra}` : ''}`} className="rounded-md border border-sky-400 bg-superficie px-3 py-1.5 text-sm font-semibold text-sky-800 hover:bg-sky-100">Abrir Plantão dos vigias →</Link>
      </div>
      {turnoDuplo && <p className="mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">{dataBR(dia)} é {feriado ? `feriado (${feriado.descricao})` : 'fim de semana'}: confira a equipe do dia antes de gravar. O plantão de 24h do vigia é lançado na tela de Plantão.</p>}
      {dia === hoje && <p className="mb-4 rounded-md bg-atencao-50 px-3 py-2 text-sm text-atencao-800">Hoje: falta, falta justificada e atestado já podem ser lançados; o <b>OK</b> só depois da largada.</p>}
      {fora.size > 0 && <p className="mb-4 text-xs text-concreto-500">Quem tem o ponto marcado fora do sistema (empresa com ponto próprio) não aparece aqui.</p>}

      {!linhas.length ? <Vazio>Nenhum funcionário ativo nesta obra em {dataBR(dia)}.</Vazio>
        : <PontoLote key={`${dia}-${obra ?? 'todas'}`} dia={dia} diaFormatado={dataBR(dia)} linhas={linhas} horariosPadrao={horarios} turnoDuplo={turnoDuplo} />}
    </>
  );
}
