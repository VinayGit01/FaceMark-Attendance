import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { downloadCsv, fmtDate, fmtHours } from '../lib/format';
import { Empty, PageHeader, Stat } from '../components/ui.jsx';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Reports() {
  const [period, setPeriod] = useState('daily');
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get('/attendance/report', { params: { period, date } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [period, date]);

  const exportCsv = () =>
    downloadCsv(`report-${period}-${data.from}${data.to !== data.from ? `_to_${data.to}` : ''}.csv`, [
      ['Roll no', 'Name', 'Present', 'Late', 'Half-day', 'Leave', 'Absent', 'Early outs', 'Total hours', 'Overtime', 'Avg hours/day', 'Attendance %'],
      ...data.rows.map((r) => [r.student.rollNo, r.student.name, r.summary.present, r.summary.late, r.summary.halfDay, r.summary.leave, r.summary.absent, r.summary.earlyOut, fmtHours(r.summary.totalMinutes), fmtHours(r.summary.overtimeMinutes), fmtHours(r.summary.avgMinutes), r.summary.attendancePct]),
    ]);

  const tabs = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];

  return (
    <>
      <PageHeader title="Attendance reports" subtitle="Weeks run Monday to Sunday. Approved leave and week-off days are not counted as absences.">
        <input type="date" className="input w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Report date" />
        <button className="btn-ghost" onClick={exportCsv} disabled={!data?.rows.length}><Download size={16} /> Export CSV</button>
      </PageHeader>

      <div className="mb-5 inline-flex rounded-lg border border-ink/15 bg-white p-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${period === k ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink/5'}`}>
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-ink-500">Loading…</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-500">
            {data.from === data.to ? fmtDate(data.from) : `${fmtDate(data.from)} to ${fmtDate(data.to)}`}
          </p>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Present" value={data.totals.present} tone="text-teal-dark" />
            <Stat label="Late" value={data.totals.late} tone="text-[#8A5A0B]" />
            <Stat label="Half-day" value={data.totals.halfDay} tone="text-sky-800" />
            <Stat label="Leave" value={data.totals.leave} tone="text-indigo-700" />
            <Stat label="Absent" value={data.totals.absent} tone="text-rose" />
          </div>

          <div className="panel overflow-x-auto">
            {data.rows.length === 0 ? (
              <Empty title="No students yet" hint="Add students to see reports." />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-ink/[0.03] text-ink-500">
                  <tr>
                    {['Roll no.', 'Name', 'Present', 'Late', 'Half-day', 'Leave', 'Absent', 'Early outs', 'Total hours', 'Overtime', 'Attendance'].map((h) => <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {data.rows.map((r) => (
                    <tr key={r.student._id}>
                      <td className="px-5 py-3">{r.student.rollNo}</td>
                      <td className="px-5 py-3 font-semibold">
                        <Link className="hover:text-teal-dark hover:underline" to={`/history?student=${r.student._id}&from=${data.from}&to=${data.to}`}>{r.student.name}</Link>
                      </td>
                      <td className="px-5 py-3">{r.summary.present}</td>
                      <td className="px-5 py-3">{r.summary.late}</td>
                      <td className="px-5 py-3">{r.summary.halfDay}</td>
                      <td className="px-5 py-3">{r.summary.leave}</td>
                      <td className="px-5 py-3">{r.summary.absent}</td>
                      <td className="px-5 py-3">{r.summary.earlyOut}</td>
                      <td className="px-5 py-3">{fmtHours(r.summary.totalMinutes)}</td>
                      <td className="px-5 py-3">{fmtHours(r.summary.overtimeMinutes)}</td>
                      <td className="px-5 py-3 font-semibold">{r.summary.attendancePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
