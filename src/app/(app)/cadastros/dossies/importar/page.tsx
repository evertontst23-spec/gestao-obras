import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { importarDocumentosFicha } from '../../acoes';

export const metadata = { title: 'Importar documentos da ficha' };

/** Traz para as pastas os documentos que os trabalhadores enviaram na ficha de inscrição */
export default async function ImportarFicha() {
  await exigirPapel('admin', 'rh');
  return (
    <>
      <Cabecalho titulo="Importar documentos da ficha de inscrição" sub={<Link className="link" href="/cadastros/dossies">← Dossiês</Link>} />
      <Cartao>
        <FormAcao acao={importarDocumentosFicha} className="space-y-3">
          <label htmlFor="linhas" className="text-sm text-concreto-600">Uma linha por arquivo: <b>matrícula ; tipo ; link temporário</b> (tipos: Foto, RG (frente), RG (verso), CPF, CTPS, Comprovante de residência)</label>
          <textarea id="linhas" name="linhas" rows={14} className="entrada font-mono text-xs" placeholder="1023 ; CPF ; https://…/fichas-admissao/…" />
          <Botao>Guardar nas pastas</Botao>
        </FormAcao>
      </Cartao>
    </>
  );
}
