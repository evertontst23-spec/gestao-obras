import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com a chave service_role — ignora RLS.
 * Usado APENAS em ações do servidor que já verificaram que o usuário é administrador
 * (cadastro de usuários) e na rota de alertas protegida por segredo.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada no servidor');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
