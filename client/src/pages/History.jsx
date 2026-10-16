import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { errMsg } from '../lib/api';
import { downloadCsv, fmtDate, fmtHours, outNote } from '../lib/format';
import { Download } from 'lucide-react';
import { Empty, PageHeader, Stat, StatusBadge } from '../components/ui.jsx';

export default function History() {
  const [params, setParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [data, setData] = useState(null);
  const studentId = params.get('student') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  useEffect(() => {
    api.get('/students').then((r) => setStudents(r.data.people));
  }, []);

  useEffect(() => {
    if (!studentId) return setData(null);
    api
      .get(`/attendance/history/${studentId}`, { params: { from: from || undefined, to: to || undefined } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(errMsg(e)));
  }, [studentId, from, to]);

  const update = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const s = data?.summary;
  return (
    <>
      <PageHeader title="Attendance history" subtitle="Pick a student to see every day in a range: check-in, check-out, hours and status. The last 30 days show by default.">
        {data && (
          <button className="btn-ghost" onClick={() => downloadCsv(`history-${data.student.rollNo}.csv`, [
            ['Date', 'Status', 'Check-in', 'Check-out', 'Hours worked', 'Early out (min)', 'Overtime (min)'],
            ...data.days.map((d) => [d.date, d.status, d.checkInTime, d.checkOutTime, fmtHours(d.workingMinutes), d.earlyMinutes || 0, d.overtimeMinutes || 0]),
          ])}><Download size={16} /> Export CSV</button>
        )}
      </PageHeader>

      <div className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[14rem] flex-1">
          <label className="label">Student</label>
          <select className="input" value={studentId} onChange={(e) => update('student', e.target.value)}>
            <option value="">Choose a student…</option>
            {students.map((st) => <option key={st._id} value={st._id}>{st.name} ({st.rollNo})</option>)}
          </select>
        </div>
        <div><label className="label">From</label><input type="date" className="input" value={from || data?.from || ''} onChange={(e) => update('from', e.target.value)} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={to || data?.to || ''} onChange={(e) => update('to', e.target.value)} /></div>
      </div>

      {!studentId ? (
        <div className="panel"><Empty title="No student selected" hint="Choose a student above to see their attendance history." /></div>
      ) : !data ? (
        <p className="text-ink-500">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Attendance" value={`${s.attendancePct}%`} tone="text-teal-dark" />
            <Stat label="Days present / late / half" value={`${s.present} / ${s.late} / ${s.halfDay}`} />
            <Stat label="On leave · absent" value={`${s.leave} · ${s.absent}`} />
            <Stat label="Avg hours · early outs" value={`${fmtHours(s.avgMinutes)} · ${s.earlyOut}`} />
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink/[0.03] text-ink-500">
                <tr>{['Date', 'Status', 'Check-in', 'Check-out', 'Hours'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td className="px-5 py-3">{fmtDate(d.date)}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3">{d.checkInTime || '—'}</td>
                    <td className="px-5 py-3">
                      {d.checkOutTime || '—'}
                      {outNote(d) && <p className={`text-xs ${outNote(d).cls}`}>{outNote(d).text}</p>}
                    </td>
                    <td className="px-5 py-3">{fmtHours(d.workingMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.days.length === 0 && <Empty title="No days in this range" />}
          </div>
        </>
      )}
    </>
  );
}
