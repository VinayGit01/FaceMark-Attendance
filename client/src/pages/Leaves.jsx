import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Plus, Trash2, X } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtDate } from '../lib/format';
import { Empty, Field, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

function LeaveForm({ people, isPerson, onClose, onSaved }) {
  const [f, setF] = useState({ studentId: '', type: 'casual', fromDate: '', toDate: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/leaves', { ...f, toDate: f.toDate || f.fromDate });
      toast.success('Leave request submitted');
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title={isPerson ? 'Request leave' : 'New leave request'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {!isPerson && (
          <Field label="Person">
            <select className="input" value={f.studentId} onChange={set('studentId')} required>
              <option value="">Choose…</option>
              {people.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.rollNo})</option>)}
            </select>
          </Field>
        )}
        <Field label="Type">
          <select className="input" value={f.type} onChange={set('type')}>
            <option value="casual">Casual</option><option value="sick">Sick</option><option value="emergency">Emergency</option><option value="other">Other</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><input type="date" className="input" value={f.fromDate} onChange={set('fromDate')} required /></Field>
          <Field label="To (blank = one day)"><input type="date" className="input" value={f.toDate} min={f.fromDate} onChange={set('toDate')} /></Field>
        </div>
        <Field label="Reason"><input className="input" value={f.reason} onChange={set('reason')} placeholder="Short reason" /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Leaves() {
  const { user, can } = useAuth();
  const isPerson = !!user.person;
  const reviewer = can('leaves.review');
  const [leaves, setLeaves] = useState(null);
  const [people, setPeople] = useState([]);
  const [filter, setFilter] = useState(isPerson ? '' : 'pending');
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get('/leaves', { params: { status: filter || undefined } }).then((r) => setLeaves(r.data.leaves)).catch((e) => toast.error(errMsg(e)));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!isPerson) api.get('/students').then((r) => setPeople(r.data.people)).catch(() => {}); }, [isPerson]);

  const review = async (id, status) => {
    try {
      await api.patch(`/leaves/${id}/review`, { status });
      toast.success(status === 'approved' ? 'Approved. It now shows as leave, not absent.' : 'Rejected');
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };
  const remove = async (id) => {
    if (!confirm('Remove this leave request?')) return;
    try { await api.delete(`/leaves/${id}`); load(); } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <>
      <PageHeader title="Leave" subtitle={isPerson ? 'Request leave and see its status. Approved leave shows as “On leave” instead of absent.' : 'Requests from the people your role covers. Approved leave shows as “On leave” instead of absent.'}>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={18} /> {isPerson ? 'Request leave' : 'New request'}</button>
      </PageHeader>

      <div className="mb-5 inline-flex rounded-lg border border-ink/15 bg-white p-1">
        {[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']].map(([k, label]) => (
          <button key={label} onClick={() => setFilter(k)} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${filter === k ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink/5'}`}>{label}</button>
        ))}
      </div>

      <div className="panel overflow-x-auto">
        {!leaves ? <p className="p-6 text-ink-500">Loading…</p> : leaves.length === 0 ? (
          <Empty title="Nothing here" hint="No leave requests match this filter." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/[0.03] text-ink-500">
              <tr>{[...(isPerson ? [] : ['Person']), 'Dates', 'Type', 'Reason', 'Status', ''].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {leaves.map((l) => (
                <tr key={l._id}>
                  {!isPerson && <td className="px-5 py-3"><p className="font-semibold">{l.student?.name}</p><p className="text-xs text-ink-500">{l.student?.rollNo}</p></td>}
                  <td className="whitespace-nowrap px-5 py-3">{l.fromDate === l.toDate ? fmtDate(l.fromDate) : `${fmtDate(l.fromDate)} to ${fmtDate(l.toDate)}`}</td>
                  <td className="px-5 py-3 capitalize">{l.type}</td>
                  <td className="max-w-xs px-5 py-3">{l.reason || '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={l.status} />{l.reviewedBy && <p className="mt-1 text-xs text-ink-500">by {l.reviewedBy.name}</p>}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {reviewer && l.status === 'pending' && (
                      <>
                        <button className="btn-primary mr-2 px-3 py-1.5" onClick={() => review(l._id, 'approved')}><Check size={15} /> Approve</button>
                        <button className="btn-ghost px-3 py-1.5" onClick={() => review(l._id, 'rejected')}><X size={15} /> Reject</button>
                      </>
                    )}
                    {((isPerson && l.status === 'pending') || reviewer) && (
                      <button className="ml-2 rounded-md p-2 text-rose hover:bg-rose-soft" onClick={() => remove(l._id)} aria-label="Remove request"><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && <LeaveForm people={people} isPerson={isPerson} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </>
  );
}
