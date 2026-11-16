import 'server-only';
import ExcelJS from 'exceljs';

// Rótulos (iguais aos da tela de Pagamentos) — mantidos aqui para o gerador ficar independente da camada de UI.
const TIPO: Record<string, string> = { adiantamento: 'Adiantamento (dia 20)', saldo: 'Saldo do mês (dia 05)', rescisao: 'Rescisão', decimo_terceiro: '13º salário (1ª parcela)', outro: 'Outro' };
const STATUS: Record<string, string> = { rascunho: 'Em conferência', fechado: 'Fechado — a pagar', pago: 'Pago', cancelado: 'Cancelado' };
const CAT: Record<string, string> = {
  adiantamento: 'Adiantamento', saldo: 'Saldo', quinzena: 'Quinzena (valor da empresa)', rescisao: 'Saldo de rescisão', salario: 'Salário',
  hora_extra: 'Hora extra', desconto: 'Desconto', taxa: 'Taxa administrativa', passagem: 'Passagens', alimentacao: 'Alimentação', decimo_terceiro: '13º salário', outro: 'Outro',
};
const BENEFICIO = new Set(['passagem', 'alimentacao']);

export type Pagamento = {
  id: string; data_pagamento: string; titulo: string; tipo: string; status: string; pago_em: string | null;
  periodo_inicio: string | null; periodo_fim: string | null; criado_nome?: string | null;
};
export type Item = {
  pagamento_id: string; categoria: string; destino: 'empresa' | 'funcionario'; descricao: string | null; valor: number | string;
  funcionario: string | null; matricula: string | null; funcao: string | null; empresa: string | null; empresa_tipo: string | null;
  obra_codigo: string | null; obra_nome: string | null;
};

// Paleta CAD
const TINTA = '1B2430';       // cabeçalho escuro
const LARANJA = 'F48A32';     // destaque
const ZEBRA = 'F6F7F9';       // listra
const LINHA = 'DDE2E8';       // bordas
const TOTAL_BG = 'FFF3E8';    // faixa de total
const MOEDA = 'R$ #,##0.00;[Red]-R$ #,##0.00';
const DATA_FMT = 'dd/mm/yyyy';

const n = (v: unknown) => Number(v ?? 0);
const brData = (s: string | null) => (s ? new Date(s + 'T12:00:00') : null);

type Col = { h: string; w: number; money?: boolean; date?: boolean; center?: boolean };

