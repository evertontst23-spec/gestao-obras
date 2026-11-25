import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';
import { planilhaC6Pix, chaveC6 } from '@/lib/c6/planilha';

/** Exporta as contas a pagar selecionadas no modelo do C6 Bank (Pix em massa). Chave = a do lançamento, senão a do fornecedor. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ids = (u.searchParams.get('ids') ?? '').split(',').filter(Boolean);
  const dataPg = u.searchParams.get('data') ?? '';
  if (!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(dataPg)) return NextResponse.json({ erro: 'contas ou data inválidas' }, { status: 400 });

  const supabase = await criarClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return NextResponse.redirect(new URL('/login', req.url));
  const { data: perfil } = await supabase.from('perfis').select('papel, ativo').eq('id', uid).single();
  if (!perfil?.ativo || !['admin', 'financeiro'].includes(perfil.papel)) return NextResponse.json({ erro: 'sem permissão' }, { status: 403 });

  const { data: ls } = await supabase.from('lancamentos')
    .select('id, descricao, favorecido, valor, pix, tipo, status, fornecedores(nome, pix)')
    .in('id', ids).eq('tipo', 'despesa').eq('status', 'aberto');

  const [a, m, d] = dataPg.split('-');
  const linhas = (ls ?? []).map((l) => {
    const forn = l.fornecedores as unknown as { nome: string; pix: string | null } | null;
    const chaveBruta = (l.pix as string | null) || forn?.pix || '';
    const k = chaveBruta ? chaveC6(chaveBruta) : null;
    return { nome: forn?.nome || l.favorecido || 'Favorecido', chave: k, valor: Number(l.valor),
      data: `${d}/${m}/${a}`, descricao: l.descricao as string };
  }).filter((x) => x.chave && x.chave.tipo !== 'invalida')
    .map((x) => ({ nome: x.nome, chave: x.chave!.chave, valor: x.valor, data: x.data, descricao: 'Pagamento conta' }));

  if (!linhas.length) return NextResponse.json({ erro: 'Nenhuma das contas selecionadas tem chave Pix válida' }, { status: 400 });
  const buf = await planilhaC6Pix(linhas);
  return new NextResponse(new Uint8Array(buf), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="C6-pix-contas-${dataPg}.xlsx"`,
    'Cache-Control': 'no-store',
  } });
}
