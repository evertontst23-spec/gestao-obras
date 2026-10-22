'use client';
import { UploadArquivo } from './UploadArquivo';
import { Campo } from './ui';
import { registrarAtestado } from '@/app/(app)/dp/acoes';

export function FormAtestado({ funcionarios }: { funcionarios: { id: string; nome: string; matricula: string }[] }) {
  return (
    <UploadArquivo pasta="dp/atestados" acao={registrarAtestado} rotuloBotao="Registrar atestado" exigirArquivo={false}>
      <Campo rotulo="Funcionário"><select name="funcionario_id" required className="entrada"><option value="">Selecionar…</option>{funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome} — {f.matricula}</option>)}</select></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Tipo"><select name="tipo" className="entrada">
          <option value="medico">Atestado médico</option><option value="odontologico">Odontológico</option><option value="acompanhamento">Acompanhamento</option>
          <option value="declaracao_horas">Declaração de horas</option><option value="acidente_trabalho">Acidente de trabalho</option></select></Campo>
        <Campo rotulo="Início"><input type="date" name="data_inicio" required className="entrada" /></Campo>
        <Campo rotulo="Dias" dica="0 para declaração de horas"><input type="number" name="dias" min={0} defaultValue={1} className="entrada" /></Campo>
        <Campo rotulo="Horas (declaração)"><input name="horas" inputMode="decimal" placeholder="ex.: 3,5" className="entrada" /></Campo>
        <Campo rotulo="CID" dica="Opcional — dado sensível"><input name="cid" className="entrada" /></Campo>
        <Campo rotulo="Profissional / CRM"><input name="profissional" className="entrada" /></Campo>
      </div>
      <Campo rotulo="Observações"><input name="observacoes" className="entrada" /></Campo>
    </UploadArquivo>
  );
}
