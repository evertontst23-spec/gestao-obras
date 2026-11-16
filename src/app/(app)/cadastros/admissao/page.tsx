import { exigirPapel } from '@/lib/sessao';
import { origemPublica } from '@/lib/origem';
import { Cabecalho, Cartao, Campo, Selo, Vazio } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { CopiarTexto } from '@/components/CopiarTexto';
import { MarcarTodos } from '@/components/MarcarTodos';
import { gerarLinkAdmissao, revogarLinkAdmissao } from '../acoes';
import { data, dataHora } from '@/lib/formato';

export const metadata = { title: 'Link de admissão' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function LinkAdmissao() {
  const { supabase } = await exigirPapel('admin', 'rh');
  const [{ data: funcs }, { data: links }, { data: docs }] = await Promise.all([
    supabase.from('funcionarios')
      .select('id, nome, data_admissao, funcoes(nome), obras(nome), empregadores(nome, tipo)')
      .eq('ativo', true).is('data_demissao', null).order('nome'),
    supabase.from('links_admissao').select('*, perfis:criado_por(nome)').order('criado_em', { ascending: false }).limit(20),
    supabase.from('funcionario_documentos').select('funcionario_id').not('caminho', 'is', null),
  ]);
  const quantos = new Map<string, number>();
  (docs ?? []).forEach((d: any) => quantos.set(d.funcionario_id, (quantos.get(d.funcionario_id) ?? 0) + 1));
  const proprios = (funcs ?? []).filter((f: any) => (f.empregadores?.tipo ?? 'propria') === 'propria');
  const terceiros = (funcs ?? []).filter((f: any) => (f.empregadores?.tipo ?? 'propria') !== 'propria');
  const origem = await origemPublica();
  const agora = new Date();

  const Linha = ({ f, marcado }: { f: any; marcado: boolean }) => (
    <label className="flex items-center gap-3 border-b border-concreto-100 px-3 py-2 last:border-0 hover:bg-concreto-50">
      <input type="checkbox" name="funcionarios" value={f.id} defaultChecked={marcado} className="h-5 w-5 shrink-0 accent-sinal-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-concreto-900">{f.nome}</span>
        <span className="block truncate text-xs text-concreto-500">
          {f.funcoes?.nome ?? 'sem função'} • {f.obras?.nome ?? 'Escritório'} • admissão {data(f.data_admissao)}
          {f.empregadores?.nome && (f.empregadores?.tipo ?? 'propria') !== 'propria' ? ` • ${f.empregadores.nome}` : ''}
        </span>
      </span>
      <span className={`shrink-0 text-xs font-semibold ${quantos.get(f.id) ? 'text-ok-700' : 'text-atraso-600'}`}>
        {quantos.get(f.id) ?? 0} doc.
      </span>
    </label>
  );

  return (
    <>
      <Cabecalho titulo="Link de admissão para a contabilidade"
        sub="Gera um endereço que abre sem login, com os dados e as fotos dos documentos dos funcionários escolhidos. O link vence sozinho e pode ser desativado a qualquer momento." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Gerar um link" className="lg:col-span-2">
          <FormAcao acao={gerarLinkAdmissao}>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Título" className="sm:col-span-2">
                <input name="titulo" defaultValue="Documentos para admissão" className="entrada" />
              </Campo>
              <Campo rotulo="Validade (dias)" dica="de 1 a 180">
                <input name="dias" type="number" min={1} max={180} defaultValue={30} className="entrada" />
              </Campo>
              <Campo rotulo="Recado para a contabilidade" className="sm:col-span-3">
                <input name="observacao" placeholder="Ex.: pessoal da obra que ainda não foi fichado" className="entrada" />
              </Campo>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-concreto-700">Equipe própria (CAD) — {proprios.length}</span>
              <MarcarTodos nome="funcionarios" />
            </div>
            <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border border-concreto-200 bg-superficie">
              {proprios.length ? proprios.map((f: any) => <Linha key={f.id} f={f} marcado />) : <Vazio>Nenhum funcionário próprio ativo.</Vazio>}
            </div>

            {terceiros.length > 0 && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-semibold text-concreto-700">
                  Funcionários de outras empresas — {terceiros.length} (normalmente não vão para a nossa contabilidade)
                </summary>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-concreto-200 bg-superficie">
                  {terceiros.map((f: any) => <Linha key={f.id} f={f} marcado={false} />)}
                </div>
              </details>
            )}

            <Botao>Gerar link</Botao>
            <p className="mt-2 text-xs text-concreto-500">
              Quem tiver o endereço vê os documentos sem precisar de senha. Envie só para a contabilidade e desative o link quando a admissão terminar.
            </p>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Links gerados">
          {!links?.length ? <Vazio>Nenhum link gerado ainda.</Vazio> : (
            <div className="grid gap-3">
              {links.map((l: any) => {
                const vencido = new Date(l.expira_em) <= agora;
                const ativo = !l.revogado_em && !vencido;
                return (
                  <div key={l.token} className="rounded-lg border border-concreto-200 bg-superficie p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{l.titulo}</div>
                        <div className="text-xs text-concreto-500">
                          {l.funcionarios?.length ?? 0} funcionário(s) • por {l.perfis?.nome ?? '—'} em {dataHora(l.criado_em)}
                        </div>
                      </div>
                      {l.revogado_em ? <Selo cor="bg-concreto-200 text-concreto-600">Desativado</Selo>
                        : vencido ? <Selo cor="bg-atencao-100 text-atencao-800">Vencido</Selo>
                        : <Selo cor="bg-ok-50 text-ok-700">Ativo</Selo>}
                    </div>
                    <div className="mt-2 text-xs text-concreto-600">
                      {ativo ? <>Vence em {data(l.expira_em.slice(0, 10))}</> : <>Venceu em {data(l.expira_em.slice(0, 10))}</>}
                      {l.acessos > 0 && <> • aberto {l.acessos}× (último {dataHora(l.ultimo_acesso)})</>}
                    </div>
                    {ativo && (
                      <>
                        <input readOnly value={`${origem}/p/admissao/${l.token}`}
                          className="entrada mt-2 font-mono text-[11px]" />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CopiarTexto texto={`${origem}/p/admissao/${l.token}`} />
                          <a className="rounded-md border border-concreto-300 bg-superficie px-3 py-2 text-sm font-semibold"
                             href={`/p/admissao/${l.token}`} target="_blank" rel="noreferrer">Abrir</a>
                          <FormAcao acao={revogarLinkAdmissao}>
                            <input type="hidden" name="token" value={l.token} />
                            <Botao variante="secundario">Desativar</Botao>
                          </FormAcao>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
