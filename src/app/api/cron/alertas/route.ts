import { NextResponse } from 'next/server';
import { criarClienteAdmin } from '@/lib/supabase/admin';

/**
 * Alternativa ao pg_cron: chame esta rota de hora em hora
 * (Vercel Cron, Netlify Scheduled Functions, cron-job.org…)
 * com o cabeçalho  Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  }
  const { data, error } = await criarClienteAdmin().rpc('gerar_alertas');
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ alertas_criados: data });
}
