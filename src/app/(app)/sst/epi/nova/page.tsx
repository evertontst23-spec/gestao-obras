import { exigirPapel } from '@/lib/sessao';
import { Cabecalho, Cartao, Vazio } from '@/components/ui';
import { AbasSST } from '@/components/AbasSST';
import { EntregaEPI } from '@/components/EntregaEPI';
import { hojeISO } from '@/lib/formato';

export const metadata = { title: 'Entrega de EPI' };

export default async function NovaEntrega() {
  const { supabase, perfil } = await exigirPapel('admin', 'seguranca', 'almoxarifado', 'encarregado', 'engenheiro');
  const [{ data: equipe }, { data: epis }, { data: obras }, { data: saldos }] = await Promise.all([
    supabase.rpc('equipe_da_obra', { p_obra: null }),
    supabase.from('insumos').select('id, codigo, descricao, unidade, ca, ca_validade').eq('categoria', 'EPI').eq('ativo', true).order('descricao'),
    supabase.from('obras').select('id, codigo, nome').in('situacao', ['planejamento', 'em_andamento', 'paralisada']).order('nome'),
    supabase.rpc('saldos_epi'),
  ]);
  const mapa: Record<string, number> = {};
  ((saldos ?? []) as { obra_id: string | null; insumo_id: string; saldo: number }[]).forEach((s) => { mapa[`${s.obra_id ?? 'c'}:${s.insumo_id}`] = Number(s.saldo); });
  let func = (equipe ?? []) as { id: string; nome: string; matricula: string; funcao: string; biometria: boolean }[];
  if (!func.length) {   // encarregado/engenheiro: equipe das obras em que atua
    const listas = await Promise.all((obras ?? []).map((o) => supabase.rpc('equipe_da_obra', { p_obra: o.id })));
    func = listas.flatMap((l) => (l.data ?? []) as typeof func);
  }
  return (
    <>
      <Cabecalho titulo="Entrega de EPI" sub="Baixa automática no estoque, CA conferido e confirmação por assinatura ou rosto. Vai direto para a ficha de EPI do funcionário." />
      <AbasSST atual="epi" />
      <div className="mx-auto max-w-3xl">
        {!epis?.length ? <Vazio>Cadastre os EPIs em Insumos (categoria EPI, com CA).</Vazio> : (
          <Cartao><EntregaEPI funcionarios={func} epis={epis} locais={(obras ?? []).map((o) => ({ id: o.id, nome: `${o.codigo} — ${o.nome}` }))} saldos={mapa} hoje={hojeISO()} podeCadastrarRosto={['admin', 'rh', 'seguranca'].includes(perfil.papel)} /></Cartao>)}
      </div>
    </>
  );
}
