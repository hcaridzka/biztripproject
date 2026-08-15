export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

export function formatIDR(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function daysBetween(start: string, end: string): number {
  if (!start || !end) return 1;
  const a = new Date(start);
  const b = new Date(end);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Math.max(1, diff);
}

export function downloadCSV(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
