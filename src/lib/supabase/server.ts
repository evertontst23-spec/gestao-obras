import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Cliente Supabase no servidor, autenticado com a sessão do usuário (respeita RLS). */
export async function criarClienteServidor() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // chamado a partir de Server Component: o middleware renova a sessão
          }
        },
      },
    },
  );
}
