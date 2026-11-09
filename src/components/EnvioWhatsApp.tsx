'use client';
import { Icone } from '@/components/Icone';
import { useMemo, useState } from 'react';
import { registrarEnvioCotacao } from '@/app/(app)/suprimentos/acoes';

type Forn = { id: string; nome: string; telefone: string | null };
type Item = { descricao: string; quantidade: number; unidade: string };

/** Número no formato do WhatsApp (55 + DDD + número). Vazio = o WhatsApp pede para escolher o contato. */
export function numeroWhatsApp(tel: string) {
  const d = tel.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  return d.length <= 11 ? `55${d}` : d;
}

/** Pedido de cotação pronto para mandar ao fornecedor pelo WhatsApp (o envio fica registrado na cotação). */
export function EnvioWhatsApp({ cotacao, codigo, obra, prazo, itens, fornecedores, linkPdf }:
  { cotacao: string; codigo: string; obra: string; prazo: string | null; itens: Item[]; fornecedores: Forn[]; linkPdf: string }) {
  const [forn, setForn] = useState('');
  const [tel, setTel] = useState('');
  const nomeForn = fornecedores.find((f) => f.id === forn)?.nome;
  const padrao = useMemo(() => [
    `Olá${nomeForn ? `, ${nomeForn}` : ''}! Aqui é do setor de compras da *CAD Engenharia*.`,
    `Pedimos cotação (${codigo}) para a obra *${obra}*:`,
    '',
    ...itens.map((i, k) => `${k + 1}. ${i.descricao} — *${String(i.quantidade).replace('.', ',')} ${i.unidade}*`),
    '',
    'Por favor, informe:',
    '• preço unitário de cada item',
    '• prazo de entrega e frete',
    '• forma de pagamento (PIX, boleto, cartão de crédito ou dinheiro)',
    ...(prazo ? [`Precisamos do material até ${prazo}.`] : []),
    '',
    'Pode responder aqui mesmo, com foto ou PDF do orçamento. Obrigado!',
  ].join('\n'), [nomeForn, codigo, obra, itens, prazo]);
  const [texto, setTexto] = useState<string | null>(null);
  const msg = texto ?? padrao;
  const num = numeroWhatsApp(tel);
  const link = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Fornecedor
          <select value={forn} onChange={(e) => { setForn(e.target.value); setTel(fornecedores.find((f) => f.id === e.target.value)?.telefone ?? ''); setTexto(null); }} className="entrada mt-1">
            <option value="">Escolher… (ou deixe em branco)</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
        <label className="block text-sm font-semibold">WhatsApp do fornecedor
          <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="81 9 9999-9999" className="entrada mt-1" />
          <span className="text-xs font-normal text-concreto-500">{num ? `Vai abrir a conversa com +${num}` : 'Sem número: o WhatsApp pede para escolher o contato'}</span></label>
      </div>
      <label className="block text-sm font-semibold">Mensagem (pode editar)
        <textarea value={msg} onChange={(e) => setTexto(e.target.value)} rows={10} className="entrada mt-1 font-mono text-xs" /></label>
      <div className="flex flex-wrap gap-2">
        <a href={link} target="_blank" rel="noreferrer"
          onClick={() => { registrarEnvioCotacao(cotacao, forn || null, tel || null).catch(() => {}); }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-bold text-white hover:brightness-95">🟢 Enviar pelo WhatsApp</a>
        <button type="button" onClick={async () => { await navigator.clipboard.writeText(msg).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
          className="inline-flex min-h-[44px] items-center rounded-md border border-concreto-300 bg-white px-3 text-sm font-semibold">{copiado ? '✓ Copiado' : 'Copiar mensagem'}</button>
        <a href={linkPdf} target="_blank" className="inline-flex min-h-[44px] items-center rounded-md border border-concreto-300 bg-white px-3 text-sm font-semibold"><Icone nome="imprimir" className="mr-1.5 h-4 w-4" />PDF do pedido de cotação</a>
      </div>
    </div>
  );
}
