import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';
import { planilhaPagamentos, type Pagamento, type Item } from '@/lib/pagamentos/planilha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Exporta TODOS os pagamentos (ou os de uma obra) em um Excel formatado: Visão geral, Resumo, Detalhado, Por empresa e Por obra. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const obra = u.searchParams.get('obra'); // id da obra, ou vazio = todas
  const incluirCancelados = u.searchParams.get('cancelados') === '1';

  const supabase = await criarClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return NextResponse.redirect(new URL('/login', req.url));
  const { data: perfil } = await supabase.from('perfis').select('papel, ativo').eq('id', uid).single();
  if (!perfil?.ativo || !['admin', 'rh', 'financeiro'].includes(perfil.papel)) return NextResponse.json({ erro: 'sem permissão' }, { status: 403 });

  const [{ data: pags }, { data: its }] = await Promise.all([
    supabase.from('v_pagamentos').select('id, data_pagamento, titulo, tipo, status, pago_em, periodo_inicio, periodo_fim, criado_nome').order('data_pagamento', { ascending: false }),
    supabase.from('pagamento_itens')
      .select('pagamento_id, categoria, destino, descricao, valor, funcionarios(nome, matricula, funcoes(nome)), empregadores(nome, tipo), obras(id, codigo, nome)')
      .eq('removido', false),
  ]);

  let pagamentos = (pags ?? []) as Pagamento[];
  if (!incluirCancelados) pagamentos = pagamentos.filter((p) => p.status !== 'cancelado');
  const idsValidos = new Set(pagamentos.map((p) => p.id));

  let itens: Item[] = (its ?? [])
    .filter((r: any) => idsValidos.has(r.pagamento_id))
    .map((r: any) => ({
      pagamento_id: r.pagamento_id,
      categoria: r.categoria,
      destino: r.destino,
      descricao: r.descricao,
      valor: r.valor,
      funcionario: r.funcionarios?.nome ?? null,
      matricula: r.funcionarios?.matricula ?? null,
      funcao: r.funcionarios?.funcoes?.nome ?? null,
      empresa: r.empregadores?.nome ?? null,
      empresa_tipo: r.empregadores?.tipo ?? null,
      obra_codigo: r.obras?.codigo ?? null,
      obra_nome: r.obras?.nome ?? null,
      _obra_id: r.obras?.id ?? null,
    }));

  let filtroCodigo: string | null = null;
  if (obra) {
    filtroCodigo = (itens.find((i: any) => i._obra_id === obra) as any)?.obra_codigo ?? null;
    itens = itens.filter((i: any) => i._obra_id === obra);
    const comObra = new Set(itens.map((i) => i.pagamento_id));
    pagamentos = pagamentos.filter((p) => comObra.has(p.id));
  }

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife', dateStyle: 'short', timeStyle: 'short' });
  const buf = await planilhaPagamentos(pagamentos, itens, { geradoEm: agora, filtroObra: filtroCodigo });
  const hoje = new Date().toISOString().slice(0, 10);
  const nome = `Pagamentos-CAD-${filtroCodigo ? filtroCodigo + '-' : ''}${hoje}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  });
}
