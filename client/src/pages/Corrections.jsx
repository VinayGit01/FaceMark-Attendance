import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Plus, Trash2, X } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtDate } from '../lib/format';
import { Empty, Field, Modal, PageHeader, StatusBadge } from '../components/ui.jsx';

function RequestForm({ initialDate, onClose, onSaved }) {
  const [f, setF] = useState({ date: initialDate || '', status: 'present', checkIn: '', checkOut: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/corrections', f);
      toast.success('Request sent for review');
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title="Request an attendance correction" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-ink-500">Tell us what your attendance should have been. A reviewer decides. Only the last 30 days can be corrected.</p>
        <Field label="Date"><input type="date" className="input" value={f.date} onChange={set('date')} required /></Field>
        <Field label="It should have been">
          <select className="input" value={f.status} onChange={set('status')}>
            <option value="present">Present</option><option value="late">Late</option><option value="half-day">Half-day</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in time"><input type="time" className="input" value={f.checkIn} onChange={set('checkIn')} /></Field>
          <Field label="Check-out time"><input type="time" className="input" value={f.checkOut} onChange={set('checkOut')} /></Field>
        </div>
        <Field label="Reason"><textarea className="input min-h-[5rem]" value={f.reason} onChange={set('reason')} placeholder="e.g. The camera was not working when I arrived" required minLength={5} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Corrections() {
  const { user, can } = useAuth();
  const isPerson = !!user.person;
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState(isPerson ? '' : 'pending');
  const [open, setOpen] = useState(!!params.get('date'));

  const load = useCallback(() => {
    api.get('/corrections', { params: { state: filter || undefined } }).then((r) => setItems(r.data.corrections)).catch((e) => toast.error(errMsg(e)));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, state) => {
    const note = window.prompt(state === 'approved' ? 'Note for the record (optional)' : 'Why is it rejected? (optional)');
    if (note === null) return;
    try {
      await api.patch(`/corrections/${id}/review`, { state, note });
      toast.success(state === 'approved' ? 'Approved. The attendance record was updated.' : 'Rejected');
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };
  const cancel = async (id) => {
    try { await api.delete(`/corrections/${id}`); load(); } catch (err) { toast.error(errMsg(err)); }
  };
  const closeForm = () => { setOpen(false); if (params.get('date')) setParams({}, { replace: true }); };

  return (
    <>
      <PageHeader title="Attendance corrections" subtitle={isPerson ? 'Ask for a mistake in your attendance to be fixed. A reviewer approves or rejects it.' : 'Requests from the people your role covers. Approving updates their attendance record.'}>
        {isPerson && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={18} /> New request</button>}
      </PageHeader>

      <div className="mb-5 inline-flex rounded-lg border border-ink/15 bg-white p-1">
        {[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']].map(([k, label]) => (
          <button key={label} onClick={() => setFilter(k)} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${filter === k ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink/5'}`}>{label}</button>
        ))}
      </div>

      <div className="panel overflow-x-auto">
        {!items ? <p className="p-6 text-ink-500">Loading…</p> : items.length === 0 ? <Empty title="Nothing here" hint="No correction requests match this filter." /> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/[0.03] text-ink-500">
              <tr>{[...(isPerson ? [] : ['Person']), 'Date', 'Should be', 'Reason', 'Status', ''].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {items.map((c) => (
                <tr key={c._id}>
                  {!isPerson && <td className="px-5 py-3"><p className="font-semibold">{c.student?.name}</p><p className="text-xs text-ink-500">{c.student?.rollNo}</p></td>}
                  <td className="whitespace-nowrap px-5 py-3">{fmtDate(c.date)}</td>
                  <td className="px-5 py-3"><StatusBadge status={c.status} />{(c.checkIn || c.checkOut) && <p className="mt-1 text-xs text-ink-500">{c.checkIn || '—'} to {c.checkOut || '—'}</p>}</td>
                  <td className="max-w-xs px-5 py-3">{c.reason}{c.reviewNote && <p className="mt-1 text-xs text-ink-500">Reviewer: {c.reviewNote}</p>}</td>
                  <td className="px-5 py-3"><StatusBadge status={c.state} />{c.reviewedBy && <p className="mt-1 text-xs text-ink-500">by {c.reviewedBy.name}</p>}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {can('corrections.review') && c.state === 'pending' && (
                      <>
                        <button className="btn-primary mr-2 px-3 py-1.5" onClick={() => decide(c._id, 'approved')}><Check size={15} /> Approve</button>
                        <button className="btn-ghost px-3 py-1.5" onClick={() => decide(c._id, 'rejected')}><X size={15} /> Reject</button>
                      </>
                    )}
                    {isPerson && c.state === 'pending' && <button className="rounded-md p-2 text-rose hover:bg-rose-soft" onClick={() => cancel(c._id)} aria-label="Cancel request"><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && <RequestForm initialDate={params.get('date')} onClose={closeForm} onSaved={() => { closeForm(); load(); }} />}
    </>
  );
}
