import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, KeyRound, Plus, ScanFace, ShieldCheck, Trash2, UserCheck, UserX, Wand2, X } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminFace } from '../context/AdminFaceContext.jsx';
import { Empty, Field, Modal, PageHeader } from '../components/ui.jsx';

const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint32Array(10))].map((b) => chars[b % chars.length]).join('');
};

function PasswordField({ value, onChange }) {
  return (
    <div className="flex gap-2">
      <input className="input font-mono" value={value} onChange={onChange} minLength={6} required />
      <button type="button" className="btn-ghost shrink-0" onClick={() => onChange({ target: { value: randomPassword() } })}><Wand2 size={15} /> Generate</button>
    </div>
  );
}

const staffRoles = (cat) => Object.entries(cat.roles).filter(([, r]) => r.staff);
const SIDE = { system: 'System', company: 'Company', college: 'College' };

function RoleSelect({ cat, value, onChange, ...rest }) {
  return (
    <select className="input" value={value} onChange={onChange} {...rest}>
      {['system', 'company', 'college'].map((side) => (
        <optgroup key={side} label={SIDE[side]}>
          {staffRoles(cat).filter(([, r]) => r.side === side).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function CreateUser({ cat, onClose, onSaved, withProof }) {
  const [f, setF] = useState({ name: '', email: '', mobile: '', role: 'hr_manager', department: '', password: randomPassword() });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const role = cat.roles[f.role];

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await withProof((cfg) => api.post('/users', f, cfg));
      if (!res) return;
      toast.success(`Account created. Share the temporary password with ${f.name}.`, { duration: 6000 });
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title="Create staff account" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Full name"><input className="input" value={f.name} onChange={set('name')} required /></Field>
        <Field label="Email (used to sign in)"><input type="email" className="input" value={f.email} onChange={set('email')} required /></Field>
        <Field label={f.role === 'terminal' ? 'Mobile number (optional for a device)' : 'Mobile number (used for password reset OTP)'}>
          <input type="tel" className="input" value={f.mobile} onChange={set('mobile')} placeholder="98765 43210" required={f.role !== 'terminal'} />
        </Field>
        <Field label="Role"><RoleSelect cat={cat} value={f.role} onChange={set('role')} /></Field>
        {role.needsDepartment && (
          <Field label="Department">
            <input className="input" value={f.department} onChange={set('department')} required />
            <p className="mt-1 text-xs text-ink-500">This person will only ever see students in this department.</p>
          </Field>
        )}
        <Field label="Temporary password"><PasswordField value={f.password} onChange={set('password')} /></Field>
        <p className="text-xs text-ink-500">They choose their own password and register their own face at first sign-in. You will be asked for a face scan when you press Create.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ target, onClose, withProof }) {
  const [password, setPassword] = useState(randomPassword());
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await withProof((cfg) => api.post(`/users/${target._id}/reset-password`, { password }, cfg));
      if (!res) return;
      toast.success('Temporary password set');
      onClose();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Reset password · ${target.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="New temporary password"><PasswordField value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <p className="text-xs text-ink-500">They are signed out everywhere and must choose their own password at next sign-in.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Role, department and extra permissions for one user
function EditAccess({ cat, target, onClose, onSaved, withProof }) {
  const isStaff = cat.roles[target.role]?.staff;
  const [role, setRole] = useState(target.role);
  const [department, setDepartment] = useState(target.department || '');
  const [granted, setGranted] = useState(new Set(target.grantedPermissions || []));
  const [busy, setBusy] = useState(false);
  const defaults = new Set(cat.roles[role]?.defaults || []);
  const toggle = (p) => setGranted((g) => { const n = new Set(g); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const box = (p, label, sensitive) => {
    const fromRole = defaults.has(p);
    return (
      <label key={p} className={`flex items-start gap-2 py-1 text-sm ${fromRole ? 'text-ink-500' : ''}`}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal" checked={fromRole || granted.has(p)} disabled={fromRole} onChange={() => toggle(p)} />
        <span>{label}{fromRole && <span className="ml-1.5 text-xs">(from role)</span>}{sensitive && !fromRole && <span className="ml-1.5 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-semibold text-[#8A5A0B]">sensitive</span>}</span>
      </label>
    );
  };

  const save = async () => {
    setBusy(true);
    try {
      if (isStaff && (role !== target.role || department !== (target.department || ''))) {
        const r1 = await withProof((cfg) => api.patch(`/users/${target._id}`, { role, department }, cfg));
        if (!r1) return;
      }
      const extras = [...granted].filter((p) => !defaults.has(p));
      const r2 = await withProof((cfg) => api.put(`/users/${target._id}/permissions`, { granted: extras }, cfg));
      if (!r2) return;
      toast.success('Access updated');
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Access · ${target.name}`} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role">
          {isStaff ? <RoleSelect cat={cat} value={role} onChange={(e) => setRole(e.target.value)} /> : <p className="input bg-ink/5">{cat.roles[role].label}</p>}
        </Field>
        {cat.roles[role]?.needsDepartment && <Field label="Department"><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} required /></Field>}
      </div>

      {!isStaff ? (
        <p className="mt-4 rounded-lg bg-ink/5 p-3 text-sm text-ink-600">Students and employees only ever see their own records. Extra permissions are not offered for these sign-ins.</p>
      ) : (
        <div className="mt-5 max-h-[22rem] space-y-5 overflow-y-auto pr-1">
          <p className="text-xs text-ink-500">Ticked boxes with “from role” come with the role. Anything you tick on top is an extra grant for this person only. Face-data permissions are never part of a role.</p>
          <div>
            <p className="mb-1 text-sm font-semibold">System and biometric</p>
            {cat.singles.map((s) => box(s.key, s.label, s.sensitive))}
          </div>
          {cat.caps.map((c) => (
            <div key={c.cap}>
              <p className="mb-1 text-sm font-semibold">{c.label}</p>
              <div className="grid gap-x-4 sm:grid-cols-2">{c.scopes.map((s) => box(s.permission, s.label))}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}><ShieldCheck size={16} /> {busy ? 'Saving…' : 'Save access'}</button>
      </div>
    </Modal>
  );
}

const statusLabel = (u) =>
  u.status === 'pending' ? <span className="text-[#8A5A0B]">Waiting for approval</span>
  : u.status === 'rejected' ? <span className="text-rose">Rejected</span>
  : !u.active ? <span className="text-rose">Disabled</span>
  : u.mustChangePassword ? <span className="text-[#8A5A0B]">Must change password</span>
  : <span className="text-teal-dark">Active</span>;

export default function Users() {
  const { user: me } = useAuth();
  const { withProof } = useAdminFace();
  const [users, setUsers] = useState(null);
  const [cat, setCat] = useState(null);
  const [modal, setModal] = useState(null);
  const [picks, setPicks] = useState({}); // role/department chosen per pending request

  const load = useCallback(() => { api.get('/users').then((r) => setUsers(r.data.users)); }, []);
  useEffect(() => { load(); api.get('/users/catalog').then((r) => setCat(r.data)); }, [load]);

  const act = async (fn, okMsg) => {
    try {
      const res = await withProof(fn);
      if (res === undefined) return;
      if (okMsg) toast.success(okMsg);
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };

  const approve = (u) => {
    const p = picks[u._id] || {};
    const role = p.role || 'faculty';
    return act((cfg) => api.post(`/users/${u._id}/approve`, { role, department: p.department }, cfg), `${u.name} approved. They can now sign in.`);
  };
  const rejectReq = (u) => confirm(`Reject the request from ${u.name}?`) && act((cfg) => api.post(`/users/${u._id}/reject`, {}, cfg), 'Request rejected');
  const toggle = (u) => act((cfg) => api.patch(`/users/${u._id}`, { active: !u.active }, cfg));
  const remove = (u) => confirm(`Delete the account for ${u.name}?`) && act((cfg) => api.delete(`/users/${u._id}`, cfg), 'Account deleted');
  const resetFace = (u) => confirm(`Remove ${u.name}'s sign-in face? They will register a new one at next sign-in.`) && act((cfg) => api.post(`/users/${u._id}/reset-face`, {}, cfg), 'Face removed');

  if (!cat) return <p className="text-ink-500">Loading…</p>;
  const pending = users?.filter((u) => u.status === 'pending') || [];
  const rest = users?.filter((u) => u.status !== 'pending') || [];
  const closeReload = () => { setModal(null); load(); };

  return (
    <>
      <PageHeader title="Accounts & access" subtitle="Create accounts, choose each person's role and department, and grant extra permissions. Every change here asks for a face scan and is written to the audit log.">
        <button className="btn-primary" onClick={() => setModal({ type: 'create' })}><Plus size={18} /> Create account</button>
      </PageHeader>

      {pending.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber/40 bg-amber-soft/60 p-1">
          <p className="px-4 pb-1 pt-3 text-sm font-semibold text-[#8A5A0B]">{pending.length} sign-up request{pending.length > 1 ? 's' : ''} waiting for approval</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody>
                {pending.map((u) => {
                  const p = picks[u._id] || { role: 'faculty' };
                  return (
                    <tr key={u._id} className="border-t border-amber/30">
                      <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-ink-500">{u.email} · {u.mobile}</p></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <div className="w-48"><RoleSelect cat={cat} value={p.role || 'faculty'} aria-label={`Role for ${u.name}`} onChange={(e) => setPicks({ ...picks, [u._id]: { ...p, role: e.target.value } })} /></div>
                          {cat_needsDept(cat, p.role || 'faculty') && <input className="input w-44" placeholder="Department" aria-label={`Department for ${u.name}`} value={p.department || ''} onChange={(e) => setPicks({ ...picks, [u._id]: { ...p, department: e.target.value } })} />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button className="btn-primary mr-2 px-3 py-1.5" onClick={() => approve(u)}><ScanFace size={15} /> Approve with face scan</button>
                        <button className="btn-ghost px-3 py-1.5" onClick={() => rejectReq(u)}><X size={15} /> Reject</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel overflow-x-auto">
        {!users ? <p className="p-6 text-ink-500">Loading…</p> : rest.length === 0 ? <Empty title="No accounts" /> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/[0.03] text-ink-500">
              <tr>{['Name', 'Email', 'Role', 'Face', 'Status', ''].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {rest.map((u) => {
                const self = u._id === me.id;
                const extras = (u.grantedPermissions || []).length;
                return (
                  <tr key={u._id}>
                    <td className="px-5 py-3 font-semibold">{u.name}{self && <span className="ml-2 text-xs font-normal text-ink-500">(you)</span>}{u.person && <p className="text-xs font-normal text-ink-500">Linked to {u.person.rollNo}</p>}</td>
                    <td className="px-5 py-3">{u.email}<p className="text-xs text-ink-500">{u.mobile || '—'}</p></td>
                    <td className="px-5 py-3">{u.roleLabel}{u.department && <p className="text-xs text-ink-500">{u.department}</p>}{extras > 0 && <p className="text-xs text-[#8A5A0B]">+{extras} extra permission{extras > 1 ? 's' : ''}</p>}</td>
                    <td className="px-5 py-3">{u.faceEnrolled ? <span className="inline-flex items-center gap-1 text-teal-dark"><Check size={14} /> Enrolled</span> : <span className="text-ink-500">Not yet</span>}</td>
                    <td className="px-5 py-3">{statusLabel(u)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button className="rounded-md p-2 hover:bg-ink/5" title="Role and permissions" onClick={() => setModal({ type: 'access', target: u })}><ShieldCheck size={16} /></button>
                      <button className="rounded-md p-2 hover:bg-ink/5" title="Set temporary password" onClick={() => setModal({ type: 'reset', target: u })}><KeyRound size={16} /></button>
                      <button className="rounded-md p-2 hover:bg-ink/5" title="Reset sign-in face" onClick={() => resetFace(u)}><ScanFace size={16} /></button>
                      {!self && (
                        <>
                          <button className="rounded-md p-2 hover:bg-ink/5" title={u.active ? 'Disable account' : 'Enable account'} onClick={() => toggle(u)}>{u.active ? <UserX size={16} /> : <UserCheck size={16} />}</button>
                          <button className="rounded-md p-2 text-rose hover:bg-rose-soft" title="Delete account" onClick={() => remove(u)}><Trash2 size={16} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.type === 'create' && <CreateUser cat={cat} withProof={withProof} onClose={() => setModal(null)} onSaved={closeReload} />}
      {modal?.type === 'reset' && <ResetPassword target={modal.target} withProof={withProof} onClose={closeReload} />}
      {modal?.type === 'access' && <EditAccess cat={cat} target={modal.target} withProof={withProof} onClose={() => setModal(null)} onSaved={closeReload} />}
    </>
  );
}

function cat_needsDept(cat, role) { return !!cat.roles[role]?.needsDepartment; }
