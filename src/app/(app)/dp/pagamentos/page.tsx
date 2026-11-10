import { exigirPapel } from '@/lib/sessao';
import { hojeISO } from '@/lib/formato';
import { TelaPagamentos, type PagLinha } from './Tela';

export const metadata = { title: 'Pagamentos' };

/** Sugere a próxima data (dia 20 ou dia 05) e o período de passagens/alimentação */
function sugestao(hoje: string) {
  const [a, m, d] = hoje.split('-').map(Number);
  const iso = (y: number, mm: number, dd: number) => new Date(Date.UTC(y, mm - 1, dd)).toISOString().slice(0, 10);
  if (d <= 5) return { data: iso(a, m, 5), tipo: 'saldo', ini: iso(a, m, 6), fim: iso(a, m, 19) };
  if (d <= 20) return { data: iso(a, m, 20), tipo: 'adiantamento', ini: iso(a, m, 20), fim: iso(a, m + 1, 0) };
  return { data: iso(a, m + 1, 5), tipo: 'saldo', ini: iso(a, m + 1, 1), fim: iso(a, m + 1, 19) };
}

export default async function Pagamentos({ searchParams }: { searchParams: Promise<{ obra?: string; cancelados?: string }> }) {
  const sp = await searchParams;
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const [{ data: todos }, { data: obras }, { data: obraDe }] = await Promise.all([
    supabase.from('v_pagamentos').select('*').order('data_pagamento', { ascending: false }).limit(80),
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('codigo'),
    supabase.from('pagamentos').select('id, obra_id, obras(codigo)').not('obra_id', 'is', null),
  ]);
  const obraPag = new Map((obraDe ?? []).map((x) => [x.id, (x.obras as unknown as { codigo: string } | null)?.codigo ?? '']));
  const obraIdPag = new Map((obraDe ?? []).map((x) => [x.id, x.obra_id as string]));
  // filtro por obra: pagamentos daquela obra e os gerais (que têm linhas dela)
  const comCancel = (todos ?? []).filter((p) => !sp.obra || !obraIdPag.has(p.id) || obraIdPag.get(p.id) === sp.obra);
  // cancelados ficam escondidos (só aparecem se pedir)
  const nCancel = comCancel.filter((p) => p.status === 'cancelado').length;
  const lista = sp.cancelados ? comCancel : comCancel.filter((p) => p.status !== 'cancelado');
  const pode = ['admin', 'rh', 'financeiro'].includes(perfil.papel);
  const s = sugestao(hojeISO());
  const abertos = (lista ?? []).filter((p) => p.status === 'fechado' || p.status === 'rascunho');
  const proximo = abertos.sort((x, y) => x.data_pagamento.localeCompare(y.data_pagamento))[0];
  const pagosMes = (lista ?? []).filter((p) => p.status === 'pago' && p.data_pagamento.slice(0, 7) === hojeISO().slice(0, 7));
  return (
    <TelaPagamentos
      lista={(lista ?? []) as PagLinha[]}
      obras={obras ?? []}
      obraPag={Object.fromEntries(obraPag)}
      obraFiltro={sp.obra || undefined}
      verCancelados={!!sp.cancelados}
      nCancel={nCancel}
      pode={pode}
      sugestao={s}
      proximo={proximo as PagLinha | undefined}
      totalPagoMes={pagosMes.reduce((t, p) => t + Number(p.total), 0)}
      emConferencia={(lista ?? []).filter((p) => p.status === 'rascunho').length}
    />
  );
}
