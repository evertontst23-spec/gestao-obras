import { conteudoDoLink, type Pessoa } from './dados';
import { data } from '@/lib/formato';

export const metadata = { title: 'Documentos para admissão', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Dado({ rotulo, valor, largo = false }: { rotulo: string; valor: string | null; largo?: boolean }) {
  return (
    <div className={largo ? 'sm:col-span-3' : ''}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-concreto-500">{rotulo}</div>
      <div className={valor ? 'font-medium text-concreto-900' : 'text-atraso-600'}>{valor ?? 'não informado'}</div>
    </div>
  );
}

function Ficha({ p, n }: { p: Pessoa; n: number }) {
  const adicional = p.adicional_pct > 0 ? ` + adicional noturno ${p.adicional_pct.toLocaleString('pt-BR')}%` : '';
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-concreto-200 bg-superficie">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-concreto-200 bg-concreto-50 px-4 py-3">
        <h2 className="text-base font-bold text-concreto-900"><span className="mr-2 text-concreto-400">{n}.</span>{p.nome}</h2>
        <div className="text-sm text-concreto-600">{p.funcao} • {p.obra}</div>
      </header>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
        <Dado rotulo="CPF" valor={p.cpf} />
        <Dado rotulo="RG" valor={p.rg} />
        <Dado rotulo="Nascimento" valor={p.nascimento ? data(p.nascimento) : null} />
        <Dado rotulo="Admissão" valor={data(p.admissao)} />
        <Dado rotulo="Cargo" valor={p.funcao} />
        <Dado rotulo="Salário" valor={`${brl(p.salario)}${adicional}`} />
        <Dado rotulo="Telefone" valor={p.telefone} />
        <Dado rotulo="Endereço" valor={p.endereco} largo />
        <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-concreto-500">Cor / Raça</div>
            <div className="mt-1 h-7 rounded-md border border-dashed border-concreto-300 bg-concreto-50" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-concreto-500">Estado civil</div>
            <div className="mt-1 h-7 rounded-md border border-dashed border-concreto-300 bg-concreto-50" />
          </div>
        </div>
      </div>
      <div className="border-t border-concreto-200 px-4 py-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-concreto-500">
          Documentos enviados {p.documentos.length > 0 && <span className="text-concreto-400">({p.documentos.length})</span>}
        </div>
        {p.documentos.length === 0 ? (
          <p className="rounded-md bg-atraso-50 px-3 py-2 text-sm text-atraso-700">Nenhum documento entregue até agora.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {p.documentos.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noreferrer"
                 className="group overflow-hidden rounded-lg border border-concreto-200 bg-concreto-50 transition hover:border-sinal-400">
                <div className="flex h-28 items-center justify-center overflow-hidden bg-concreto-100">
                  {d.imagem && d.url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={d.url} alt={d.tipo} loading="lazy" className="h-full w-full object-cover" />
                    : <span className="text-3xl">📄</span>}
                </div>
                <div className="px-2 py-1.5">
                  <div className="truncate text-xs font-semibold text-concreto-800">{d.tipo}</div>
                  <div className="text-[11px] text-concreto-500">{d.imagem ? 'foto' : 'PDF'} • {data(d.em)}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default async function Admissao({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await conteudoDoLink(token);

  if (!c) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-600">CAD Engenharia</div>
        <h1 className="mt-2 text-xl font-bold">Link inválido, vencido ou desativado</h1>
        <p className="mt-2 text-concreto-600">Peça um link novo ao departamento pessoal da CAD.</p>
      </main>
    );
  }

  const obras = [...new Set(c.pessoas.map((p) => p.obra))];
  const semDoc = c.pessoas.filter((p) => p.documentos.length === 0).length;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16">
      <header className="-mx-4 mb-5 bg-concreto-900 px-4 py-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sinal-400">CAD Engenharia e Segurança do Trabalho</div>
        <h1 className="mt-1 text-xl font-bold">{c.titulo}</h1>
        <div className="text-sm text-concreto-300">CNPJ 69.263.235/0001-72 • {c.pessoas.length} funcionário(s) • link válido até {data(c.expira_em.slice(0, 10))}</div>
      </header>

      {c.observacao && <p className="mb-4 rounded-lg border border-sinal-200 bg-sinal-50 px-4 py-3 text-sm text-concreto-800">{c.observacao}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Funcionários', String(c.pessoas.length)], ['Obras', String(obras.length)],
          ['Documentos', String(c.pessoas.reduce((s, p) => s + p.documentos.length, 0))],
          ['Sem documento', String(semDoc)]].map(([a, b]) => (
          <div key={a} className="rounded-lg border border-concreto-200 bg-superficie p-3">
            <div className="text-[11px] font-semibold uppercase text-concreto-500">{a}</div>
            <div className="text-lg font-bold">{b}</div>
          </div>))}
      </div>

      <p className="mb-5 text-sm text-concreto-600">
        Clique em qualquer documento para abrir em tamanho grande ou baixar. <b>Cor/Raça</b> e <b>estado civil</b> não constam no
        nosso cadastro e aparecem em branco — serão preenchidos com o funcionário na assinatura do contrato.
      </p>

      {obras.map((o) => (
        <div key={o}>
          <h2 className="mb-3 mt-6 border-l-4 border-sinal-500 bg-sinal-50 px-3 py-2 font-bold text-concreto-900">
            {o} <span className="font-normal text-concreto-600">— {c.pessoas.filter((p) => p.obra === o).length} funcionário(s)</span>
          </h2>
          {c.pessoas.filter((p) => p.obra === o).map((p, i) => <Ficha key={p.id} p={p} n={i + 1} />)}
        </div>
      ))}

      <p className="mt-8 border-t border-concreto-200 pt-4 text-xs text-concreto-500">
        Documento de uso restrito, com dados pessoais protegidos pela LGPD. O link vence em {data(c.expira_em.slice(0, 10))} e pode
        ser desativado a qualquer momento pela CAD. Não encaminhe para terceiros.
      </p>
    </main>
  );
}
