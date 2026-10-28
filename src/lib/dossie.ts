// Dossiê do funcionário organizado como uma pasta: cada documento tem o seu lugar.
export type Slot = {
  tipo: string;                 // nome gravado em funcionario_documentos.tipo
  rotulo: string;
  obrigatorio?: boolean;
  validade?: boolean;           // pede emissão/validade (ASO, NRs)
  tambem?: string[];            // tipos antigos que também valem para este lugar
  sistema?: 'foto' | 'epi' | 'os' | 'biometria';   // preenchido pelo próprio sistema
  varios?: boolean;             // aceita vários arquivos (não substitui o anterior)
  so_desligado?: boolean;
};
export type Pasta = { id: string; titulo: string; slots: Slot[] };

export const PASTAS: Pasta[] = [
  { id: 'pessoais', titulo: 'Documentos pessoais', slots: [
    { tipo: 'Foto', rotulo: 'Foto do rosto', obrigatorio: true, sistema: 'foto' },
    { tipo: 'RG (frente)', rotulo: 'RG / CNH — frente', obrigatorio: true, tambem: ['RG / CPF'] },
    { tipo: 'RG (verso)', rotulo: 'RG / CNH — verso', tambem: ['RG / CPF'] },
    { tipo: 'CPF', rotulo: 'CPF', obrigatorio: true, tambem: ['RG / CPF'] },
    { tipo: 'CTPS', rotulo: 'Carteira de trabalho (CTPS)', obrigatorio: true },
    { tipo: 'Comprovante de residência', rotulo: 'Comprovante de residência', obrigatorio: true },
    { tipo: 'Título de eleitor', rotulo: 'Título de eleitor' },
    { tipo: 'Reservista', rotulo: 'Reservista' },
    { tipo: 'Certidão de nascimento/casamento', rotulo: 'Certidão de nascimento ou casamento' },
    { tipo: 'Comprovante de escolaridade', rotulo: 'Comprovante de escolaridade' },
    { tipo: 'Dados bancários', rotulo: 'Cartão do banco / PIX' },
    { tipo: 'Currículo', rotulo: 'Currículo' },
  ] },
  { id: 'admissao', titulo: 'Admissão', slots: [
    { tipo: 'Ficha de registro', rotulo: 'Ficha de registro / admissão' },
    { tipo: 'Contrato de trabalho', rotulo: 'Contrato de trabalho', obrigatorio: true },
    { tipo: 'ASO', rotulo: 'ASO admissional', obrigatorio: true, validade: true },
    { tipo: 'Termo LGPD', rotulo: 'Termo de biometria (LGPD)', sistema: 'biometria' },
  ] },
  { id: 'sst', titulo: 'Segurança do trabalho', slots: [
    { tipo: 'NR-06 (EPI)', rotulo: 'Ficha de EPI (NR-06)', obrigatorio: true, sistema: 'epi' },
    { tipo: 'Ordem de Serviço', rotulo: 'Ordem de Serviço (NR-01)', obrigatorio: true, sistema: 'os' },
    { tipo: 'NR-18', rotulo: 'Treinamento NR-18', obrigatorio: true, validade: true },
    { tipo: 'NR-35 (altura)', rotulo: 'NR-35 — trabalho em altura', validade: true },
    { tipo: 'NR-10', rotulo: 'NR-10 — eletricidade', validade: true },
    { tipo: 'NR-12', rotulo: 'NR-12 — máquinas', validade: true },
    { tipo: 'Certificado', rotulo: 'Outros certificados', validade: true, varios: true },
  ] },
  { id: 'saude', titulo: 'Saúde', slots: [
    { tipo: 'ASO periódico', rotulo: 'ASO periódico / mudança de função', validade: true, varios: true },
    { tipo: 'Atestado', rotulo: 'Atestados (cópias)', varios: true },
  ] },
  { id: 'desligamento', titulo: 'Desligamento', slots: [
    { tipo: 'Pedido/aviso de desligamento', rotulo: 'Pedido de demissão / aviso prévio', so_desligado: true },
    { tipo: 'Rescisão (TRCT)', rotulo: 'Rescisão (TRCT) e comprovante', so_desligado: true },
    { tipo: 'ASO demissional', rotulo: 'ASO demissional', so_desligado: true },
  ] },
  { id: 'outros', titulo: 'Outros', slots: [
    { tipo: 'Outro', rotulo: 'Outros documentos', varios: true },
  ] },
];

export const TIPOS_VARIOS = new Set(PASTAS.flatMap((p) => p.slots).filter((s) => s.varios).map((s) => s.tipo));
export const TIPOS_DOSSIE = PASTAS.flatMap((p) => p.slots).filter((s) => !s.sistema || s.sistema === 'epi').map((s) => s.tipo);

export type Doc = { id: string; tipo: string; descricao: string | null; emissao: string | null; validade: string | null;
  caminho: string | null; tipo_mime: string | null; substituido: boolean; criado_em: string };
export type Extra = { foto: boolean; epi: number; os: boolean; biometria: boolean };

/** Documentos que ocupam um lugar da pasta (os atuais primeiro) */
export function docsDoSlot(s: Slot, docs: Doc[]) {
  const tipos = [s.tipo, ...(s.tambem ?? [])];
  return docs.filter((d) => !d.substituido && tipos.includes(d.tipo));
}
export function slotPreenchido(s: Slot, docs: Doc[], x: Extra) {
  if (s.sistema === 'foto') return x.foto || docsDoSlot(s, docs).length > 0;
  if (s.sistema === 'epi') return x.epi > 0 || docsDoSlot(s, docs).length > 0;
  if (s.sistema === 'os') return x.os;
  if (s.sistema === 'biometria') return x.biometria;
  return docsDoSlot(s, docs).length > 0;
}
/** Situação geral: obrigatórios presentes e vencidos */
export function resumoDossie(docs: Doc[], x: Extra, desligado: boolean, hoje: string) {
  const obrig = PASTAS.flatMap((p) => p.slots).filter((s) => s.obrigatorio && (!s.so_desligado || desligado));
  const faltam = obrig.filter((s) => !slotPreenchido(s, docs, x));
  const vencidos = docs.filter((d) => !d.substituido && d.validade && d.validade < hoje);
  return { total: obrig.length, ok: obrig.length - faltam.length, faltam, vencidos };
}
