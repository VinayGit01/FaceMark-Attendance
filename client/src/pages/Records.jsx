import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Pencil } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { downloadCsv, fmtHours, outNote } from '../lib/format';
import { Empty, Field, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function EditModal({ row, date, onClose, onSaved }) {
  const [f, setF] = useState({
    status: ['present', 'late', 'half-day', 'absent'].includes(row.status) ? row.status : 'present',
    checkIn: row.checkInTime || '',
    checkOut: row.checkOutTime || '',
    note: row.note && row.status !== 'leave' ? row.note : '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/attendance/manual', { studentId: row.student._id, date, ...f });
      toast.success('Attendance updated');
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit · ${row.student.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="half-day">Half-day</option>
            <option value="absent">Absent (removes the record)</option>
          </select>
        </Field>
        {f.status !== 'absent' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-in"><input type="time" className="input" value={f.checkIn} onChange={set('checkIn')} /></Field>
            <Field label="Check-out"><input type="time" className="input" value={f.checkOut} onChange={set('checkOut')} /></Field>
          </div>
        )}
        <Field label="Note (optional)"><input className="input" value={f.note} onChange={set('note')} placeholder="e.g. Camera was down" /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Records() {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    api.get(`/attendance/day/${date}`).then((r) => setRows(r.data.rows)).catch((e) => toast.error(errMsg(e)));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const count = (s) => rows?.filter((r) => r.status === s).length ?? 0;

  const exportCsv = () =>
    downloadCsv(`attendance-${date}.csv`, [
      ['Roll no', 'Name', 'Department', 'Status', 'Check-in', 'Check-out', 'Hours worked', 'Early out (min)', 'Overtime (min)'],
      ...rows.map((r) => [r.student.rollNo, r.student.name, r.student.department, r.status, r.checkInTime, r.checkOutTime, fmtHours(r.workingMinutes), r.earlyMinutes || 0, r.overtimeMinutes || 0]),
    ]);

  return (
    <>
      <PageHeader title="Daily records" subtitle="Only the people your role covers. Anyone without a check-in and without approved leave is absent. Where you have permission, you can correct a record.">
        <input type="date" className="input w-auto" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn-ghost" onClick={exportCsv} disabled={!rows?.length}><Download size={16} /> Export CSV</button>
      </PageHeader>

      {rows && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-teal-soft px-3 py-1 font-semibold text-teal-dark">{count('present')} present</span>
          <span className="rounded-full bg-amber-soft px-3 py-1 font-semibold text-[#8A5A0B]">{count('late')} late</span>
          <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">{count('half-day')} half-day</span>
          <span className="rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-700">{count('leave')} on leave</span>
          <span className="rounded-full bg-rose-soft px-3 py-1 font-semibold text-rose">{count('absent')} absent</span>
        </div>
      )}

      <div className="panel overflow-x-auto">
        {!rows ? (
          <p className="p-6 text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <Empty title="No students to show" hint="Add students first, then each day's attendance appears here." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/[0.03] text-ink-500">
              <tr>
                {['Roll no.', 'Name', 'Status', 'Check-in', 'Check-out', 'Hours', 'Source', ''].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {rows.map((r) => (
                <tr key={r.student._id}>
                  <td className="px-5 py-3">{r.student.rollNo}</td>
                  <td className="px-5 py-3 font-semibold">{r.student.name}</td>
                  <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-3">{r.checkInTime || '—'}</td>
                  <td className="px-5 py-3">
                    {r.checkOutTime || (r.checkInTime ? <span className="text-ink-500">Still in</span> : '—')}
                    {outNote(r) && <p className={`text-xs ${outNote(r).cls}`}>{outNote(r).text}</p>}
                  </td>
                  <td className="px-5 py-3">{fmtHours(r.workingMinutes)}</td>
                  <td className="px-5 py-3">{r.method === 'face' ? `Face${r.confidence ? ` ${Math.round(r.confidence * 100)}%` : ''}` : r.method === 'manual' ? 'Manual' : '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {r.canEdit && <button className="rounded-md p-2 hover:bg-ink/5" onClick={() => setEdit(r)} aria-label={`Edit ${r.student.name}`}><Pencil size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && <EditModal row={edit} date={date} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}
