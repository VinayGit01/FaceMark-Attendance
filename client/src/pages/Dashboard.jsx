import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanFace } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtDate } from '../lib/format';
import { Empty, PageHeader, Stat, StatusBadge } from '../components/ui.jsx';

export default function Dashboard() {
  const { user, can } = useAuth();
  const [s, setS] = useState(null);

  useEffect(() => {
    api.get('/attendance/stats/summary').then((r) => setS(r.data));
  }, []);

  if (!s) return <p className="text-ink-500">Loading…</p>;
  const max = Math.max(1, ...s.week.map((d) => d.count));

  return (
    <>
      <PageHeader title={user.person ? 'Today' : `Today · ${user.roleLabel}`} subtitle={`${fmtDate(s.today)} · Check-in by ${s.rules.lateAfter} · Check-out at ${s.rules.checkOutTime}`}>
        <Link to="/scan" className="btn-primary">
          <ScanFace size={18} /> Check in / out
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Checked in" value={s.checkedIn} tone="text-teal-dark" />
        <Stat label="Checked out" value={s.checkedOut} />
        <Stat label="Late" value={s.late} tone="text-[#8A5A0B]" />
        <Stat label="Half-day" value={s.halfDay} tone="text-sky-800" />
        <Stat label="On leave" value={s.leave} tone="text-indigo-700" />
        <Stat label="Absent so far" value={s.absent} tone="text-rose" />
      </div>

      {can('users.manage') && s.pendingSignups > 0 && (
        <Link to="/users" className="mt-5 block rounded-lg bg-amber-soft px-4 py-3 text-sm font-medium text-[#8A5A0B] hover:opacity-90">
          {s.pendingSignups} new sign-up request{s.pendingSignups > 1 ? 's' : ''} waiting. Approve them with a face scan.
        </Link>
      )}

      {s.pendingCorrections > 0 && (
        <Link to="/corrections" className="mt-5 block rounded-lg bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900 hover:bg-sky-100">
          {s.pendingCorrections} attendance correction request{s.pendingCorrections > 1 ? 's' : ''} waiting for your review.
        </Link>
      )}

      {s.pendingLeaves > 0 && (
        <Link to="/leaves" className="mt-5 block rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 hover:bg-indigo-100">
          {s.pendingLeaves} leave request{s.pendingLeaves > 1 ? 's' : ''} waiting for your decision. Review them.
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="panel p-5 lg:col-span-3">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Last 7 days</h2>
            <p className="text-sm text-ink-500">Attendance rate today: <b className="text-ink">{s.rate}%</b></p>
          </div>
          <div className="flex h-48 items-end gap-3">
            {s.week.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold">{d.count}</span>
                <div className="flex h-36 w-full items-end">
                  <div className="w-full rounded-t-md bg-teal" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 2, opacity: d.count ? 1 : 0.25 }} />
                </div>
                <span className="text-xs text-ink-500">{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel lg:col-span-2">
          <div className="border-b border-ink/10 px-5 py-4">
            <h2 className="text-lg font-bold">Latest activity</h2>
          </div>
          {s.recent.length === 0 ? (
            <Empty title="No one yet today" hint="Open Check in / out and let students face the camera." />
          ) : (
            <ul className="divide-y divide-ink/10">
              {s.recent.map((r) => (
                <li key={r._id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold">{r.student?.name}</p>
                    <p className="text-xs text-ink-500">{r.action === 'check-out' ? 'Checked out' : 'Checked in'} at {r.time}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {can('biometric.enroll') && s.totalStudents > s.enrolledFaces && (
        <p className="mt-6 rounded-lg bg-amber-soft px-4 py-3 text-sm text-[#8A5A0B]">
          {s.totalStudents - s.enrolledFaces} student(s) have no face samples yet and cannot be recognised.
        </p>
      )}
    </>
  );
}
