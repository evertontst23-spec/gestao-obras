// =====================================================================
// Leitor inteligente de planilha orçamentária (Excel / CSV)
// Reconhece sozinho: linha de cabeçalho, colunas (item, código SINAPI/ORSE,
// fonte, descrição, unidade, quantidade, preço unitário, total), números no
// formato brasileiro, grupos/etapas × serviços, hierarquia 1 / 1.1 / 1.1.1,
// linhas de total/rodapé e a coluna "com BDI" quando existir.
// Funciona no navegador e no Node (sem dependências).
// =====================================================================

export type Coluna = 'codigo' | 'codigo_referencia' | 'fonte' | 'descricao' | 'unidade' | 'quantidade' | 'preco_unitario' | 'valor_total';

export const ROTULOS_COLUNA: Record<Coluna, string> = {
  codigo: 'Item (numeração)',
  codigo_referencia: 'Código de referência (SINAPI…)',
  fonte: 'Fonte / banco',
  descricao: 'Descrição do serviço',
  unidade: 'Unidade',
  quantidade: 'Quantidade',
  preco_unitario: 'Preço unitário',
  valor_total: 'Preço total',
};

export interface Mapeamento { linhaCabecalho: number; colunas: Partial<Record<Coluna, number>>; pontuacao?: number }

export interface ItemLido {
  linha: number;               // linha no Excel (1-based)
  codigo: string | null;
  codigo_referencia: string | null;
  fonte: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  valor_total: number | null;
  tipo: 'grupo' | 'servico';
  nivel: number;
  pai: number | null;          // índice do item pai neste array
}

export interface Resultado {
  itens: ItemLido[];
  avisos: string[];
  ignoradas: number;
  grupos: number;
  servicos: number;
  valorTotal: number;
  totalInformado: number | null;   // "TOTAL GERAL" encontrado no rodapé
  mapa: Mapeamento;                // mapeamento efetivamente usado
}

type Celula = string | number | boolean | Date | null | undefined;

// ---------------------------------------------------------------------
export const normalizar = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[º°ª]/g, '').replace(/[^a-z0-9$%]+/g, ' ').trim();

