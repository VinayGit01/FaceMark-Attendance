import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ScanFace } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { detectOne, loadFaceModels } from '../lib/face';
import useCamera from '../lib/useCamera';
import { fmtDate, fmtHours, outNote } from '../lib/format';
import { Modal, PageHeader, Stat, StatusBadge } from '../components/ui.jsx';

const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return { from: `${m}-01`, to: `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}` };
};
const daysAgo = (date) => (Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000;

const RESULT = {
  'check-in': (d) => `Checked in at ${d.record.checkInTime}`,
  'check-out': (d) => `Checked out at ${d.record.checkOutTime} · ${fmtHours(d.record.workingMinutes)} worked`,
  'already-checked-in': () => 'You are already checked in. Check-out opens a little later.',
  completed: () => 'Your day is already complete.',
  'on-leave': () => 'You are on approved leave today.',
  'too-early': (d) => `Check-out opens at ${d.checkOutTime}.`,
};

function SelfMark({ onClose, onDone }) {
  const { videoRef, ready, error, start } = useCamera();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => { loadFaceModels().then(start); }, [start]);

  const run = async () => {
    setBusy(true);
    setResult('');
    try {
      const det = await detectOne(videoRef.current);
      if (!det) return setResult('No face found. Look at the camera in good light.');
      const { data } = await api.post('/me/mark', { descriptor: Array.from(det.descriptor), mode: 'auto' });
      setResult((RESULT[data.action] || (() => 'Done'))(data));
      onDone();
    } catch (err) {
      setResult(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Mark my attendance" onClose={onClose}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        {!ready && <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/70">{error || 'Starting camera…'}</p>}
      </div>
      <p className="mt-3 min-h-[1.5rem] text-center text-sm font-medium" role="status" aria-live="polite">{result}</p>
      <p className="mb-3 text-center text-xs text-ink-500">Your face is checked against your own enrolled face. Nothing is recorded if it does not match.</p>
      <button className="btn-primary w-full" onClick={run} disabled={!ready || busy}><ScanFace size={16} /> {busy ? 'Checking…' : 'Verify my face and mark'}</button>
    </Modal>
  );
}

export default function MyAttendance() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthNow());
  const [data, setData] = useState(null);
  const [mark, setMark] = useState(false);

  const load = useCallback(() => {
    api.get('/me/overview', { params: monthRange(month) }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <p className="text-ink-500">Loading…</p>;
  const { person, today, summary: s } = data;

  return (
    <>
      <PageHeader title={`Hello, ${person.name.split(' ')[0]}`} subtitle={`${person.kind === 'employee' ? 'Employee' : 'Student'} · ${person.rollNo} · ${person.department}. Only you can see this page.`}>
        {data.canSelfMark && <button className="btn-primary" onClick={() => setMark(true)}><ScanFace size={18} /> Mark my attendance</button>}
        <Link to="/corrections" className="btn-ghost">My correction requests</Link>
      </PageHeader>

      <div className="panel mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <p className="text-sm text-ink-500">Today</p>
          <div className="mt-1">{today ? <StatusBadge status={today.status} /> : <span className="text-sm text-ink-500">No record</span>}</div>
        </div>
        <div><p className="text-sm text-ink-500">Checked in</p><p className="mt-1 font-display text-2xl font-bold">{today?.checkInTime || '—'}</p></div>
        <div><p className="text-sm text-ink-500">Checked out</p><p className="mt-1 font-display text-2xl font-bold">{today?.checkOutTime || '—'}</p></div>
        <div><p className="text-sm text-ink-500">Hours today</p><p className="mt-1 font-display text-2xl font-bold">{fmtHours(today?.workingMinutes)}</p></div>
        <p className="ml-auto max-w-xs text-xs text-ink-500">Check-in by {data.rules.lateAfter}. Check-out at {data.rules.checkOutTime}. {!data.canSelfMark && 'Use the attendance terminal to mark your attendance.'}</p>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-bold">My history</h2>
        <input type="month" className="input w-auto" value={month} max={monthNow()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Attendance" value={`${s.attendancePct}%`} tone="text-teal-dark" />
        <Stat label="Present / late / half-day" value={`${s.present} / ${s.late} / ${s.halfDay}`} />
        <Stat label="On leave · absent" value={`${s.leave} · ${s.absent}`} />
        <Stat label="Average hours per day" value={fmtHours(s.avgMinutes)} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink/[0.03] text-ink-500">
            <tr>{['Date', 'Status', 'Check-in', 'Check-out', 'Hours', ''].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {data.days.map((d) => (
              <tr key={d.date}>
                <td className="px-5 py-3">{fmtDate(d.date)}</td>
                <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-5 py-3">{d.checkInTime || '—'}</td>
                <td className="px-5 py-3">{d.checkOutTime || '—'}{outNote(d) && <p className={`text-xs ${outNote(d).cls}`}>{outNote(d).text}</p>}</td>
                <td className="px-5 py-3">{fmtHours(d.workingMinutes)}</td>
                <td className="px-5 py-3 text-right">
                  {!['weekoff', 'leave'].includes(d.status) && daysAgo(d.date) <= 30 && (
                    <button className="text-sm font-medium text-teal-dark hover:underline" onClick={() => navigate(`/corrections?date=${d.date}`)}>Request correction</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.days.length === 0 && <p className="p-6 text-center text-sm text-ink-500">No days to show for this month yet.</p>}
      </div>

      {mark && <SelfMark onClose={() => setMark(false)} onDone={load} />}
    </>
  );
}
