import { entrar } from './acoes';
import { FormAcao, Botao } from '@/components/formulario';

export const metadata = { title: 'Entrar' };

export default async function Login({ searchParams }: { searchParams: Promise<{ voltar?: string; erro?: string }> }) {
  const { voltar, erro } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-concreto-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-sinal-500 text-2xl font-black text-white">⌂</div>
          <h1 className="text-xl font-bold text-white">Gestão de Obras</h1>
          <p className="text-sm text-concreto-400">Planejamento e execução no canteiro</p>
        </div>
        <FormAcao acao={entrar} className="space-y-4 rounded-lg bg-white p-6 shadow-xl">
          <input type="hidden" name="voltar" value={voltar ?? '/'} />
          {erro === 'inativo' && <p className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">Usuário inativo ou sem perfil. Procure a diretoria.</p>}
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-concreto-700">E-mail</span>
            <input name="email" type="email" required autoComplete="email" className="entrada" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-concreto-700">Senha</span>
            <input name="senha" type="password" required autoComplete="current-password" className="entrada" />
          </label>
          <Botao grande>Entrar</Botao>
          <p className="text-center text-xs text-concreto-500">O acesso é criado pela diretoria da construtora.</p>
        </FormAcao>
      </div>
    </main>
  );
}