/** Converte número de célula: aceita 1234.5 (número), "1.234,56", "R$ 1.234,56", "1,234.56", "12%". */
export function lerNumero(v: Celula): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v instanceof Date) return null;
  let s = String(v).trim().replace(/R\$|\s|%/gi, '');
  if (!s || /[a-z]/i.test(s.replace(/e[+-]?\d+$/i, ''))) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  const ultVirg = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.');
  if (ultVirg > -1 && ultPonto > -1) {
    s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultVirg > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultPonto > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');            // 1.234.567 → milhar brasileiro
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const texto = (v: Celula) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

// ---------------------------------------------------------------------
// Reconhecimento do cabeçalho
// ---------------------------------------------------------------------
type Regra = { col: Coluna; peso: number; teste: (h: string) => boolean };
const tem = (h: string, ...ps: string[]) => ps.some((p) => new RegExp(`(^| )${p}( |$)`).test(h));

const REGRAS: Regra[] = [
  // preço unitário antes de total (ex.: "Valor unit. c/ BDI")
  { col: 'preco_unitario', peso: 3, teste: (h) => tem(h, 'unit', 'unitario', 'unitaria', 'pu', 'p unit', 'v unit', 'vl unit', 'custo unit', 'preco unit', 'valor unit') },
  { col: 'valor_total', peso: 3, teste: (h) => tem(h, 'total', 'subtotal', 'preco total', 'valor total', 'custo total', 'vl total', 'parcial') },
  { col: 'quantidade', peso: 3, teste: (h) => tem(h, 'quant', 'quantidade', 'qtd', 'qtde', 'qt', 'quantid') },
  { col: 'unidade', peso: 3, teste: (h) => tem(h, 'un', 'und', 'unid', 'unidade', 'u', 'unit') && !tem(h, 'preco', 'valor', 'custo', 'p', 'v', 'vl') },
  { col: 'descricao', peso: 3, teste: (h) => tem(h, 'descricao', 'discriminacao', 'especificacao', 'servico', 'servicos', 'descricao dos servicos', 'descricao do servico', 'historico') },
  { col: 'fonte', peso: 2, teste: (h) => tem(h, 'banco', 'fonte', 'base', 'origem', 'tabela', 'referencia de preco') },
  { col: 'codigo_referencia', peso: 2, teste: (h) => tem(h, 'codigo', 'cod', 'sinapi', 'orse', 'seinfra', 'sicro', 'referencia', 'ref', 'composicao', 'insumo') },
  { col: 'codigo', peso: 2, teste: (h) => /^(item|itens|it|n|no|num|numero|ord|ordem|eap|seq)$/.test(h) || tem(h, 'item') },
];

/** Classifica um texto de cabeçalho; retorna coluna e se é "com BDI" / "sem BDI". */
export function classificarCabecalho(bruto: Celula): { col: Coluna; peso: number; bdi: number } | null {
  const h = normalizar(bruto);
  if (!h || h.length > 60) return null;
  for (const r of REGRAS) {
    if (r.teste(h)) {
      const bdi = /com bdi|c bdi|c\/ bdi|cbdi/.test(h) || (/bdi/.test(h) && !/sem bdi|s bdi/.test(h)) ? 1 : /sem bdi|s bdi/.test(h) ? -1 : 0;
      return { col: r.col, peso: r.peso, bdi };
    }
  }
  return null;
}

/** Procura a linha de cabeçalho nas primeiras 40 linhas e mapeia as colunas. */
export function detectarCabecalho(linhas: Celula[][]): Mapeamento | null {
  let melhor: Mapeamento | null = null;
  const limite = Math.min(linhas.length, 40);
  for (let r = 0; r < limite; r++) {
    // cabeçalhos em duas linhas (célula mesclada): junta com a linha seguinte
    const candidatas = [linhas[r] ?? [], (linhas[r] ?? []).map((c, i) => `${texto(c)} ${texto(linhas[r + 1]?.[i])}`.trim())];
    for (const [k, linha] of candidatas.entries()) {
      const colunas: Partial<Record<Coluna, number>> = {};
      const bdiDe: Partial<Record<Coluna, number>> = {};
      let pontos = 0;
      linha.forEach((cel, i) => {
        const c = classificarCabecalho(cel);
        if (!c) return;
        const atual = colunas[c.col];
        if (atual === undefined) { colunas[c.col] = i; bdiDe[c.col] = c.bdi; pontos += c.peso; }
        else if ((c.col === 'preco_unitario' || c.col === 'valor_total') && c.bdi > (bdiDe[c.col] ?? 0)) {
          colunas[c.col] = i; bdiDe[c.col] = c.bdi;             // prefere a coluna "com BDI"
        }
      });
      // "Código" sozinho, sem coluna Item, costuma ser a numeração — decidido depois pelos dados
      if (colunas.descricao === undefined || (colunas.quantidade === undefined && colunas.unidade === undefined)) continue;
      pontos += k === 1 ? -0.5 : 0;
      if (!melhor || pontos > (melhor.pontuacao ?? 0)) melhor = { linhaCabecalho: r + k, colunas, pontuacao: pontos };
    }
  }
  return melhor;
}

const PAREC_NUMERACAO = /^\d{1,3}(\.\d{1,3})*\.?$/;
const RODAPE = /^(total|totais|total geral|valor total|custo total|subtotal|sub total|bdi|encargos|valor global|preco global|total da obra|total com bdi|total sem bdi|soma)\b/;

/** Se não há coluna "Item", mas a coluna de código tem 1, 1.1, 2…, ela é a numeração. */
function ajustarColunaCodigo(linhas: Celula[][], textos: Celula[][], map: Mapeamento) {
  const c = map.colunas;
  if (c.codigo !== undefined || c.codigo_referencia === undefined) return;
  const amostra = textos.slice(map.linhaCabecalho + 1, map.linhaCabecalho + 60)
    .map((l) => texto(l?.[c.codigo_referencia!])).filter(Boolean);
  const hierarquicos = amostra.filter((v) => PAREC_NUMERACAO.test(v) && v.length <= 8).length;
  if (amostra.length && hierarquicos / amostra.length > 0.6) { c.codigo = c.codigo_referencia; delete c.codigo_referencia; }
  void linhas;
}

// ---------------------------------------------------------------------
// Interpretação das linhas
// ---------------------------------------------------------------------
/**
 * @param valores matriz com valores brutos (números como number)
 * @param textos  matriz com o texto exibido no Excel (preserva "1.10", "01.02")
 */
export function interpretar(valores: Celula[][], textos: Celula[][], mapa: Mapeamento): Resultado {
  const map: Mapeamento = { ...mapa, colunas: { ...mapa.colunas } };
  ajustarColunaCodigo(valores, textos, map);
  const c = map.colunas;
  const pega = (l: Celula[] | undefined, col?: number) => (col === undefined || !l ? null : l[col]);
  const itens: ItemLido[] = [];
  const avisos: string[] = [];
  let ignoradas = 0;
  let totalInformado: number | null = null;
  let semPreco = 0, semUnidade = 0;

  for (let r = map.linhaCabecalho + 1; r < valores.length; r++) {
    const lv = valores[r], lt = textos[r] ?? lv;
    if (!lv || lv.every((x) => x === null || x === undefined || x === '')) continue;
    const descricao = texto(pega(lt, c.descricao));
    const nDesc = normalizar(descricao);
    const codigoBruto = texto(pega(lt, c.codigo)).replace(/\.$/, '').trim();
    const unidade = texto(pega(lt, c.unidade)) || null;
    const quantidade = lerNumero(pega(lv, c.quantidade));
    const pu = lerNumero(pega(lv, c.preco_unitario));
    const total = lerNumero(pega(lv, c.valor_total));

    // rodapés e totais
    if (!descricao && !codigoBruto) { ignoradas++; continue; }
    if ((RODAPE.test(nDesc) || RODAPE.test(normalizar(codigoBruto))) && !unidade) {
      if (/total|global/.test(nDesc + normalizar(codigoBruto)) && total !== null && !/sem bdi|bdi$/.test(nDesc)) totalInformado = total;
      ignoradas++; continue;
    }
    if (!descricao) { ignoradas++; continue; }
    if (normalizar(descricao) === normalizar(textos[map.linhaCabecalho]?.[c.descricao!])) { ignoradas++; continue; } // cabeçalho repetido

    const servico = (unidade !== null && quantidade !== null) || (quantidade !== null && quantidade > 0 && pu !== null);
    if (servico && !unidade) semUnidade++;
    if (servico && pu === null && total === null) semPreco++;
    itens.push({
      linha: r + 1,
      codigo: codigoBruto || null,
      codigo_referencia: texto(pega(lt, c.codigo_referencia)) || null,
      fonte: texto(pega(lt, c.fonte)) || null,
      descricao,
      unidade,
      quantidade: servico ? Math.max(0, quantidade ?? 0) : null,
      preco_unitario: servico ? pu : null,
      valor_total: servico ? (total ?? (pu !== null && quantidade !== null ? Math.round(pu * quantidade * 100) / 100 : null)) : null,
      tipo: servico ? 'servico' : 'grupo',
      nivel: 1,
      pai: null,
    });
  }

  // Hierarquia: pela numeração (1 > 1.1 > 1.1.1) ou, sem numeração, pelo último grupo
  const pilha: number[] = [];
  const ehPrefixo = (pai: string, filho: string) => filho.startsWith(pai + '.');
  itens.forEach((it, i) => {
    if (it.codigo && PAREC_NUMERACAO.test(it.codigo)) {
      while (pilha.length) {
        const topo = itens[pilha[pilha.length - 1]];
        if (topo.codigo && PAREC_NUMERACAO.test(topo.codigo) && ehPrefixo(topo.codigo, it.codigo)) break;
        if (!topo.codigo && topo.tipo === 'grupo' && it.codigo.split('.').length > 1) break;
        pilha.pop();
      }
      it.pai = pilha.length ? pilha[pilha.length - 1] : null;
      pilha.push(i);
    } else if (it.tipo === 'grupo') {
      // grupo sem numeração: título de etapa
      while (pilha.length && itens[pilha[pilha.length - 1]].tipo === 'servico') pilha.pop();
      it.pai = null;
      pilha.length = 0;
      pilha.push(i);
    } else {
      let p = pilha.length - 1;
      while (p >= 0 && itens[pilha[p]].tipo !== 'grupo') p--;
      it.pai = p >= 0 ? pilha[p] : null;
    }
  });
  // quem tem filhos é grupo (ex.: linha de subtotal com quantidade)
  const temFilho = new Set(itens.map((i) => i.pai).filter((p): p is number => p !== null));
  let promovidos = 0;
  itens.forEach((it, i) => {
    if (temFilho.has(i) && it.tipo === 'servico') {
      it.tipo = 'grupo'; it.quantidade = null; it.preco_unitario = null; it.valor_total = null; promovidos++;
    }
  });
  itens.forEach((it) => {
    let n = 1, p = it.pai;
    while (p !== null && n < 10) { n++; p = itens[p].pai; }
    it.nivel = n;
  });

  const servicos = itens.filter((i) => i.tipo === 'servico');
  const valorTotal = Math.round(servicos.reduce((s, i) => s + (i.valor_total ?? 0), 0) * 100) / 100;

  if (!servicos.length) avisos.push('Nenhum serviço com unidade e quantidade foi encontrado. Confira o mapeamento das colunas.');
  if (semPreco) avisos.push(`${semPreco} serviço(s) sem preço: o avanço será calculado pela média física desses itens.`);
  if (semUnidade) avisos.push(`${semUnidade} serviço(s) com quantidade, mas sem unidade.`);
  if (promovidos) avisos.push(`${promovidos} linha(s) com subitens foram tratadas como grupo (subtotal).`);
  if (c.preco_unitario === undefined && c.valor_total === undefined) avisos.push('Planilha sem colunas de preço: o avanço será apenas físico.');
  if (totalInformado !== null && valorTotal > 0) {
    const dif = Math.abs(totalInformado - valorTotal) / Math.max(totalInformado, 1);
    avisos.push(dif < 0.005
      ? `Total conferido com o rodapé da planilha (${formatarReais(totalInformado)}).`
      : `Atenção: soma dos serviços (${formatarReais(valorTotal)}) difere do total da planilha (${formatarReais(totalInformado)}). Verifique BDI/linhas fora do padrão.`);
  }
  return { itens, avisos, ignoradas, grupos: itens.length - servicos.length, servicos: servicos.length, valorTotal, totalInformado, mapa: map };
}

export const formatarReais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Avalia todas as abas e devolve a que tem o cabeçalho mais reconhecível. */
export function escolherAba(abas: { nome: string; valores: Celula[][] }[]) {
  let melhor: { nome: string; mapa: Mapeamento } | null = null;
  for (const a of abas) {
    const m = detectarCabecalho(a.valores);
    if (!m) continue;
    const bonus = /orc|planilha|sintetic|quantit/.test(normalizar(a.nome)) ? 1 : /analit|compos|cronog|bdi|resumo|capa/.test(normalizar(a.nome)) ? -2 : 0;
    const p = (m.pontuacao ?? 0) + bonus + Math.min(a.valores.length, 500) / 1000;
    if (!melhor || p > (melhor.mapa.pontuacao ?? 0)) melhor = { nome: a.nome, mapa: { ...m, pontuacao: p } };
  }
  return melhor;
}
