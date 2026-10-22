// Teste do leitor de planilha com arquivos no formato real de orçamentos de obra.
// Executar: npm run test:planilha
import * as XLSX from '@e965/xlsx';
import assert from 'node:assert/strict';
import { lerPlanilha } from '../src/lib/lerArquivo';
import { escolherAba, interpretar, lerNumero } from '../src/lib/planilha';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok —', nome); };
const gerar = (abas: Record<string, unknown[][]>, tipo: XLSX.BookType = 'xlsx') => {
  const wb = XLSX.utils.book_new();
  for (const [n, aoa] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
  return XLSX.write(wb, { type: 'array', bookType: tipo }) as ArrayBuffer;
};
const processar = (buf: ArrayBuffer | Uint8Array, nome: string) => {
  const abas = lerPlanilha(buf, nome);
  const e = escolherAba(abas.map((a) => ({ nome: a.nome, valores: a.valores })));
  assert.ok(e, 'cabeçalho não reconhecido');
  const aba = abas.find((a) => a.nome === e!.nome)!;
  return { aba: e!.nome, mapa: e!.mapa, r: interpretar(aba.valores, aba.textos, e!.mapa) };
};

t('números brasileiros', () => {
  assert.equal(lerNumero('1.234,56'), 1234.56);
  assert.equal(lerNumero('R$ 12.500,00'), 12500);
  assert.equal(lerNumero('1,234.5'), 1234.5);
  assert.equal(lerNumero('2.500'), 2500);
  assert.equal(lerNumero('0,75'), 0.75);
  assert.equal(lerNumero(42), 42);
  assert.equal(lerNumero('m²'), null);
  assert.equal(lerNumero(''), null);
});

// ---------- A: modelo SINAPI com capa, aba de BDI, numeração 3 níveis, coluna "com BDI" e rodapé
const A = gerar({
  'BDI': [['Composição do BDI'], ['Administração central', '4%'], ['Lucro', '7%']],
  'Orçamento Sintético': [
    ['PLANILHA ORÇAMENTÁRIA SINTÉTICA'], ['Obra: Residencial Exemplo — Recife/PE'], ['Data-base SINAPI 09/2026 • BDI 25%'], [],
    ['Item', 'Código', 'Banco', 'Descrição', 'Und', 'Quant.', 'Valor Unit', 'Valor Unit com BDI', 'Total'],
    ['1', '', '', 'SERVIÇOS PRELIMINARES', '', '', '', '', 3250],
    ['1.1', '99059', 'SINAPI', 'LOCAÇÃO CONVENCIONAL DE OBRA, UTILIZANDO GABARITO', 'm', 100, 8, 10, 1000],
    ['1.2', '98459', 'SINAPI', 'TAPUME COM TELHA METÁLICA', 'm²', 45, 40, 50, 2250],
    ['2', '', '', 'ESTRUTURA', '', '', '', '', 23000],
    ['2.1', '', '', 'FUNDAÇÕES', '', '', '', '', 15000],
    ['2.1.1', '96527', 'SINAPI', 'ESCAVAÇÃO MANUAL DE VALA', 'm³', 30, 80, 100, 3000],
    ['2.1.2', '94965', 'SINAPI', 'CONCRETO FCK 25MPA, PREPARO MECÂNICO', 'm³', 20, 480, 600, 12000],
    ['2.2', 'COMP-01', 'Próprio', 'PILARES EM CONCRETO ARMADO', 'm³', 8, 800, 1000, 8000],
    [],
    ['', '', '', 'TOTAL SEM BDI', '', '', '', '', 20999],
    ['', '', '', 'TOTAL GERAL', '', '', '', '', 26250],
  ],
});
t('A: escolhe a aba do orçamento (ignora aba de BDI)', () => { const { aba } = processar(A, 'orc.xlsx'); assert.equal(aba, 'Orçamento Sintético'); });
t('A: reconhece colunas e prefere "Valor Unit com BDI"', () => {
  const { mapa } = processar(A, 'orc.xlsx');
  assert.equal(mapa.linhaCabecalho, 4);
  assert.deepEqual(mapa.colunas, { codigo: 0, codigo_referencia: 1, fonte: 2, descricao: 3, unidade: 4, quantidade: 5, preco_unitario: 7, valor_total: 8 });
});
t('A: grupos, serviços, níveis e pais', () => {
  const { r } = processar(A, 'orc.xlsx');
  assert.equal(r.servicos, 5); assert.equal(r.grupos, 3);
  const esc = r.itens.find((i) => i.codigo === '2.1.1')!;
  assert.equal(esc.nivel, 3);
  assert.equal(r.itens[esc.pai!].codigo, '2.1');
  assert.equal(r.itens[r.itens[esc.pai!].pai!].codigo, '2');
  assert.equal(esc.codigo_referencia, '96527'); assert.equal(esc.fonte, 'SINAPI');
  assert.equal(esc.preco_unitario, 100);
});
t('A: ignora rodapés e confere o total geral', () => {
  const { r } = processar(A, 'orc.xlsx');
  assert.equal(r.valorTotal, 26250); assert.equal(r.totalInformado, 26250);
  assert.ok(r.avisos.some((a) => a.startsWith('Total conferido')));
  assert.equal(r.ignoradas, 2);
});

// ---------- B: CSV brasileiro (;), sem numeração, grupos em caixa alta, valores "1.234,56"
const csv = [
  'ORÇAMENTO - REFORMA PARÓQUIA;;;;',
  'DISCRIMINAÇÃO DOS SERVIÇOS;UNID.;QUANTIDADE;PREÇO UNITÁRIO (R$);PREÇO TOTAL (R$)',
  'IMPERMEABILIZAÇÃO;;;;',
  'Manta asfáltica 4mm;m²;1.250,00;85,40;106.750,00',
  'Proteção mecânica;m²;1.250,00;32,10;40.125,00',
  'PINTURA;;;;',
  'Pintura acrílica 2 demãos;m²;2.300,5;18,00;41.409,00',
  'TOTAL;;;;188.284,00',
].join('\n');
t('B: CSV com ";" e números brasileiros', () => {
  const { r, mapa } = processar(new TextEncoder().encode(csv), 'orc.csv');
  assert.equal(mapa.colunas.descricao, 0); assert.equal(mapa.colunas.quantidade, 2);
  assert.equal(r.servicos, 3); assert.equal(r.grupos, 2);
  const pint = r.itens.find((i) => i.descricao.startsWith('Pintura'))!;
  assert.equal(pint.quantidade, 2300.5); assert.equal(r.itens[pint.pai!].descricao, 'PINTURA');
  assert.equal(r.valorTotal, 188284);
});

t('B2: CSV exportado pelo Excel brasileiro (Windows-1252)', () => {
  const latin1 = Uint8Array.from([...csv].map((ch) => { const c = ch.charCodeAt(0); return c === 178 ? 0xb2 : c < 256 ? c : 63; }));
  const { r } = processar(latin1, 'orc.csv');
  assert.equal(r.servicos, 3);
  assert.ok(r.itens.some((i) => i.descricao === 'IMPERMEABILIZAÇÃO'));
});

// ---------- C: só coluna "Código" com numeração; cabeçalho em 2 linhas; sem preços; subtotal com quantidade
const C = gerar({
  'Planilha': [
    ['Código', 'Descrição', 'Unidade', 'Quantidade'],
    ['', '', '', ''],
    ['01', 'INFRAESTRUTURA', '', ''],
    ['01.01', 'Drenagem', 'vb', 1],
    ['01.01.01', 'Tubo PEAD 400mm', 'm', 320],
    ['01.01.02', 'Caixa de passagem', 'un', 12],
    ['02', 'PAVIMENTAÇÃO', '', ''],
    ['02.01', 'Base de brita graduada', 'm³', 450.75],
  ],
});
t('C: "Código" vira numeração; linha com subitens vira grupo; avanço só físico', () => {
  const { r } = processar(C, 'via.xlsx');
  assert.equal(r.mapa.colunas.codigo, 0); assert.equal(r.mapa.colunas.codigo_referencia, undefined);
  assert.equal(r.itens.find((i) => i.codigo === '01.01')!.tipo, 'grupo');
  assert.equal(r.servicos, 3);
  assert.equal(r.itens.find((i) => i.codigo === '01.01.02')!.nivel, 3);
  assert.ok(r.avisos.some((a) => a.includes('apenas físico')));
});

// ---------- D: .xls antigo (BIFF8)
t('D: arquivo .xls', () => {
  const D = gerar({ Orcamento: [['Item', 'Descrição', 'Un', 'Qtd', 'P. Unit', 'P. Total'], ['1', 'Muro', '', '', '', ''], ['1.1', 'Alvenaria', 'm²', 50, 60, 3000]] }, 'xls');
  const { r } = processar(D, 'antigo.xls');
  assert.equal(r.servicos, 1); assert.equal(r.valorTotal, 3000);
});

console.log(`\n${ok} testes do leitor de planilha passaram`);
