import * as XLSX from '@e965/xlsx';

export type Aba = { nome: string; valores: (string | number | boolean | Date | null)[][]; textos: (string | null)[][] };

/** Lê .xlsx, .xls, .ods ou .csv e devolve cada aba como matriz de valores e de textos exibidos. */
export function lerPlanilha(dados: ArrayBuffer | Uint8Array, nomeArquivo = ''): Aba[] {
  const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  const csv = /\.(csv|txt)$/i.test(nomeArquivo);
  // CSV: decodifica o texto (UTF-8 ou Windows-1252 do Excel brasileiro) e mantém os números
  // como texto, para que "1.250,00" seja lido no padrão brasileiro por lerNumero().
  const wb = csv
    ? XLSX.read(decodificar(bytes), { type: 'string', raw: true, FS: detectarSeparador(decodificar(bytes)) })
    : XLSX.read(bytes, { type: 'array', cellDates: true });
  return wb.SheetNames.map((nome) => {
    const ws = wb.Sheets[nome];
    const valores = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const textos = XLSX.utils.sheet_to_json<(string | null)[]>(ws, { header: 1, raw: false, defval: null, blankrows: true });
    return { nome, valores, textos };
  });
}

function decodificar(bytes: Uint8Array) {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(bytes) : utf8.replace(/^\uFEFF/, '');
}

function detectarSeparador(texto: string) {
  const amostra = texto.slice(0, 4000);
  return (amostra.match(/;/g)?.length ?? 0) > (amostra.match(/,/g)?.length ?? 0) / 2 ? ';' : ',';
}
