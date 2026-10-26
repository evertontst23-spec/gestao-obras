import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao } from '@/components/ui';
import { ImportarFicha } from '@/components/ImportarFicha';

export const metadata = { title: 'Importar documentos da ficha' };

/** Traz para as pastas os documentos que os trabalhadores enviaram na ficha de inscrição */
export default async function ImportarFichaPagina() {
  await exigirPapel('admin', 'rh');
  return (
    <>
      <Cabecalho titulo="Importar documentos da ficha de inscrição" sub={<Link className="link" href="/cadastros/dossies">← Dossiês</Link>} />
      <Cartao><ImportarFicha /></Cartao>
    </>
  );
}
