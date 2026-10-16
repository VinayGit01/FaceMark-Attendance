import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, KeyRound, Plus, ScanFace, Search, Trash2, Wand2 } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminFace } from '../context/AdminFaceContext.jsx';
import FaceCapture from '../components/FaceCapture.jsx';
import { Empty, Field, Modal, PageHeader } from '../components/ui.jsx';

const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint32Array(10))].map((b) => chars[b % chars.length]).join('');
};
const KIND = { student: 'Student', employee: 'Employee' };

function AddPerson({ kinds, lockedDept, canEnroll, onClose, onSaved }) {
  const [step, setStep] = useState('details');
  const [f, setF] = useState({ kind: kinds[0], name: '', rollNo: '', email: '', department: lockedDept || '', className: '' });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (faceDescriptors) => {
    setBusy(true);
    try {
      await api.post('/students', { ...f, faceDescriptors });
      toast.success(`${f.name} added`);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
      if (faceDescriptors) setAttempt((a) => a + 1);
      setStep('details');
    } finally { setBusy(false); }
  };

  if (step === 'face') {
    return (
      <Modal title={`Capture face · ${f.name}`} onClose={onClose}>
        <p className="mb-3 text-sm text-ink-500">Ask the person to look at the camera. They blink once, then hold still. Face data is stored as numbers, never as a photo.</p>
        <FaceCapture key={attempt} mode="enroll" busy={busy} onDone={save} />
        <button className="mt-4 w-full text-center text-sm text-ink-500 hover:underline" onClick={() => save(undefined)}>Skip for now. Someone authorised can add the face later.</button>
      </Modal>
    );
  }

  return (
    <Modal title="Add person" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); canEnroll ? setStep('face') : save(undefined); }} className="space-y-4">
        {kinds.length > 1 && (
          <Field label="Type">
            <select className="input" value={f.kind} onChange={set('kind')}>{kinds.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
          </Field>
        )}
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.kind === 'employee' ? 'Employee ID' : 'Roll number'}><input className="input" value={f.rollNo} onChange={set('rollNo')} required /></Field>
          <Field label={f.kind === 'employee' ? 'Designation' : 'Class / year'}><input className="input" value={f.className} onChange={set('className')} /></Field>
        </div>
        <Field label="Department">
          <input className="input" value={f.department} onChange={set('department')} readOnly={!!lockedDept} required />
          {lockedDept && <p className="mt-1 text-xs text-ink-500">Your role can only add people to {lockedDept}.</p>}
        </Field>
        <Field label="Contact email (optional)"><input type="email" className="input" value={f.email} onChange={set('email')} /></Field>
        {!canEnroll && <p className="rounded-lg bg-amber-soft px-3 py-2 text-xs text-[#8A5A0B]">You can add the person, but capturing face data needs a separate permission. Someone authorised can add it afterwards.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{canEnroll ? 'Next: capture face' : busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CreateLogin({ person, withProof, onClose, onSaved }) {
  const [f, setF] = useState({ email: '', mobile: '', password: randomPassword() });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await withProof((cfg) => api.post(`/students/${person._id}/login`, f, cfg));
      if (!res) return;
      toast.success('Sign-in created. Share the temporary password privately.', { duration: 6000 });
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Create sign-in · ${person.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-ink-500">This {KIND[person.kind].toLowerCase()} will sign in through the Student / Employee portal and see only their own attendance.</p>
        <Field label="Email (used to sign in)"><input type="email" className="input" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Mobile number (used for password reset OTP)"><input type="tel" className="input" value={f.mobile} onChange={set('mobile')} placeholder="98765 43210" required /></Field>
        <Field label="Temporary password">
          <div className="flex gap-2">
            <input className="input font-mono" value={f.password} onChange={set('password')} minLength={6} required />
            <button type="button" className="btn-ghost shrink-0" onClick={() => setF({ ...f, password: randomPassword() })}><Wand2 size={15} /> Generate</button>
          </div>
        </Field>
        <p className="text-xs text-ink-500">They must choose their own password at first sign-in. You will be asked for a face scan when you press Create.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create sign-in'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Reenroll({ person, withProof, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const save = async (faceDescriptors) => {
    setBusy(true);
    try {
      const res = await withProof((cfg) => api.put(`/students/${person._id}/face`, { faceDescriptors }, cfg));
      if (!res) return setAttempt((a) => a + 1);
      toast.success('Face data updated');
      onSaved();
    } catch (err) { toast.error(errMsg(err)); setAttempt((a) => a + 1); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Capture face · ${person.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-ink-500">This replaces any existing face data for this person.</p>
      <FaceCapture key={attempt} mode="enroll" busy={busy} onDone={save} />
    </Modal>
  );
}

export default function People() {
  const { user, can } = useAuth();
  const { withProof } = useAdminFace();
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [modal, setModal] = useState(null); // {type, person?}

  const scopes = user.permissions.filter((p) => p.startsWith('people.manage.')).map((p) => p.split('.')[2]);
  const kinds = scopes.includes('all') ? ['student', 'employee'] : [...(scopes.includes('employee') ? ['employee'] : []), ...(scopes.includes('student') || scopes.includes('dept') ? ['student'] : [])];
  const lockedDept = !scopes.includes('all') && !scopes.includes('student') && scopes.includes('dept') ? user.department : '';

  const load = useCallback(() => {
    api.get('/students', { params: { q: q || undefined, kind: kind || undefined } }).then((r) => setPeople(r.data.people)).catch((e) => toast.error(errMsg(e)));
  }, [q, kind]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const remove = async (p) => {
    if (!confirm(`Remove ${p.name}? Their attendance, leave, correction requests and sign-in are deleted too.`)) return;
    try { await api.delete(`/students/${p._id}`); toast.success('Removed'); load(); } catch (err) { toast.error(errMsg(err)); }
  };
  const done = () => { setModal(null); load(); };
  const bothKinds = people && new Set(people.map((p) => p.kind)).size > 1;

  return (
    <>
      <PageHeader title="People" subtitle="Students and employees your role covers. Face data is stored as numbers and is never shown or downloaded.">
        {can('people.manage') && <button className="btn-primary" onClick={() => setModal({ type: 'add' })}><Plus size={18} /> Add person</button>}
      </PageHeader>

      <div className="panel">
        <div className="flex flex-wrap gap-3 border-b border-ink/10 p-4">
          <div className="relative min-w-[14rem] max-w-sm flex-1">
            <Search size={16} className="absolute left-3 top-3.5 text-ink-500" />
            <input className="input pl-9" placeholder="Search by name, ID or department" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
          </div>
          {bothKinds && (
            <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
              <option value="">Students and employees</option><option value="student">Students</option><option value="employee">Employees</option>
            </select>
          )}
        </div>

        {!people ? <p className="p-6 text-ink-500">Loading…</p> : people.length === 0 ? (
          <Empty title="No people to show" hint={can('people.manage') ? 'Choose Add person to enrol the first one.' : 'Nobody in your scope yet.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink/[0.03] text-ink-500">
                <tr>{['Name', 'ID', 'Type', 'Department', 'Face', 'Sign-in', ''].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {people.map((p) => (
                  <tr key={p._id}>
                    <td className="px-5 py-3"><p className="font-semibold">{p.name}</p>{p.email && <p className="text-xs text-ink-500">{p.email}</p>}</td>
                    <td className="px-5 py-3">{p.rollNo}</td>
                    <td className="px-5 py-3">{KIND[p.kind]}</td>
                    <td className="px-5 py-3">{p.department}{p.className && <span className="block text-xs text-ink-500">{p.className}</span>}</td>
                    <td className="px-5 py-3">{p.faceCount ? <span className="inline-flex items-center gap-1 text-teal-dark"><Check size={14} /> Enrolled</span> : <span className="text-[#8A5A0B]">Not yet</span>}</td>
                    <td className="px-5 py-3">{p.hasLogin ? (p.loginActive ? 'Yes' : <span className="text-rose">Disabled</span>) : <span className="text-ink-500">None</span>}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      {!p.hasLogin && (p.canManage || can('users.manage')) && <button className="rounded-md p-2 hover:bg-ink/5" title="Create sign-in" onClick={() => setModal({ type: 'login', person: p })}><KeyRound size={16} /></button>}
                      {can('biometric.enroll') && <button className="rounded-md p-2 hover:bg-ink/5" title="Capture / replace face" onClick={() => setModal({ type: 'face', person: p })}><ScanFace size={16} /></button>}
                      {p.canManage && <button className="rounded-md p-2 text-rose hover:bg-rose-soft" title="Remove" onClick={() => remove(p)}><Trash2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.type === 'add' && <AddPerson kinds={kinds} lockedDept={lockedDept} canEnroll={can('biometric.enroll')} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'login' && <CreateLogin person={modal.person} withProof={withProof} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'face' && <Reenroll person={modal.person} withProof={withProof} onClose={() => setModal(null)} onSaved={done} />}
    </>
  );
}
