'use client';
import { textoFalha } from '@/lib/falha';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Assinatura, enviarAssinatura, type AssinaturaRef } from './Assinatura';
import { CapturaRosto } from './CapturaRosto';
import { CadastroBiometria } from './CadastroBiometria';
import { entregarEPI } from '@/app/(app)/sst/acoes';

type Func = { id: string; nome: string; matricula: string; funcao: string; biometria: boolean };
type Epi = { id: string; codigo: string; descricao: string; unidade: string; ca: string | null; ca_validade: string | null };
const MOTIVOS: [string, string][] = [['admissao', 'Admissão (kit inicial)'], ['periodica', 'Troca periódica'], ['desgaste', 'Desgaste'], ['dano', 'Dano'], ['perda', 'Perda'], ['substituicao', 'Substituição'], ['visitante', 'Visitante']];

export function EntregaEPI({ funcionarios, epis, locais, saldos, hoje, podeCadastrarRosto = false }:
  { funcionarios: Func[]; epis: Epi[]; locais: { id: string; nome: string }[]; saldos: Record<string, number>; hoje: string; podeCadastrarRosto?: boolean }) {
  const router = useRouter();
  const ass = useRef<AssinaturaRef>(null);
  const [func, setFunc] = useState('');
  const [local, setLocal] = useState('');
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('admissao');
  const [conf, setConf] = useState<'assinatura' | 'facial'>('facial');
  const [comRosto, setComRosto] = useState<Set<string>>(() => new Set(funcionarios.filter((x) => x.biometria).map((x) => x.id)));
  const [recemCadastrado, setRecemCadastrado] = useState(false);
  const [descritor, setDescritor] = useState<number[] | null>(null);
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string; id?: string } | null>(null);
  const f = funcionarios.find((x) => x.id === func);
  const temRosto = !!func && comRosto.has(func);
  const saldo = (ins: string) => saldos[`${local || 'c'}:${ins}`] ?? 0;

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const itens = Object.entries(qtd).map(([id, q]) => ({ insumo_id: id, quantidade: Number(q.replace(',', '.')) })).filter((i) => i.quantidade > 0);
    if (!func) return setMsg({ erro: 'Selecione o funcionário.' });
    if (!itens.length) return setMsg({ erro: 'Informe a quantidade de pelo menos um EPI.' });
    if (conf === 'assinatura' && ass.current?.vazia()) return setMsg({ erro: 'Colete a assinatura do funcionário.' });
    if (conf === 'facial' && !descritor) return setMsg({ erro: 'Capture o rosto do funcionário.' });
    setEnviando(true);
    try {
      let caminho: string | null = null;
      if (conf === 'assinatura') caminho = await enviarAssinatura((await ass.current!.blob())!, `sst/epi/${func}`);
      const r = await entregarEPI({ funcionario: func, local: local || null, itens, motivo, confirmacao: conf, assinatura: caminho, descritor, obs: obs || null });
      setMsg(r);
      if (r?.ok) { setQtd({}); setDescritor(null); ass.current?.limpar(); router.refresh(); }
    } catch (er) { setMsg({ erro: textoFalha(er) }); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-semibold">Funcionário *</span>
          <select value={func} onChange={(e) => { const id = e.target.value; setFunc(id); setDescritor(null); setRecemCadastrado(false);
            setConf(comRosto.has(id) || podeCadastrarRosto ? 'facial' : 'assinatura'); }} className="entrada" required>
            <option value="">Selecionar…</option>{funcionarios.map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.funcao}{comRosto.has(x.id) ? ' 🙂' : ''}</option>)}</select></label>
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
      <div className="rounded-md border border-concreto-200 p-3">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-concreto-100 p-1 text-sm font-semibold">
          <button type="button" onClick={() => setConf('facial')} disabled={!!func && !temRosto && !podeCadastrarRosto}
            title={func && !temRosto && !podeCadastrarRosto ? 'Funcionário sem rosto cadastrado — peça ao RH ou à Segurança' : ''}
            className={`min-h-[40px] rounded disabled:opacity-40 ${conf === 'facial' ? 'bg-white shadow' : 'text-concreto-600'}`}>🙂 Reconhecimento facial</button>
          <button type="button" onClick={() => setConf('assinatura')} className={`min-h-[40px] rounded ${conf === 'assinatura' ? 'bg-white shadow' : 'text-concreto-600'}`}>✍ Assinatura</button>
        </div>
        <p className="mb-2 text-xs text-concreto-600">Declaro ter recebido os EPIs acima, gratuitamente, e ter sido orientado sobre uso, guarda e conservação (NR-06, 6.7.1). {conf === 'facial' && 'A confirmação pelo rosto vale como assinatura do recebimento.'}</p>
        {conf === 'assinatura' ? <Assinatura ref={ass} />
          : !func ? <p className="rounded bg-concreto-50 p-3 text-sm text-concreto-600">Selecione o funcionário para confirmar pelo rosto.</p>
          : temRosto ? (
            <div className="space-y-2">
              {recemCadastrado && <p className="rounded bg-ok-50 px-3 py-2 text-sm font-semibold text-ok-700">Rosto cadastrado. Agora confirme a entrega olhando para a câmera.</p>}
              <CapturaRosto key={func + String(recemCadastrado)} onCaptura={(d) => setDescritor(d)} rotulo={`Confirmar recebimento pelo rosto de ${f?.nome ?? ''}`} />
              {descritor && <p className="text-sm font-semibold text-ok-700">✓ Rosto capturado — clique em Registrar entrega.</p>}
            </div>)
          : podeCadastrarRosto ? (
            <div className="space-y-2">
              <p className="rounded bg-atencao-50 px-3 py-2 text-sm font-semibold text-atencao-800">{f?.nome} ainda não tem o rosto cadastrado. Cadastre agora (uma vez só) e em seguida confirme a entrega.</p>
              <CadastroBiometria funcionario={func} nome={f?.nome ?? ''} aoConcluir={() => { setComRosto(new Set([...comRosto, func])); setRecemCadastrado(true); }} />
            </div>)
          : <p className="rounded bg-atencao-50 p-3 text-sm">Este funcionário não tem o rosto cadastrado. Use a assinatura ou peça ao RH / Segurança para cadastrar.</p>}
      </div>
      {msg?.erro && <p role="alert" className="rounded-md bg-atraso-50 px-3 py-2 text-sm font-medium text-atraso-700">{msg.erro}</p>}
      {msg?.ok && <p className="rounded-md bg-ok-50 px-3 py-2 text-sm font-medium text-ok-700">{msg.ok} <a href={`/sst/epi/ficha/${func}`} className="underline">Ver ficha de EPI</a></p>}
      <button type="submit" disabled={enviando} className="min-h-[52px] w-full rounded-md bg-sinal-500 text-base font-semibold text-white disabled:opacity-60">{enviando ? 'Registrando…' : 'Registrar entrega'}</button>
    </form>
  );
}
