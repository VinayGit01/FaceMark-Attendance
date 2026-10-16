import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import FaceCapture from '../components/FaceCapture.jsx';
import { AuthShell } from './Login.jsx';

export default function Signup() {
  const [stage, setStage] = useState('details'); // details | face | sent
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const next = (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) return toast.error('The two passwords do not match');
    setStage('face');
  };

  const submit = async (descriptors) => {
    setBusy(true);
    try {
      const { confirm, ...account } = f;
      await api.post('/auth/signup', { ...account, faceDescriptors: descriptors });
      setStage('sent');
    } catch (err) {
      toast.error(errMsg(err));
      if (err.response?.status === 409 || err.response?.status === 400) setStage('details');
      else setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'sent') {
    return (
      <AuthShell title="Request sent" subtitle="You cannot sign in yet.">
        <div className="panel p-5 text-sm">
          <CheckCircle2 className="mb-3 text-teal" size={28} />
          <p className="font-semibold">An admin will review your request.</p>
          <p className="mt-1.5 text-ink-500">They approve it with their own face scan. After that, sign in with your password and your face.</p>
        </div>
        <p className="mt-8 text-center text-sm"><Link to="/login" className="font-medium text-teal-dark hover:underline">Back to sign in</Link></p>
      </AuthShell>
    );
  }

  if (stage === 'face') {
    return (
      <AuthShell title="Register your face" subtitle="Blink once, then hold still. This is the face you will use to sign in.">
        <FaceCapture key={attempt} mode="enroll" busy={busy} onDone={submit} />
        <button className="mt-4 w-full text-center text-sm text-ink-500 hover:underline" onClick={() => setStage('details')}>Back</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Request an account" subtitle="Fill in your details, then register your face. An admin approves every new account.">
      <form onSubmit={next} className="space-y-4">
        <div><label className="label" htmlFor="n">Full name</label><input id="n" className="input" value={f.name} onChange={set('name')} required /></div>
        <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" className="input" value={f.email} onChange={set('email')} required autoComplete="email" /></div>
        <div><label className="label" htmlFor="m">Mobile number</label><input id="m" type="tel" className="input" value={f.mobile} onChange={set('mobile')} placeholder="98765 43210" required /></div>
        <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" minLength={6} className="input" value={f.password} onChange={set('password')} required autoComplete="new-password" /></div>
        <div><label className="label" htmlFor="c">Confirm password</label><input id="c" type="password" minLength={6} className="input" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" /></div>
        <button className="btn-primary w-full">Continue to face scan</button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-500">Already approved? <Link to="/login" className="font-medium text-teal-dark hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
