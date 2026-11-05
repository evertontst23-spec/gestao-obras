import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';
import { planilhaC6Pix } from '@/lib/c6/planilha';
import { recebedoresBeneficios } from '@/lib/c6/beneficios';

/** Exporta os benefícios do mês no modelo do C6 Bank (Pix em massa). Só quem tem chave e ainda não foi pago. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const mes = u.searchParams.get('mes') ?? '';
  const dataPg = u.searchParams.get('data') ?? '';
  if (!/^\d{4}-\d{2}$/.test(mes) || !/^\d{4}-\d{2}-\d{2}$/.test(dataPg)) return NextResponse.json({ erro: 'mês ou data inválidos' }, { status: 400 });
  const supabase = await criarClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return NextResponse.redirect(new URL('/login', req.url));
  const { data: perfil } = await supabase.from('perfis').select('papel, ativo').eq('id', uid).single();
  if (!perfil?.ativo || !['admin', 'rh', 'financeiro'].includes(perfil.papel)) return NextResponse.json({ erro: 'sem permissão' }, { status: 403 });

  const { recebedores, rotulo } = await recebedoresBeneficios(supabase, mes);
  const [a, m, d] = dataPg.split('-');
  const linhas = recebedores.filter((r) => r.chave).map((r) => ({
    nome: r.nome, chave: r.chave!, valor: r.valor, data: `${d}/${m}/${a}`,
    descricao: r.tipo === 'empresa' ? `Beneficios ${rotulo} ${r.nome} ${r.pessoas.length} funcionarios` : `Beneficios ${rotulo} ${r.nome}`,
  }));
  if (!linhas.length) return NextResponse.json({ erro: 'Ninguém com chave Pix para pagar neste mês' }, { status: 400 });
  const buf = await planilhaC6Pix(linhas);
  return new NextResponse(new Uint8Array(buf), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="C6-pix-beneficios-${mes}.xlsx"`,
    'Cache-Control': 'no-store',
  } });
}
