'use client';
import { UploadArquivo } from './UploadArquivo';
import { anexarComprovantePagamento } from '@/app/(app)/dp/pagamentos/acoes';

/** Anexa o comprovante do lote do C6 a todas as contas a pagar deste pagamento de uma vez. */
export function ComprovanteMassaPagamento({ id, temComprovante }: { id: string; temComprovante: boolean }) {
  return (
    <UploadArquivo pasta="fin/comprovantes" acao={anexarComprovantePagamento} rotuloBotao={temComprovante ? 'Trocar comprovante do lote' : 'Anexar comprovante do lote'}>
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-concreto-500">{temComprovante
        ? 'Substituir o comprovante anexado em todas as contas deste pagamento.'
        : 'Depois de fazer o Pix em massa no C6, envie aqui o comprovante do lote (PDF ou foto). Ele é anexado de uma vez em todas as contas a pagar deste pagamento.'}</p>
    </UploadArquivo>
  );
}
