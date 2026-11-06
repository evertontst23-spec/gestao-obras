import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';
import { planilhaC6Pix } from '@/lib/c6/planilha';
import { recebedoresPagamento } from '@/lib/c6/pagamentos';

/** Exporta um pagamento (dia 20 / dia 05) no modelo do C6 Bank — Pix em massa. Só quem tem chave Pix. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataPg = new URL(req.url).searchParams.get('data') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPg)) return NextResponse.json({ erro: 'data inválida' }, { status: 400 });
  const supabase = await criarClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return NextResponse.redirect(new URL('/login', req.url));
  const { data: perfil } = await supabase.from('perfis').select('papel, ativo').eq('id', uid).single();
  if (!perfil?.ativo || !['admin', 'rh', 'financeiro'].includes(perfil.papel)) return NextResponse.json({ erro: 'sem permissão' }, { status: 403 });

  const { pagamento, recebedores } = await recebedoresPagamento(supabase, id);
  if (!pagamento) return NextResponse.json({ erro: 'pagamento não encontrado' }, { status: 404 });
  const [a, m, d] = dataPg.split('-');
  const desc = pagamento.tipo === 'adiantamento' ? 'Adiantamento salarial' : 'Pagamento de salario';
  const linhas = recebedores.filter((r) => r.chave).map((r) => ({
    nome: r.nome, chave: r.chave!, valor: r.valor, data: `${d}/${m}/${a}`, descricao: r.tipo === 'empresa' ? 'Folha funcionarios' : desc,
  }));
  if (!linhas.length) return NextResponse.json({ erro: 'Ninguém com chave Pix neste pagamento' }, { status: 400 });
  const buf = await planilhaC6Pix(linhas);
  return new NextResponse(new Uint8Array(buf), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="C6-pix-folha-${pagamento.data_pagamento}.xlsx"`,
    'Cache-Control': 'no-store',
  } });
}
