import Link from 'next/link';
import { Botao, FormAcao } from '@/components/formulario';
import { clienteAnonimo, pedirCorrecao } from './acoes';

export const metadata = { title: 'Meu espelho de ponto', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Dia = { data: string; dia_semana: number; feriado: string | null; marcacoes: { t: string; h: string; m: string; x?: string }[];
  trabalhado_min: number; he_util_min: number; he_100_min: number; atraso_min: number; falta: boolean; abonado: boolean; incompleto: boolean };
type Resp = { funcionario: { nome: string; matricula: string; funcao: string | null; obra: string | null; admissao: string }; mes: string; fechada: boolean;
  dias: Dia[]; pedidos: { data: string; mensagem: string; status: string; resposta: string | null; criado_em: string }[] };
const SEM = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
const dt = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const nomeMes = (m: string) => new Date(m + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const somaMes = (m: string, n: number) => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b - 1 + n, 1)).toISOString().slice(0, 7); };

export default async function MeuPonto({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const mesQ = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : null;
  const { data, error } = await (await clienteAnonimo()).rpc('espelho_publico', { p_token: token, p_mes: mesQ });
  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-sinal-600">Gestão de Obras</div>
        <h1 className="mt-2 text-xl font-bold">Link inválido ou desativado</h1>
        <p className="mt-2 text-concreto-600">Peça um novo link do espelho de ponto ao RH.</p>
      </main>);
  }
  const r = data as Resp;
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
  const atual = hoje.slice(0, 7);
  const tot = (k: keyof Dia) => r.dias.reduce((s, d) => s + Number(d[k] || 0), 0);
  const faltas = r.dias.filter((d) => d.falta).length;
  const diasPedido = [...r.dias].reverse().filter((d) => d.data <= hoje);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16">
      <header className="-mx-4 mb-4 bg-concreto-900 px-4 py-4 text-white">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-sinal-400">Meu espelho de ponto</div>
        <div className="mt-1 text-lg font-bold">{r.funcionario.nome}</div>
        <div className="text-sm text-concreto-300">Matrícula {r.funcionario.matricula}{r.funcionario.funcao ? ` • ${r.funcionario.funcao}` : ''}{r.funcionario.obra ? ` • ${r.funcionario.obra}` : ''}</div>
      </header>
      <nav className="mb-4 flex items-center justify-between">
        <Link href={`?mes=${somaMes(r.mes, -1)}`} className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">← Anterior</Link>
        <div className="text-center font-semibold">{nomeMes(r.mes).replace(/^./, (c) => c.toUpperCase())}{r.fechada && <div className="text-xs font-normal normal-case text-concreto-500">folha fechada</div>}</div>
        {r.mes < atual ? <Link href={`?mes=${somaMes(r.mes, 1)}`} className="rounded-md border border-concreto-300 bg-white px-3 py-2 text-sm font-semibold">Próximo →</Link> : <span className="w-[92px]" />}
      </nav>
      <div className="mb-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[['Trabalhado', hm(tot('trabalhado_min'))], ['Hora extra', hm(tot('he_util_min') + tot('he_100_min'))], ['Atrasos', hm(tot('atraso_min'))], ['Faltas', String(faltas)]].map(([a, b]) => (
          <div key={a} className="rounded-lg border border-concreto-200 bg-white p-3"><div className="text-[11px] font-semibold uppercase text-concreto-500">{a}</div><div className="font-mono text-lg font-bold">{b}</div></div>))}
      </div>
      <div className="overflow-hidden rounded-lg border border-concreto-200 bg-white">
        {r.dias.length === 0 && <p className="p-4 text-sm text-concreto-500">Nenhum dia neste mês.</p>}
        {r.dias.map((d) => (
          <div key={d.data} className={`flex items-center justify-between gap-2 border-b border-concreto-100 px-3 py-2 text-sm ${d.dia_semana === 7 || d.feriado ? 'bg-concreto-50' : ''}`}>
            <div className="w-16 shrink-0 font-mono">{dt(d.data)} <span className="text-xs text-concreto-500">{SEM[d.dia_semana]}</span></div>
            <div className="flex-1 font-mono text-xs">
              {d.marcacoes.map((x, i) => <span key={i} className={`mr-1.5 inline-block ${x.x ? 'text-concreto-400 line-through' : ''}`}>{x.h}</span>)}
              {d.falta && <span className="font-sans font-semibold text-atraso-700">Falta</span>}
              {d.abonado && <span className="font-sans text-sky-700">Abonado</span>}
              {d.incompleto && <span className="font-sans font-semibold text-atencao-700">Incompleto</span>}
              {d.feriado && !d.marcacoes.length && <span className="font-sans text-concreto-500">{d.feriado}</span>}
            </div>
            <div className="text-right font-mono text-xs">
              {d.trabalhado_min > 0 && <div>{hm(d.trabalhado_min)}</div>}
              {d.he_util_min + d.he_100_min > 0 && <div className="text-atencao-700">+{hm(d.he_util_min + d.he_100_min)} HE</div>}
              {d.atraso_min > 0 && <div className="text-atraso-700">−{hm(d.atraso_min)}</div>}
            </div>
          </div>))}
      </div>
      <p className="mt-2 text-xs text-concreto-500">Horários riscados foram corrigidos pelo RH (o original fica guardado).</p>

      <section className="mt-6 rounded-lg border border-concreto-200 bg-white p-4">
        <h2 className="mb-1 font-bold">Algo errado? Peça a correção</h2>
        <p className="mb-3 text-sm text-concreto-600">Escolha o dia e explique. O RH confere e responde aqui.</p>
        {r.fechada && r.mes !== atual && <p className="mb-3 text-xs text-concreto-500">A folha deste mês já foi fechada; pedidos de dias deste mês serão analisados pelo RH separadamente.</p>}
        <FormAcao acao={pedirCorrecao} limparAoConcluir className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <select name="data" required className="entrada">{diasPedido.map((d) => <option key={d.data} value={d.data}>{dt(d.data)} ({SEM[d.dia_semana]}) — {d.marcacoes.filter((x) => !x.x).map((x) => x.h).join(' ') || 'sem marcação'}</option>)}</select>
          <textarea name="mensagem" required minLength={5} maxLength={1000} rows={3} placeholder="ex.: Entrei às 7h e o tablet não registrou." className="entrada" />
          <Botao grande>Enviar pedido ao RH</Botao>
        </FormAcao>
      </section>

      {r.pedidos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">Meus pedidos</h2>
          <div className="space-y-2">{r.pedidos.map((p, i) => (
            <div key={i} className="rounded-lg border border-concreto-200 bg-white p-3 text-sm">
              <div className="flex justify-between"><b>{dt(p.data)}</b>
                <span className={`rounded px-2 text-xs font-semibold ${p.status === 'aberta' ? 'bg-atencao-100 text-atencao-800' : p.status === 'corrigida' ? 'bg-ok-50 text-ok-700' : 'bg-concreto-100 text-concreto-600'}`}>{p.status === 'aberta' ? 'Aguardando o RH' : p.status === 'corrigida' ? 'Corrigido' : 'Não aceito'}</span></div>
              <p className="mt-1 text-concreto-700">{p.mensagem}</p>
              {p.resposta && <p className="mt-1 rounded bg-concreto-50 px-2 py-1 text-concreto-600">RH: {p.resposta}</p>}
            </div>))}</div>
        </section>)}
      <p className="mt-8 text-center text-xs text-concreto-400">Link pessoal — não compartilhe. Em caso de dúvida, procure o RH.</p>
    </main>
  );
}
