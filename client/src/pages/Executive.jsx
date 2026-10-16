import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { downloadCsv, fmtDate, fmtHours } from '../lib/format';
import { Empty, PageHeader, Stat } from '../components/ui.jsx';

export default function Executive() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    api.get('/summary/org', { params: { days } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [days]);

  const exportCsv = () =>
    downloadCsv(`department-summary-${d.from}_to_${d.to}.csv`, [
      ['Group', 'Department', 'People', 'Present', 'Late', 'Half-day', 'Leave', 'Absent', 'Attendance %', 'Avg hours/day'],
      ...d.byDepartment.map((r) => [r.kind, r.department, r.people, r.present, r.late, r.halfDay, r.leave, r.absent, r.attendancePct, fmtHours(r.avgMinutes)]),
    ]);

  return (
    <>
      <PageHeader title="Executive overview" subtitle="Totals and trends only. This view never lists any individual's attendance, face data or credentials.">
        <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
        <button className="btn-ghost" onClick={exportCsv} disabled={!d?.byDepartment.length}><Download size={16} /> Export CSV</button>
      </PageHeader>

      {!d ? <p className="text-ink-500">Loading…</p> : d.totals.people === 0 ? (
        <div className="panel"><Empty title="Nothing to summarise yet" hint="Once people are added and attendance is recorded, the totals appear here." /></div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-500">{fmtDate(d.from)} to {fmtDate(d.to)}</p>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Attendance rate" value={`${d.totals.attendancePct}%`} tone="text-teal-dark" />
            <Stat label="In today" value={`${d.today.in} / ${d.today.people}`} />
            <Stat label="On leave today" value={d.today.leave} tone="text-indigo-700" />
            <Stat label="Avg hours per day" value={fmtHours(d.totals.avgMinutes)} />
          </div>

          <div className="panel mb-6 p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-bold">Daily attendance rate</h2>
              <p className="text-sm text-ink-500">Share of expected people who attended</p>
            </div>
            <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily attendance rate over the period">
              {d.trend.map((t) => {
                const pct = Math.round((t.attended / t.expected) * 100);
                return (
                  <div key={t.date} className="group relative flex h-full flex-1 items-end" title={`${fmtDate(t.date)}: ${pct}% (${t.attended} of ${t.expected})`}>
                    <div className="w-full rounded-t bg-teal" style={{ height: `${Math.max(pct, 2)}%`, opacity: pct ? 1 : 0.25 }} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel overflow-x-auto">
            <div className="border-b border-ink/10 px-5 py-4"><h2 className="text-lg font-bold">By department</h2></div>
            <table className="w-full text-left text-sm">
              <thead className="bg-ink/[0.03] text-ink-500">
                <tr>{['Department', 'People', 'Present', 'Late', 'Half-day', 'Leave', 'Absent', 'Avg hours', 'Attendance'].map((h) => <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {d.byDepartment.map((r) => (
                  <tr key={`${r.kind}|${r.department}`}>
                    <td className="px-5 py-3 font-semibold">{r.department}{Object.keys(d.byKind).length > 1 && <span className="ml-2 text-xs font-normal capitalize text-ink-500">{r.kind}s</span>}</td>
                    <td className="px-5 py-3">{r.people}</td><td className="px-5 py-3">{r.present}</td><td className="px-5 py-3">{r.late}</td>
                    <td className="px-5 py-3">{r.halfDay}</td><td className="px-5 py-3">{r.leave}</td><td className="px-5 py-3">{r.absent}</td>
                    <td className="px-5 py-3">{fmtHours(r.avgMinutes)}</td>
                    <td className="min-w-[9rem] px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-teal" style={{ width: `${r.attendancePct}%` }} /></div>
                        <span className="w-10 text-right font-semibold">{r.attendancePct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
