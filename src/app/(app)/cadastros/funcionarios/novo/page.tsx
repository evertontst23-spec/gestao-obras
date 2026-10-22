import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Vazio } from '@/components/ui';
import { FormAcao } from '@/components/formulario';
import { CamposFuncionario } from '@/components/FormFuncionario';
import { criarFuncionario } from '../../acoes';

export const metadata = { title: 'Novo funcionário' };

export default async function NovoFuncionario() {
  const { supabase } = await exigirPapel('admin', 'rh');
  const [{ data: empregadores }, { data: funcoes }, { data: obras }] = await Promise.all([
    supabase.from('empregadores').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('funcoes').select('*').eq('ativo', true).order('nome'),
    supabase.from('obras').select('id, codigo, nome').not('situacao', 'in', '(concluida,cancelada)').order('nome'),
  ]);
  if (!funcoes?.length) return <><Cabecalho titulo="Novo funcionário" /><Vazio>Cadastre antes as funções e salários. <Link href="/cadastros/funcoes" className="link">Ir para funções</Link></Vazio></>;
  return (
    <>
      <Cabecalho titulo="Novo funcionário" />
      <Cartao><FormAcao acao={criarFuncionario}><CamposFuncionario funcoes={funcoes} obras={obras ?? []} empregadores={empregadores ?? []} rotulo="Cadastrar e abrir dossiê" /></FormAcao></Cartao>
    </>
  );
}
