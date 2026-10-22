import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao } from '@/components/ui';
import { FormAcao } from '@/components/formulario';
import { CamposObra } from '@/components/FormObra';
import { criarObra } from '../acoes';
import type { Perfil } from '@/lib/dominio';

export const metadata = { title: 'Nova obra' };

export default async function NovaObra() {
  const { supabase } = await exigirPapel('admin', 'engenheiro');
  const { data: pessoas } = await supabase.from('perfis').select('*').eq('ativo', true).order('nome');
  const lista = (pessoas ?? []) as Perfil[];
  return (
    <>
      <Cabecalho titulo="Nova obra" />
      <Cartao>
        <FormAcao acao={criarObra}>
          <CamposObra rotulo="Cadastrar obra"
            engenheiros={lista.filter((p) => p.papel === 'engenheiro')}
            encarregados={lista.filter((p) => p.papel === 'encarregado')} />
        </FormAcao>
      </Cartao>
    </>
  );
}
