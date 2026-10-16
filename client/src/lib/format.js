export const fmtHours = (m) => (m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : '—');
// Short note under a check-out time: early or overtime
export const outNote = (d) =>
  d?.earlyMinutes > 0 ? { text: `Early by ${fmtHours(d.earlyMinutes)}`, cls: 'text-[#8A5A0B]' }
  : d?.overtimeMinutes > 0 ? { text: `+${fmtHours(d.overtimeMinutes)} overtime`, cls: 'text-teal-dark' }
  : null;

export const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const downloadCsv = (filename, rows) => {
  const body = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
