import { Campo } from './ui';
import { Botao } from './formulario';
import { reais } from '@/lib/dominio';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CamposFuncionario({ f, funcoes, obras, empregadores = [], rotulo, editavel = true }:
  { f?: any; funcoes: any[]; obras: { id: string; codigo: string; nome: string }[]; empregadores?: { id: string; nome: string }[]; rotulo: string; editavel?: boolean }) {
  const dis = !editavel;
  return (
    <fieldset disabled={dis} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {f && <input type="hidden" name="id" value={f.id} />}
      <Campo rotulo="Nome completo *" className="sm:col-span-2"><input name="nome" required defaultValue={f?.nome} className="entrada" /></Campo>
      <Campo rotulo="CPF"><input name="cpf" defaultValue={f?.cpf ?? ''} inputMode="numeric" className="entrada" placeholder="000.000.000-00" /></Campo>
      <Campo rotulo="RG"><input name="rg" defaultValue={f?.rg ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Empresa contratante" dica="Quem registra/paga: CAD, IDERES, FÊNIX, Mundial…">
        <select name="empregador_id" defaultValue={f?.empregador_id ?? ''} className="entrada">
          <option value="">—</option>
          {empregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Vínculo" dica="Vazio = padrão da empresa">
        <select name="vinculo" defaultValue={f?.vinculo ?? ''} className="entrada">
          <option value="">Padrão da empresa</option><option value="clt">CLT (próprio)</option><option value="terceirizado">Terceirizado</option>
          <option value="clt_parceira">CLT de empresa parceira</option><option value="autonomo">Autônomo / diarista</option>
        </select>
      </Campo>
      <Campo rotulo="Função *" dica="Salário e benefícios vêm da tabela da função">
        <select name="funcao_id" required={!f} defaultValue={f?.funcao_id ?? ''} className="entrada">
          <option value="" disabled>Selecionar…</option>
          {funcoes.map((x) => <option key={x.id} value={x.id}>{x.nome} — {reais(x.salario_base)}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Obra (centro de custo)">
        <select name="obra_id" defaultValue={f?.obra_id ?? ''} className="entrada">
          <option value="">Escritório / sem obra</option>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Admissão"><input type="date" name="data_admissao" defaultValue={f?.data_admissao ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Salário diferenciado (R$)" dica="Deixe vazio para usar o da função"><input name="salario" inputMode="decimal" defaultValue={f?.salario ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Adicional sobre o salário (%)" dica="ex.: 40 para +40%"><input name="adicional_pct" inputMode="decimal" defaultValue={f?.adicional_pct ? String(f.adicional_pct).replace('.', ',') : ''} className="entrada" /></Campo>
      <Campo rotulo="Alimentação por dia útil (R$)" dica="Vazio = valor da função"><input name="alimentacao_dia" inputMode="decimal" defaultValue={f?.alimentacao_dia != null ? String(f.alimentacao_dia).replace('.', ',') : ''} className="entrada" /></Campo>
      <Campo rotulo="Passagens por dia"><input name="passagens_dia" inputMode="decimal" defaultValue={f?.passagens_dia ?? ''} className="entrada" placeholder="ex.: 4" /></Campo>
      <Campo rotulo="Auxílio passagem/combustível por semana (R$)" dica="Use no lugar das passagens diárias"><input name="passagem_semanal" inputMode="decimal" defaultValue={f?.passagem_semanal != null ? String(f.passagem_semanal).replace('.', ',') : ''} className="entrada" /></Campo>
      <Campo rotulo="Nascimento"><input type="date" name="data_nascimento" defaultValue={f?.data_nascimento ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Telefone / WhatsApp"><input name="telefone" inputMode="tel" defaultValue={f?.telefone ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Endereço" className="sm:col-span-2"><input name="endereco" defaultValue={f?.endereco ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Banco"><input name="banco" defaultValue={f?.banco ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Agência"><input name="agencia" defaultValue={f?.agencia ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Conta"><input name="conta" defaultValue={f?.conta ?? ''} className="entrada" /></Campo>
      <Campo rotulo="PIX"><input name="pix" defaultValue={f?.pix ?? ''} className="entrada" /></Campo>
      <Campo rotulo="Dados a confirmar" className="sm:col-span-2 lg:col-span-4" dica="Some quando ficar vazio"><input name="pendencias" defaultValue={f?.pendencias ?? ''} className="entrada" placeholder="ex.: CPF, data de admissão" /></Campo>
      <Campo rotulo="Observações" className="sm:col-span-2 lg:col-span-4"><textarea name="observacoes" rows={2} defaultValue={f?.observacoes ?? ''} className="entrada" /></Campo>
      {editavel && <div className="sm:col-span-2 lg:col-span-4"><Botao>{rotulo}</Botao></div>}
    </fieldset>
  );
}
