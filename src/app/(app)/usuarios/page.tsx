import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Campo, Selo } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { atualizarUsuario, cadastrarUsuario, redefinirSenha } from './acoes';
import { PAPEIS, type Perfil } from '@/lib/dominio';

export const metadata = { title: 'Usuários e permissões' };

function SelectPapel({ padrao }: { padrao?: string }) {
  return (
    <select name="papel" defaultValue={padrao ?? 'encarregado'} className="entrada">
      {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export default async function Usuarios() {
  const { supabase } = await exigirPapel('admin');
  const { data } = await supabase.from('perfis').select('*').order('ativo', { ascending: false }).order('nome');
  const usuarios = (data ?? []) as Perfil[];
  return (
    <>
      <Cabecalho titulo="Usuários e permissões" sub={`${usuarios.filter((u) => u.ativo).length} ativo(s)`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Cadastrar colaborador">
          <FormAcao acao={cadastrarUsuario} limparAoConcluir className="space-y-3">
            <Campo rotulo="Nome completo"><input name="nome" required className="entrada" /></Campo>
            <Campo rotulo="E-mail (login)"><input name="email" type="email" required className="entrada" /></Campo>
            <Campo rotulo="Telefone / WhatsApp"><input name="telefone" inputMode="tel" className="entrada" /></Campo>
            <Campo rotulo="Perfil de acesso"><SelectPapel /></Campo>
            <Campo rotulo="Senha inicial" dica="Mínimo 8 caracteres. Oriente a pessoa a guardá-la."><input name="senha" type="text" required minLength={8} autoComplete="off" className="entrada" /></Campo>
            <Botao>Cadastrar</Botao>
          </FormAcao>
          <div className="mt-4 space-y-1 border-t border-concreto-100 pt-3 text-xs text-concreto-500">
            <p><b>Diretoria:</b> vê tudo, cadastra usuários.</p><p><b>Engenheiro:</b> planeja e valida nas obras em que está vinculado.</p>
            <p><b>Encarregado:</b> executa as tarefas atribuídas e pede materiais.</p><p><b>Compras / Almoxarifado:</b> atendem os pedidos de todas as obras.</p>
          </div>
        </Cartao>
        <div className="space-y-3 lg:col-span-2">
          {usuarios.map((u) => (
            <details key={u.id} className={`rounded-lg border border-concreto-200 bg-white ${u.ativo ? '' : 'opacity-60'}`}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span><b>{u.nome}</b> <span className="text-sm text-concreto-500">{u.email}</span></span>
                <span className="flex gap-2"><Selo cor="bg-concreto-100 text-concreto-700">{PAPEIS[u.papel]}</Selo>{!u.ativo && <Selo cor="bg-atraso-50 text-atraso-700">Inativo</Selo>}</span>
              </summary>
              <div className="grid gap-4 border-t border-concreto-100 p-4 md:grid-cols-2">
                <FormAcao acao={atualizarUsuario} className="space-y-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Campo rotulo="Nome"><input name="nome" defaultValue={u.nome} className="entrada" /></Campo>
                  <Campo rotulo="Telefone"><input name="telefone" defaultValue={u.telefone ?? ''} className="entrada" /></Campo>
                  <Campo rotulo="Perfil"><SelectPapel padrao={u.papel} /></Campo>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={u.ativo} className="accent-sinal-500" /> Acesso ativo</label>
                  <Botao variante="secundario">Salvar</Botao>
                </FormAcao>
                <FormAcao acao={redefinirSenha} limparAoConcluir className="space-y-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Campo rotulo="Nova senha"><input name="senha" type="text" minLength={8} required autoComplete="off" className="entrada" /></Campo>
                  <Botao variante="secundario">Redefinir senha</Botao>
                  <p className="text-xs text-concreto-500">Desativar um usuário bloqueia o login, mas mantém todo o histórico (exigência de rastreabilidade).</p>
                </FormAcao>
              </div>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
