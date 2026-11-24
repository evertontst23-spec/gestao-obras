import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { PlantaoVigias, type LinhaPlantao } from '@/components/PlantaoVigias';
import { hojeISO, somarDias } from '@/lib/formato';

export const metadata = { title: 'Plantão dos vigias' };
export const dynamic = 'force-dynamic';

const TZ = 'America/Recife';
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
const dataBR = (iso: string) => iso.split('-').reverse().join('/');
const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const ATEST: Record<string, string> = { falta_justificada: 'Falta justificada', declaracao_horas: 'Declaração de horas' };

export default async function Plantao({ searchParams }: { searchParams: Promise<{ data?: string; obra?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await exigirPapel('admin', 'rh');
  const hoje = hojeISO();
  const ontem = somarDias(hoje, -1);
  // o plantão que terminou hoje de manhã começou ONTEM — por isso o padrão é ontem
  const dia = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) && sp.data <= hoje ? sp.data : ontem;
  const obra = sp.obra || null;

  const [{ data: obras }, { data: equipeToda }, { data: externos }, { data: regs }, { data: atests }, { data: feriado }] = await Promise.all([
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
    supabase.rpc('equipe_da_obra', { p_obra: obra }),
    supabase.rpc('funcionarios_ponto_externo'),
    supabase.from('registros_ponto').select('id, funcionario_id, momento, tipo').eq('data', dia).order('momento'),
    supabase.from('atestados').select('funcionario_id, tipo, data_inicio, dias').lte('data_inicio', dia).gte('data_inicio', somarDias(dia, -366)),
    supabase.from('feriados').select('descricao').eq('data', dia).neq('ambito', 'facultativo').maybeSingle(),
  ]);
  const turnoDuplo = dow(dia) === 0 || dow(dia) === 6 || !!feriado;
  const fora = new Set(((externos ?? []) as unknown as string[]).map(String));
  const equipe = ((equipeToda ?? []) as { id: string; nome: string; funcao: string }[]).filter((e) => !fora.has(e.id));
  const ids = equipe.map((e) => e.id);
  const regIds = (regs ?? []).map((r) => r.id);
  const vazio = Promise.resolve({ data: [] });
  const [{ data: info }, { data: desc }, { data: antes }, { data: fHoje }] = await Promise.all([
    ids.length ? supabase.from('funcionarios').select('id, data_admissao, obras(codigo, vigia_todo_dia)').in('id', ids) : vazio,
    regIds.length ? supabase.from('ponto_desconsideracoes').select('registro_id').in('registro_id', regIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('registros_ponto').select('funcionario_id, data').in('funcionario_id', ids).eq('tipo', 'entrada')
      .in('data', [somarDias(dia, -1), somarDias(dia, -2)]) : Promise.resolve({ data: [] }),
    ids.length ? supabase.rpc('funcoes_na_data', { p_ids: ids, p_data: dia }) : vazio,
  ]);
  type FuncaoDia = { funcionario_id: string; funcao: string | null; carga: number; noturno: boolean };
  const funcaoDia = new Map(((fHoje ?? []) as FuncaoDia[]).map((x) => [x.funcionario_id, x]));
  const trabalhou = new Set((antes ?? []).map((r: { funcionario_id: string; data: string }) => `${r.funcionario_id}|${r.data}`));
  const plantaoSugerido = (id: string) => !trabalhou.has(`${id}|${somarDias(dia, -1)}`) && trabalhou.has(`${id}|${somarDias(dia, -2)}`);
  const desconsiderados = new Set((desc ?? []).map((d: { registro_id: number }) => d.registro_id));
  type Info = { id: string; data_admissao: string; obras: { codigo: string; vigia_todo_dia: boolean } | null };
  const porId = new Map(((info ?? []) as unknown as Info[]).map((i) => [i.id, i]));
  const ehVigia = (id: string) => Number(funcaoDia.get(id)?.carga ?? 8) >= 12 && !!funcaoDia.get(id)?.noturno;

  // marcação já lançada do plantão: entrada neste dia (não desconsiderada)
  const entradaDoDia = new Map<string, string>();
  (regs ?? []).filter((r) => r.tipo === 'entrada' && !desconsiderados.has(r.id)).forEach((r) => entradaDoDia.set(r.funcionario_id, hm(r.momento)));
  const abono = new Map<string, string>();
  (atests ?? []).forEach((a) => {
    if (a.tipo !== 'declaracao_horas' && dia <= somarDias(a.data_inicio, Math.max(a.dias - 1, 0))) abono.set(a.funcionario_id, ATEST[a.tipo] ?? 'Atestado');
  });

  const linhas: LinhaPlantao[] = equipe
    .filter((e) => ehVigia(e.id) && (porId.get(e.id)?.data_admissao ?? '') <= dia)
    .map((e): LinhaPlantao => {
      const i = porId.get(e.id);
      const fixo = !!i?.obras?.vigia_todo_dia;
      return {
        id: e.id, nome: e.nome, funcao: funcaoDia.get(e.id)?.funcao ?? e.funcao ?? 'Vigia', obra: i?.obras?.codigo ?? 'Sem obra',
        fixo, plantao: fixo || plantaoSugerido(e.id),
        ja: entradaDoDia.has(e.id) ? { texto: `plantão ${entradaDoDia.get(e.id)}` } : abono.has(e.id) ? { texto: abono.get(e.id)! } : null,
      };
    })
    .sort((a, b) => a.obra.localeCompare(b.obra) || a.nome.localeCompare(b.nome));

  return (
    <>
      <p className="mb-2 text-sm"><Link className="link" href="/dp/ponto">← Registro de ponto</Link></p>
      <Cabecalho titulo="Plantão dos vigias"
        sub="Só os vigias noturnos (escala 12×36). Marque quem fez o plantão da noite, quem folgou e quem faltou. A entrada fica no dia escolhido e a saída na manhã seguinte — lance no dia seguinte, quando o plantão fecha." />
      <AbasDP atual="ponto" />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="mb-1 block font-medium text-concreto-700">Noite de</span>
          <input type="date" name="data" defaultValue={dia} max={hoje} className="entrada w-auto" /></label>
        <label className="min-w-[12rem] flex-1 text-sm"><span className="mb-1 block font-medium text-concreto-700">Obra</span>
          <select name="obra" defaultValue={obra ?? ''} className="entrada"><option value="">Todas as obras</option>
            {obras?.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}</select></label>
        <button className="h-[42px] rounded-md bg-concreto-800 px-4 text-sm font-semibold text-white">Abrir</button>
      </form>

      {!linhas.length ? <Vazio>Nenhum vigia noturno nesta obra na noite de {dataBR(dia)}.</Vazio>
        : <PlantaoVigias key={`${dia}-${obra ?? 'todas'}`} dia={dia} diaFormatado={dataBR(dia)} linhas={linhas} turnoDuplo={turnoDuplo} />}
    </>
  );
}
