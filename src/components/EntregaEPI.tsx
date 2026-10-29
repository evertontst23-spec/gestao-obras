'use client';
import { textoFalha } from '@/lib/falha';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrarEntregaEPI } from '@/app/(app)/sst/acoes';

type Func = { id: string; nome: string; matricula: string; funcao: string; biometria: boolean };
type Epi = { id: string; codigo: string; descricao: string; unidade: string; ca: string | null; ca_validade: string | null };
const MOTIVOS: [string, string][] = [['admissao', 'Admissão (kit inicial)'], ['periodica', 'Troca periódica'], ['desgaste', 'Desgaste'], ['dano', 'Dano'], ['perda', 'Perda'], ['substituicao', 'Substituição'], ['visitante', 'Visitante']];

/**
 * Entrega de EPI: escolhe o funcionário e os EPIs; a baixa sai do estoque e a entrega vai para a ficha,
 * onde o funcionário assina CADA EPI (assinatura ou rosto) — NR-06.
 */
export function EntregaEPI({ funcionarios, epis, locais, saldos, hoje, inicial }:
  { funcionarios: Func[]; epis: Epi[]; locais: { id: string; nome: string }[]; saldos: Record<string, number>; hoje: string; inicial?: string; podeCadastrarRosto?: boolean }) {
  const router = useRouter();
  const [func, setFunc] = useState(inicial ?? '');
  const [local, setLocal] = useState('');
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('admissao');
  const [dataEntrega, setDataEntrega] = useState(hoje);
  const [obs, setObs] = useState('');
  const [entregador, setEntregador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const saldo = (ins: string) => saldos[`${local || 'c'}:${ins}`] ?? 0;

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const itens = Object.entries(qtd).map(([id, q]) => ({ insumo_id: id, quantidade: Number(q.replace(',', '.')) })).filter((i) => i.quantidade > 0);
    if (!func) return setMsg({ erro: 'Selecione o funcionário.' });
    if (!itens.length) return setMsg({ erro: 'Informe a quantidade de pelo menos um EPI.' });
    if (!entregador) return setMsg({ erro: 'Informe quem entregou o EPI.' });
    setEnviando(true);
    try {
      const r = await registrarEntregaEPI({ funcionario: func, local: local || null, itens, motivo, data: dataEntrega || null, obs: obs || null, entregador });
      if (r?.erro) setMsg(r); else router.push(`/sst/epi/ficha/${func}`);
    } catch (er) { setMsg({ erro: textoFalha(er) }); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Funcionário *</span>
          <select value={func} onChange={(e) => setFunc(e.target.value)} className="entrada" required>
            <option value="">Selecionar…</option>{funcionarios.map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.funcao}{x.biometria ? ' 🙂' : ''}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Data da entrega *</span>
          <input type="date" value={dataEntrega} max={hoje} required onChange={(e) => setDataEntrega(e.target.value)} className="entrada" /></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Entregue por *</span>
          <select value={entregador} onChange={(e) => setEntregador(e.target.value)} className="entrada" required>
            <option value="">Quem entregou o EPI…</option>{funcionarios.filter((x) => x.id !== func).map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.funcao}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Sai do estoque de</span>
          <select value={local} onChange={(e) => setLocal(e.target.value)} className="entrada">
            <option value="">Depósito central</option>{locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      </div>
      <div className="overflow-x-auto rounded-md border border-concreto-200">
        <table className="tabela">
          <thead><tr><th>EPI</th><th>CA</th><th className="text-right">Estoque</th><th className="w-28">Qtd.</th></tr></thead>
          <tbody>{epis.map((e) => {
            const venc = e.ca_validade && e.ca_validade < hoje;
            return (
              <tr key={e.id} className={venc || !e.ca ? 'opacity-50' : ''}>
                <td>{e.descricao}<div className="font-mono text-[11px] text-concreto-500">{e.codigo}</div></td>
                <td className="text-xs">{e.ca ?? <b className="text-atraso-700">sem CA</b>}{venc && <div className="font-bold text-atraso-700">vencido</div>}</td>
                <td className={`text-right font-mono text-sm ${saldo(e.id) <= 0 ? 'text-atraso-700' : ''}`}>{saldo(e.id)} {e.unidade}</td>
                <td><input inputMode="numeric" disabled={!!venc || !e.ca} value={qtd[e.id] ?? ''} onChange={(ev) => setQtd({ ...qtd, [e.id]: ev.target.value })} className="entrada" placeholder="0" /></td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-semibold">Motivo</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="entrada">{MOTIVOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-sm font-semibold">Observação</span><input value={obs} onChange={(e) => setObs(e.target.value)} className="entrada" /></label>
      </div>
      <p className="rounded-md bg-concreto-50 px-3 py-2 text-xs text-concreto-600">Ao registrar, o estoque é baixado e a ficha de EPI do funcionário abre para ele <b>assinar cada EPI</b> (assinatura na tela ou reconhecimento facial), como pede a NR-06.</p>
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{msg.erro}</p>}
      <button type="submit" disabled={enviando} className="min-h-[52px] w-full rounded-md bg-sinal-500 text-base font-semibold text-white disabled:opacity-60">{enviando ? 'Registrando…' : 'Registrar e colher as assinaturas'}</button>
    </form>
  );
}
