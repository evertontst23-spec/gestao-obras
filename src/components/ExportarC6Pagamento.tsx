import { Cartao, Campo } from '@/components/ui';
import { reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { recebedoresPagamento } from '@/lib/c6/pagamentos';

type SB = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Cartão para baixar a planilha do C6 (Pix em massa) de um pagamento da folha, escolhendo as obras que entram */
export async function ExportarC6Pagamento({ supabase, pagamentoId, compacto = false }: { supabase: SB; pagamentoId: string; compacto?: boolean }) {
  const { pagamento, recebedores } = await recebedoresPagamento(supabase, pagamentoId);
  if (!pagamento) return null;
  const { data: itens } = await supabase.from('pagamento_itens').select('obra_id, obras(nome)').eq('pagamento_id', pagamentoId).eq('removido', false);
  const obras = new Map<string, string>();
  ((itens ?? []) as { obra_id: string | null; obras: { nome: string } | null }[]).forEach((i) => obras.set(i.obra_id ?? 'sem', i.obras?.nome ?? 'Escritório / sem obra'));
  const total = (ls: typeof recebedores) => ls.reduce((t, r) => t + r.valor, 0);
  const sugestao = pagamento.data_pagamento >= hojeISO() ? pagamento.data_pagamento : hojeISO();
  const rot = `${pagamento.tipo === 'saldo' ? 'Saldo' : pagamento.tipo === 'adiantamento' ? 'Adiantamento' : 'Pagamento'} de ${data(pagamento.data_pagamento).slice(0, 5)}`;
  const porObra = [...obras.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k, nome]) => ({ k, nome, ls: recebedores.filter((r) => r.obra === nome) }));
  return (
    <Cartao titulo={`Exportar para o C6 Bank — ${compacto ? rot : 'Pix em massa'}`} className="nao-imprimir mb-5">
      <form action={`/dp/pagamentos/${pagamento.id}/c6`} method="get" className="space-y-3">
        <div>
          <p className="mb-1 text-sm font-semibold">Obras que entram nesta planilha <span className="font-normal text-concreto-500">(desmarque as que vão esperar)</span></p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{porObra.map(({ k, nome, ls }) => {
            const com = ls.filter((r) => r.chave);
            return (
              <label key={k} className="flex items-start gap-2 rounded-md border border-concreto-200 p-2 text-sm">
                <input type="checkbox" name="obra" value={k} defaultChecked className="mt-1" />
                <span><b>{nome}</b><span className="block text-xs text-concreto-500">{com.length} Pix • {reais(total(com))}{ls.length > com.length ? ` • ${ls.length - com.length} sem chave` : ''}</span></span>
              </label>);
          })}</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Data do pagamento"><input type="date" name="data" defaultValue={sugestao} min={hojeISO()} className="entrada" /></Campo>
          <button className="rounded-md bg-teal-700 px-4 py-2.5 font-semibold text-white">⬇ Baixar planilha do C6 (obras marcadas)</button>
        </div>
      </form>
      <p className="mt-2 text-xs text-concreto-500">Modelo oficial do C6 (aba “PIX chave ou código”). Empresas (IDERES, FÊNIX, Mundial, A2): um Pix por empresa em cada obra; equipe da CAD: um Pix por pessoa, já com os descontos. Quem está sem chave Pix fica de fora.</p>
      <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Ver quem está em cada obra</summary>
        <div className="mt-2 grid gap-4 md:grid-cols-2">{porObra.map(({ k, nome, ls }) => (
          <div key={k}><p className="mb-1 text-sm font-bold">{nome}</p>
            <ul className="divide-y divide-concreto-100 text-sm">{ls.map((r) => (
              <li key={r.tipo + r.id + r.obra} className="flex justify-between gap-2 py-1"><span>{r.nome}{r.tipo === 'empresa' && <span className="text-xs text-concreto-500"> (empresa • {r.pessoas.length} func.)</span>}
                <span className={`block font-mono text-xs ${r.chave ? 'text-concreto-500' : 'text-atraso-700'}`}>{r.chave ? `${r.chave} • ${r.tipoChave}` : r.pixOriginal ? `chave “${r.pixOriginal}” não reconhecida` : 'sem chave Pix — fica de fora'}</span></span>
                <b className="font-mono">{reais(r.valor)}</b></li>))}</ul></div>))}</div>
      </details>
    </Cartao>
  );
}
