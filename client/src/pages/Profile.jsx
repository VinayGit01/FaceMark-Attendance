import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { permLabel } from '../lib/perms';
import { Field, PageHeader } from '../components/ui.jsx';

export default function Profile() {
  const { user, refresh } = useAuth();
  const staff = !user.person;
  const [f, setF] = useState({ name: user.name, mobile: user.mobile || '', currentPassword: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch('/auth/profile', staff ? f : { mobile: f.mobile, currentPassword: f.currentPassword });
      await refresh();
      setF((x) => ({ ...x, currentPassword: '' }));
      toast.success('Profile updated');
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="My profile" subtitle={`${user.roleLabel}${user.department ? ` · ${user.department}` : ''}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={save} className="panel space-y-4 p-6">
          <h2 className="text-lg font-bold">Details you can change</h2>
          <Field label="Name">
            <input className="input" value={f.name} onChange={set('name')} disabled={!staff} />
            {!staff && <p className="mt-1 text-xs text-ink-500">Your name is kept by your {user.role === 'employee' ? 'HR team' : 'institution'}. Ask them to change it.</p>}
          </Field>
          <Field label="Email"><input className="input bg-ink/5" value={user.email} disabled /></Field>
          <Field label="Mobile number (used to reset your password)"><input type="tel" className="input" value={f.mobile} onChange={set('mobile')} required /></Field>
          {f.mobile !== (user.mobile || '') && (
            <Field label="Current password (needed to change your mobile number)"><input type="password" className="input" value={f.currentPassword} onChange={set('currentPassword')} required autoComplete="current-password" /></Field>
          )}
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            <Link to="/change-password" className="text-sm font-medium text-teal-dark hover:underline">Change password</Link>
          </div>
        </form>

        <div className="panel p-6">
          <h2 className="text-lg font-bold">What your account can do</h2>
          {user.person ? (
            <p className="mt-3 text-sm text-ink-600">You can see your own attendance, hours, leave and correction requests. Nothing else, and nobody outside your reviewers sees yours.</p>
          ) : user.permissions.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No permissions yet. Ask a Super Admin.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">{user.permissions.map((p) => <li key={p} className="flex gap-2"><span className="text-teal">•</span>{permLabel(p)}</li>)}</ul>
          )}
        </div>
      </div>
    </>
  );
}
