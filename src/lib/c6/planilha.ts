import 'server-only';
import JSZip from 'jszip';
import { MODELO_C6_PIX_BASE64 } from './modelo';

export type LinhaPix = { nome: string; chave: string; valor: number; data: string; descricao: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// o C6 só aceita caracteres especiais na chave: limpa nome e descrição
const limpo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function cpfValido(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Normaliza a chave no formato que o C6 pede: CPF/CNPJ só números, celular +55…, e-mail e aleatória como estão */
export function chaveC6(chave: string): { chave: string; tipo: 'cpf' | 'cnpj' | 'celular' | 'email' | 'aleatoria' | 'invalida' } {
  const c = chave.trim();
  if (c.includes('@')) return { chave: c.toLowerCase(), tipo: 'email' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return { chave: c.toLowerCase(), tipo: 'aleatoria' };
  const d = c.replace(/\D/g, '');
  if (c.startsWith('+')) return { chave: `+${d}`, tipo: 'celular' };
  if (d.length === 14) return { chave: d, tipo: 'cnpj' };
  if (d.length === 11 && cpfValido(d)) return { chave: d, tipo: 'cpf' };
  if (d.length === 11 && /^[1-9]{2}9/.test(d)) return { chave: `+55${d}`, tipo: 'celular' };
  if (d.length === 13 && d.startsWith('55')) return { chave: `+${d}`, tipo: 'celular' };
  return { chave: c, tipo: 'invalida' };
}

/** Preenche a aba "PIX chave ou código" do modelo do C6 a partir da linha 3 (até 100 pagamentos), sem mexer no resto do arquivo */
export async function planilhaC6Pix(linhas: LinhaPix[]): Promise<Buffer> {
  if (linhas.length > 100) throw new Error('O modelo do C6 aceita até 100 pagamentos por arquivo');
  const zip = await JSZip.loadAsync(Buffer.from(MODELO_C6_PIX_BASE64, 'base64'));
  const caminho = 'xl/worksheets/sheet2.xml';
  let xml = await zip.file(caminho)!.async('string');
  linhas.forEach((l, i) => {
    const r = i + 3;
    const txt = (col: string, s: string, v: string) => {
      const re = new RegExp(`<c r="${col}${r}" s="(\\d+)"/>`);
      xml = xml.replace(re, (_m, st) => `<c r="${col}${r}" s="${st}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
      void s;
    };
    txt('A', '', limpo(l.nome).slice(0, 60));
    txt('B', '', l.chave);
    xml = xml.replace(new RegExp(`<c r="C${r}" s="(\\d+)"/>`), (_m, st) => `<c r="C${r}" s="${st}"><v>${l.valor.toFixed(2)}</v></c>`);
    txt('D', '', l.data);
    // o C6 recusa descrição longa: até 30 caracteres, só letras e espaços (como no exemplo "Pagamento de salário")
    txt('E', '', limpo(l.descricao).replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30));
  });
  zip.file(caminho, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
