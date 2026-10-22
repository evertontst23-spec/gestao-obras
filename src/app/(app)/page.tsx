import { redirect } from 'next/navigation';
import { obterSessao } from '@/lib/sessao';

export default async function Inicio() {
  const { perfil } = await obterSessao();
  if (perfil.papel === 'encarregado') redirect('/campo');
  if (perfil.papel === 'compras' || perfil.papel === 'almoxarifado' || perfil.papel === 'financeiro') redirect('/suprimentos');
  if (perfil.papel === 'rh') redirect('/cadastros/funcionarios');
  if (perfil.papel === 'seguranca') redirect('/sst');
  redirect('/painel');
}
