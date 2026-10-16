import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../components/ui.jsx';

export default function ChangePassword() {
  const { user, startSession } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return toast.error('The two new passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      startSession(data);
      toast.success('Password updated');
      navigate('/');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={user?.mustChangePassword ? 'Choose your own password' : 'Change password'}
        subtitle={user?.mustChangePassword ? 'Your admin set a temporary password. Replace it with one only you know before continuing.' : 'Other devices will be signed out.'}
      />
      <form onSubmit={submit} className="panel max-w-md space-y-4 p-6">
        <div>
          <label className="label">{user?.mustChangePassword ? 'Temporary password' : 'Current password'}</label>
          <input type="password" className="input" value={f.currentPassword} onChange={set('currentPassword')} required autoComplete="current-password" />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" minLength={6} className="input" value={f.newPassword} onChange={set('newPassword')} required autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" minLength={6} className="input" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" />
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </>
  );
}