/** Monta uma aba já formatada (cabeçalho escuro, filtro, congelamento, listras, bordas e, opcionalmente, linha de total). */
function aba(wb: ExcelJS.Workbook, nome: string, cols: Col[], linhas: (string | number | Date | null)[][], totalCols?: number[]) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }], properties: { defaultRowHeight: 18 } });
  ws.columns = cols.map((c) => ({ width: c.w }));

  const head = ws.addRow(cols.map((c) => c.h));
  head.height = 26;
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 10, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: LARANJA } } };
  });

  linhas.forEach((ln, i) => {
    const row = ws.addRow(ln);
    const zebra = i % 2 === 1;
    row.eachCell((cell, col) => {
      const c = cols[col - 1];
      cell.font = { size: 10, name: 'Calibri', color: { argb: '1B2430' } };
      cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : c.center ? 'center' : 'left', wrapText: false };
      if (c.money) cell.numFmt = MOEDA;
      if (c.date) cell.numFmt = DATA_FMT;
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      cell.border = { bottom: { style: 'hair', color: { argb: LINHA } } };
    });
  });

  if (totalCols && linhas.length) {
    const tr = ws.addRow(cols.map((_, idx) => {
      if (idx === 0) return 'TOTAL';
      if (totalCols.includes(idx)) return linhas.reduce((s, l) => s + n(l[idx]), 0);
      return null;
    }));
    tr.eachCell((cell, col) => {
      const c = cols[col - 1];
      cell.font = { bold: true, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
      cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : 'left' };
      if (c.money) cell.numFmt = MOEDA;
      cell.border = { top: { style: 'thin', color: { argb: TINTA } } };
    });
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

export async function planilhaPagamentos(pagamentos: Pagamento[], itens: Item[], info: { geradoEm: string; filtroObra?: string | null }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CAD Engenharia — Gestão de Obras';
  wb.created = new Date();

  const porPag = new Map<string, Item[]>();
  for (const it of itens) (porPag.get(it.pagamento_id) ?? porPag.set(it.pagamento_id, []).get(it.pagamento_id)!).push(it);

  // ---- Capa / resumo geral
  const capa = wb.addWorksheet('Visão geral', { properties: { defaultRowHeight: 18 } });
  capa.columns = [{ width: 34 }, { width: 22 }];
  capa.mergeCells('A1:B1');
  const tit = capa.getCell('A1');
  tit.value = 'Pagamentos da equipe — CAD Engenharia';
  tit.font = { bold: true, size: 15, color: { argb: TINTA } };
  capa.getRow(1).height = 26;
  capa.mergeCells('A2:B2');
  capa.getCell('A2').value = `Exportado em ${info.geradoEm}${info.filtroObra ? ` · filtrado pela obra ${info.filtroObra}` : ' · todas as obras'}`;
  capa.getCell('A2').font = { size: 10, color: { argb: '5B6573' } };

  const ativos = pagamentos.filter((p) => p.status !== 'cancelado');
  const totalDe = (filtro: (i: Item) => boolean) => ativos.reduce((s, p) => s + (porPag.get(p.id) ?? []).filter(filtro).reduce((t, i) => t + n(i.valor), 0), 0);
  const kpis: [string, number | string][] = [
    ['Pagamentos (fora cancelados)', ativos.length],
    ['Total geral', totalDe(() => true)],
    ['Empresas (folha + taxa)', totalDe((i) => i.destino === 'empresa')],
    ['Direto ao funcionário', totalDe((i) => i.destino === 'funcionario' && !BENEFICIO.has(i.categoria))],
    ['Passagens e alimentação', totalDe((i) => i.destino === 'funcionario' && BENEFICIO.has(i.categoria))],
    ['Pagos', ativos.filter((p) => p.status === 'pago').length],
    ['A pagar / em conferência', ativos.filter((p) => p.status !== 'pago').length],
  ];
  capa.addRow([]);
  kpis.forEach(([rot, val], i) => {
    const r = capa.addRow([rot, val]);
    const money = typeof val === 'number' && i >= 1 && i <= 4;
    r.getCell(1).font = { size: 11, color: { argb: '5B6573' } };
    r.getCell(2).font = { size: 12, bold: true, color: { argb: i === 1 ? LARANJA : TINTA } };
    if (money) r.getCell(2).numFmt = MOEDA;
    r.getCell(2).alignment = { horizontal: 'right' };
    r.height = 20;
  });
  capa.addRow([]);
  const nota = capa.addRow(['As abas ao lado trazem o resumo por pagamento, o detalhado linha a linha, e os totais por empresa e por obra.']);
  capa.mergeCells(`A${nota.number}:B${nota.number}`);
  nota.getCell(1).font = { size: 9, italic: true, color: { argb: '5B6573' } };
  nota.getCell(1).alignment = { wrapText: true };

  // ---- Resumo por pagamento
  const resumoCols: Col[] = [
    { h: 'Data', w: 12, date: true, center: true }, { h: 'Título', w: 40 }, { h: 'Tipo', w: 22 }, { h: 'Situação', w: 18 },
    { h: 'Funcionários', w: 13, center: true }, { h: 'Empresas\n(folha + taxa)', w: 16, money: true }, { h: 'Direto ao\nfuncionário', w: 16, money: true },
    { h: 'Passagens e\nalimentação', w: 16, money: true }, { h: 'Total', w: 16, money: true }, { h: 'Pago em', w: 12, date: true, center: true }, { h: 'Criado por', w: 20 },
  ];
  const resumoLinhas = pagamentos.map((p) => {
    const its = porPag.get(p.id) ?? [];
    const emp = its.filter((i) => i.destino === 'empresa').reduce((s, i) => s + n(i.valor), 0);
    const ben = its.filter((i) => i.destino === 'funcionario' && BENEFICIO.has(i.categoria)).reduce((s, i) => s + n(i.valor), 0);
    const pes = its.filter((i) => i.destino === 'funcionario' && !BENEFICIO.has(i.categoria)).reduce((s, i) => s + n(i.valor), 0);
    const funcs = new Set(its.filter((i) => i.funcionario).map((i) => i.funcionario)).size;
    return [brData(p.data_pagamento), p.titulo, TIPO[p.tipo] ?? p.tipo, STATUS[p.status] ?? p.status, funcs, emp, pes, ben, emp + ben + pes, brData(p.pago_em), p.criado_nome ?? ''];
  });
  aba(wb, 'Resumo', resumoCols, resumoLinhas, [5, 6, 7, 8]);

  // ---- Detalhado (linha a linha)
  const detCols: Col[] = [
    { h: 'Data', w: 12, date: true, center: true }, { h: 'Pagamento', w: 34 }, { h: 'Situação', w: 16 }, { h: 'Empresa', w: 20 },
    { h: 'Funcionário', w: 28 }, { h: 'Matrícula', w: 12 }, { h: 'Função', w: 18 }, { h: 'Item', w: 20 }, { h: 'Destino', w: 12, center: true },
    { h: 'Obra', w: 14 }, { h: 'Descrição', w: 40 }, { h: 'Valor', w: 15, money: true },
  ];
  const dataDe = new Map(pagamentos.map((p) => [p.id, p]));
  const detLinhas = itens
    .slice()
    .sort((a, b) => {
      const pa = dataDe.get(a.pagamento_id)!, pb = dataDe.get(b.pagamento_id)!;
      return (pb.data_pagamento.localeCompare(pa.data_pagamento)) || (a.empresa ?? '').localeCompare(b.empresa ?? '') || (a.funcionario ?? '').localeCompare(b.funcionario ?? '');
    })
    .map((i) => {
      const p = dataDe.get(i.pagamento_id)!;
      return [brData(p.data_pagamento), p.titulo, STATUS[p.status] ?? p.status, i.empresa ?? '—', i.funcionario ?? '—', i.matricula ?? '', i.funcao ?? '',
        CAT[i.categoria] ?? i.categoria, i.destino === 'empresa' ? 'Empresa' : 'Funcionário', i.obra_codigo ?? '—', i.descricao ?? '', n(i.valor)];
    });
  aba(wb, 'Detalhado', detCols, detLinhas, [11]);

  // ---- Por empresa
  const empMap = new Map<string, { tipo: string; itens: number; total: number }>();
  for (const i of itens) {
    const k = i.empresa ?? 'Sem empresa';
    const g = empMap.get(k) ?? { tipo: i.empresa_tipo ?? '', itens: 0, total: 0 };
    g.itens += 1; g.total += n(i.valor); empMap.set(k, g);
  }
  const TIPO_EMP: Record<string, string> = { fornecedora_mao_obra: 'Fornecedora de mão de obra', parceira: 'Parceira', propria: 'Própria (CAD)' };
  const empLinhas = [...empMap.entries()].sort((a, b) => b[1].total - a[1].total).map(([nome, g]) => [nome, TIPO_EMP[g.tipo] ?? g.tipo, g.itens, g.total]);
  aba(wb, 'Por empresa', [{ h: 'Empresa', w: 30 }, { h: 'Tipo', w: 26 }, { h: 'Nº de linhas', w: 14, center: true }, { h: 'Total', w: 16, money: true }], empLinhas, [2, 3]);

  // ---- Por obra
  const obraMap = new Map<string, { empresas: number; pessoas: number; benef: number; total: number }>();
  for (const i of itens) {
    const k = i.obra_codigo ? `${i.obra_codigo}${i.obra_nome ? ` — ${i.obra_nome}` : ''}` : 'Sem obra';
    const g = obraMap.get(k) ?? { empresas: 0, pessoas: 0, benef: 0, total: 0 };
    const v = n(i.valor);
    if (i.destino === 'empresa') g.empresas += v; else if (BENEFICIO.has(i.categoria)) g.benef += v; else g.pessoas += v;
    g.total += v; obraMap.set(k, g);
  }
  const obraLinhas = [...obraMap.entries()].sort((a, b) => b[1].total - a[1].total).map(([nome, g]) => [nome, g.empresas, g.pessoas, g.benef, g.total]);
  aba(wb, 'Por obra', [{ h: 'Obra', w: 34 }, { h: 'Empresas', w: 16, money: true }, { h: 'Direto ao funcionário', w: 18, money: true }, { h: 'Passagens e alimentação', w: 18, money: true }, { h: 'Total', w: 16, money: true }], obraLinhas, [1, 2, 3, 4]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
