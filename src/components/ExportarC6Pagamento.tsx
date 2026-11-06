import { Cartao, Campo } from '@/components/ui';
import { reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { recebedoresPagamento } from '@/lib/c6/pagamentos';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Cartão para baixar a planilha do C6 (Pix em massa) de um pagamento da folha */
export async function ExportarC6Pagamento({ supabase, pagamentoId, compacto = false }: { supabase: SB; pagamentoId: string; compacto?: boolean }) {
  const { pagamento, recebedores } = await recebedoresPagamento(supabase, pagamentoId);
  if (!pagamento) return null;
  const com = recebedores.filter((r) => r.chave); const sem = recebedores.filter((r) => !r.chave);
  const total = (ls: typeof recebedores) => ls.reduce((t, r) => t + r.valor, 0);
  const sugestao = pagamento.data_pagamento >= hojeISO() ? pagamento.data_pagamento : hojeISO();
  const rot = `${pagamento.tipo === 'saldo' ? 'Saldo' : pagamento.tipo === 'adiantamento' ? 'Adiantamento' : 'Pagamento'} de ${data(pagamento.data_pagamento).slice(0, 5)}`;
  return (
    <Cartao titulo={`Exportar para o C6 Bank — ${compacto ? rot : 'Pix em massa'}`} className="nao-imprimir mb-5">
      <form action={`/dp/pagamentos/${pagamento.id}/c6`} method="get" className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Data do pagamento"><input type="date" name="data" defaultValue={sugestao} min={hojeISO()} className="entrada" /></Campo>
        <button disabled={!com.length} className="rounded-md bg-teal-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">⬇ Baixar planilha do C6 ({com.length} Pix • {reais(total(com))})</button>
      </form>
      <p className="mt-2 text-xs text-concreto-500">Modelo oficial do C6 (aba “PIX chave ou código”). “Pagar à empresa” (IDERES, FÊNIX, Mundial, A2) vai num Pix só para a empresa; a equipe da CAD, um Pix por pessoa, já com os descontos. Quando pagar, dê baixa no pagamento.</p>
      <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Ver quem vai na planilha ({com.length}){sem.length ? ` • ${sem.length} sem chave Pix (${reais(total(sem))})` : ''}</summary>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <ul className="divide-y divide-concreto-100 text-sm">{com.map((r) => (
            <li key={r.tipo + r.id} className="flex justify-between gap-2 py-1"><span>{r.nome}{r.tipo === 'empresa' && <span className="text-xs text-concreto-500"> (empresa • {r.pessoas.length} func.)</span>}
              <span className="block font-mono text-xs text-concreto-500">{r.chave} • {r.tipoChave}</span></span><b className="font-mono">{reais(r.valor)}</b></li>))}</ul>
          {sem.length > 0 && (
            <div><p className="mb-1 text-sm font-semibold text-atraso-700">Ficam de fora (sem chave Pix ou chave inválida):</p>
              <ul className="divide-y divide-concreto-100 text-sm">{sem.map((r) => (
                <li key={r.tipo + r.id} className="flex justify-between gap-2 py-1"><span>{r.nome}{r.tipo === 'empresa' && ' (empresa — cadastre a chave em Benefícios › por empresa)'}{r.pixOriginal && <span className="block text-xs text-atraso-700">chave “{r.pixOriginal}” não reconhecida</span>}</span><b className="font-mono">{reais(r.valor)}</b></li>))}</ul></div>)}
        </div>
      </details>
    </Cartao>
  );
}
