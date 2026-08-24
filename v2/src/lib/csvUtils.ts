// ─── CSV encode/download helpers (mirrors Phase 1's csvEncode()/downloadCSV()) ─

export function csvEncode(rows: (string | number)[][]): string {
  return rows.map(row => row.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
