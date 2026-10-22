import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = ['/login', '/offline', '/api/cron', '/p/'];

const PAGINA_CONFIGURACAO = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configuração pendente</title><style>body{font-family:system-ui,sans-serif;background:#1d1c1a;color:#ebeae7;margin:0;padding:32px 16px}
main{max-width:640px;margin:auto}h1{color:#ff8a3d;font-size:22px}code,pre{background:#2e2d2a;border-radius:6px;padding:2px 6px}
pre{padding:14px;overflow:auto;line-height:1.6}li{margin:8px 0}a{color:#ff8a3d}</style></head><body><main>
<h1>Gestão de Obras — falta conectar o banco de dados</h1>
<p>O sistema não encontrou o endereço e a chave do projeto Supabase.</p>
<ol>
<li>Crie um projeto em <a href="https://supabase.com/dashboard">supabase.com</a> (região São Paulo) e aplique os arquivos de <code>supabase/migrations</code>.</li>
<li>Em <b>Project Settings → API</b>, copie a <b>Project URL</b>, a chave <b>anon/publishable</b> e a <b>service_role/secret</b>.</li>
<li>Na pasta do projeto, crie o arquivo <code>.env.local</code> (copie de <code>.env.example</code>):</li>
</ol>
<pre>NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
CRON_SECRET=um-texto-aleatorio-longo</pre>
<p>4. Pare o servidor (<code>Ctrl+C</code>) e rode <code>npm run dev</code> de novo. Na Netlify/Vercel, cadastre as mesmas variáveis em <i>Environment variables</i> e publique novamente.</p>
<p>Passo a passo completo: <code>docs/IMPLANTACAO.md</code>.</p>
</main></body></html>`;

export async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new NextResponse(PAGINA_CONFIGURACAO, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims confere a assinatura do token localmente (sem ir ao servidor de login a cada clique)
  // e renova a sessão quando o token vence.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const caminho = request.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => caminho.startsWith(p));

  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('voltar', caminho);
    return NextResponse.redirect(url);
  }
  if (user && caminho === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
