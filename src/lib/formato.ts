const TZ = 'America/Recife';

export function data(d?: string | null) {
  if (!d) return '—';
  // datas "YYYY-MM-DD" são datas de calendário (sem fuso)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
  }
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ });
}

export function dataHora(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function relativo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
  return dataHora(d);
}

export function num(n?: number | string | null, casas = 2) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

/** Data de hoje no fuso do canteiro, formato YYYY-MM-DD */
export function hojeISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export function somarDias(iso: string, dias: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
