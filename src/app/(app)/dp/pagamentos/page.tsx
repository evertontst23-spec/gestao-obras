import Link from 'next/link';
import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Campo, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { AbasDP } from '@/components/AbasDP';
import { Botao, FormAcao } from '@/components/formulario';
import { reais } from '@/lib/dominio';
import { data, hojeISO } from '@/lib/formato';
import { criarPagamento } from './acoes';
import { STATUS_PAG, TIPO_PAG } from './comum';

export const metadata = { title: 'Pagamentos' };

/** Sugere a próxima data (dia 20 ou dia 05) e o período de passagens/alimentação */
function sugestao(hoje: string) {
  const [a, m, d] = hoje.split('-').map(Number);
  const iso = (y: number, mm: number, dd: number) => new Date(Date.UTC(y, mm - 1, dd)).toISOString().slice(0, 10);
  if (d <= 5) return { data: iso(a, m, 5), tipo: 'saldo', ini: iso(a, m, 6), fim: iso(a, m, 19) };
  if (d <= 20) return { data: iso(a, m, 20), tipo: 'adiantamento', ini: iso(a, m, 20), fim: iso(a, m + 1, 0) };
  return { data: iso(a, m + 1, 5), tipo: 'saldo', ini: iso(a, m + 1, 1), fim: iso(a, m + 1, 19) };
}

export default async function Pagamentos() {
  const { supabase, perfil } = await exigirPapel('admin', 'rh', 'financeiro');
  const { data: lista } = await supabase.from('v_pagamentos').select('*').order('data_pagamento', { ascending: false }).limit(60);
  const pode = ['admin', 'rh', 'financeiro'].includes(perfil.papel);
  const s = sugestao(hojeISO());
  const abertos = (lista ?? []).filter((p) => p.status === 'fechado' || p.status === 'rascunho');
  const proximo = abertos.sort((x, y) => x.data_pagamento.localeCompare(y.data_pagamento))[0];
  const pagosMes = (lista ?? []).filter((p) => p.status === 'pago' && p.data_pagamento.slice(0, 7) === hojeISO().slice(0, 7));
  return (
    <>
      <Cabecalho titulo="Pagamentos da equipe"
        sub="Dia 20 (adiantamento) e dia 05 (saldo com faltas e horas extras), separando o que vai para cada empresa (folha + taxa) e o que vai direto ao funcionário (passagens e alimentação)." />
      <AbasDP atual="pag" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Indicador rotulo="Próximo pagamento" valor={proximo ? reais(proximo.total) : '—'} detalhe={proximo ? `${data(proximo.data_pagamento)} • ${STATUS_PAG[proximo.status].rotulo}` : 'nenhum em aberto'} tom={proximo ? 'atencao' : 'neutro'} href={proximo ? `/dp/pagamentos/${proximo.id}` : undefined} />
        <Indicador rotulo="Pago neste mês" valor={reais(pagosMes.reduce((t, p) => t + Number(p.total), 0))} tom="ok" />
        <Indicador rotulo="Em conferência" valor={(lista ?? []).filter((p) => p.status === 'rascunho').length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao titulo="Pagamentos" className="lg:col-span-2">
          {!lista?.length ? <Vazio>Nenhum pagamento ainda. Crie o próximo ao lado.</Vazio> : (
            <div className="space-y-2">
              {lista.map((p) => (
                <Link key={p.id} href={`/dp/pagamentos/${p.id}`} className="flex items-center gap-3 rounded-lg border border-concreto-200 bg-white p-3 hover:border-sinal-400">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.titulo}</div>
                    <div className="text-xs text-concreto-500">{data(p.data_pagamento)} • {TIPO_PAG[p.tipo]} • {p.funcionarios} funcionário(s){p.status === 'pago' && p.pago_em && ` • pago em ${data(p.pago_em)}`}</div>
                    <div className="mt-1 text-xs text-concreto-600">Empresas {reais(p.total_empresas)} • Passagens e alimentação {reais(p.total_beneficios)} • Pessoas {reais(p.total_pessoas)}</div>
                  </div>
                  <div className="text-right"><div className={`font-mono font-bold ${p.status === 'cancelado' ? 'text-concreto-400 line-through' : ''}`}>{reais(p.total)}</div><Selo cor={STATUS_PAG[p.status].cor}>{STATUS_PAG[p.status].rotulo}</Selo></div>
                </Link>))}
            </div>)}
        </Cartao>
        {pode && (
          <Cartao titulo="Novo pagamento">
            <FormAcao acao={criarPagamento} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Data do pagamento"><input type="date" name="data_pagamento" required defaultValue={s.data} className="entrada" /></Campo>
                <Campo rotulo="Tipo"><select name="tipo" defaultValue={s.tipo} className="entrada">{Object.entries(TIPO_PAG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              </div>
              <Campo rotulo="Título" dica="Ex.: Quinzena de 15/10 — pagamento dia 20"><input name="titulo" className="entrada" placeholder="(automático)" /></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Passagens/alimentação de"><input type="date" name="periodo_inicio" defaultValue={s.ini} className="entrada" /></Campo>
                <Campo rotulo="até"><input type="date" name="periodo_fim" defaultValue={s.fim} className="entrada" /></Campo>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="gerar" defaultChecked className="mt-1" />
                <span>Calcular as linhas automaticamente: adiantamento (50% empresas, 40% CAD), saldo do mês, rescisões, taxa das empresas, passagens e alimentação por dia útil.</span></label>
              <Botao>Criar e conferir</Botao>
              <p className="text-xs text-concreto-500">Nada vai para o financeiro até você fechar. Depois de conferir, feche e, quando pagar, dê baixa.</p>
            </FormAcao>
          </Cartao>)}
      </div>
    </>
  );
}
