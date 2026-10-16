import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ScanFace } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { errMsg } from '../lib/api';
import FaceCapture from '../components/FaceCapture.jsx';

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-ink lg:block">
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative h-80 w-72">
            {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((c) => (
              <span key={c} className={`absolute h-12 w-12 rounded-sm border-teal ${c}`} />
            ))}
            <div className="scan-line absolute left-2 right-2 h-0.5 bg-teal shadow-[0_0_18px_3px_rgba(15,139,141,.7)]" />
            <ScanFace className="absolute inset-0 m-auto text-white/15" size={140} strokeWidth={1} />
          </div>
        </div>
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <h2 className="font-display text-3xl font-bold leading-tight">Your face is the key.</h2>
          <p className="mt-3 max-w-md text-white/65">Sign in with your password and a quick face scan. New accounts are approved by an admin in person.</p>
        </div>
      </div>
      <div className="grid place-items-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal text-white"><ScanFace size={20} /></div>
            <span className="font-display text-lg font-bold">FaceMark</span>
          </div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mb-7 mt-1.5 text-sm text-ink-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, startSession } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const portal = params.get('portal') === 'member' ? 'member' : 'staff';
  const [needsSetup, setNeedsSetup] = useState(false);
  const [stage, setStage] = useState('credentials'); // credentials | verify | enroll | setup-face
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '' });
  const [faceToken, setFaceToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0); // remounts the camera after a failed scan

  useEffect(() => {
    api.get('/auth/setup-status').then((r) => setNeedsSetup(r.data.needsSetup)).catch(() => {});
  }, []);

  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (needsSetup) return setStage('setup-face');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { email: form.email, password: form.password, portal });
      if (data.token) { startSession(data); return navigate('/'); }
      setFaceToken(data.faceToken);
      setStage(data.faceStep === 'enroll' ? 'enroll' : 'verify');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (path, body) => {
    setBusy(true);
    try {
      const { data } = await api.post(path, body);
      startSession(data);
      navigate('/');
    } catch (err) {
      toast.error(errMsg(err));
      if (err.response?.data?.code === 'FACE_TOKEN_EXPIRED' || err.response?.status === 429) setStage('credentials');
      else setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'setup-face') {
    return (
      <AuthShell title="Register your face" subtitle="This admin face will be needed to sign in and to approve new users.">
        <FaceCapture key={attempt} mode="enroll" busy={busy} onDone={(d) => finish('/auth/register', { ...form, faceDescriptors: d })} />
        <button className="mt-4 w-full text-center text-sm text-ink-500 hover:underline" onClick={() => setStage('credentials')}>Back</button>
      </AuthShell>
    );
  }
  if (stage === 'verify') {
    return (
      <AuthShell title="Verify it is you" subtitle="Password accepted. Now look at the camera and blink once.">
        <FaceCapture key={attempt} mode="verify" busy={busy} onDone={(d) => finish('/auth/face/login', { faceToken, descriptors: d })} />
        <button className="mt-4 w-full text-center text-sm text-ink-500 hover:underline" onClick={() => setStage('credentials')}>Use a different account</button>
      </AuthShell>
    );
  }
  if (stage === 'enroll') {
    return (
      <AuthShell title="Register your face" subtitle="First time here. Your face will be needed every time you sign in.">
        <FaceCapture key={attempt} mode="enroll" busy={busy} onDone={(d) => finish('/auth/face/enroll', { faceToken, descriptors: d })} />
        <button className="mt-4 w-full text-center text-sm text-ink-500 hover:underline" onClick={() => setStage('credentials')}>Cancel</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={needsSetup ? 'Create the admin account' : portal === 'member' ? 'Student / Employee sign in' : 'Staff and admin sign in'}
      subtitle={needsSetup ? 'You are the first user, so this account manages everything. Next you will register your face.' : portal === 'member' ? 'See your own attendance, leave and corrections.' : 'Admins, HR, heads of department, faculty and executives.'}
    >
      {!needsSetup && (
        <div className="mb-6 grid grid-cols-2 rounded-lg border border-ink/15 bg-white p-1 text-sm font-semibold" role="tablist" aria-label="Choose your sign-in">
          {[['staff', 'Staff and admin'], ['member', 'Student / Employee']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={portal === k} onClick={() => setParams(k === 'member' ? { portal: 'member' } : {}, { replace: true })} className={`rounded-md px-3 py-2 transition ${portal === k ? 'bg-ink text-white' : 'text-ink-600 hover:bg-ink/5'}`}>{label}</button>
          ))}
        </div>
      )}
      <form onSubmit={submit}>
        {needsSetup && (
          <>
            <div className="mb-4">
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" className="input" value={form.name} onChange={set('name')} required />
            </div>
            <div className="mb-4">
              <label className="label" htmlFor="mobile">Mobile number</label>
              <input id="mobile" type="tel" className="input" value={form.mobile} onChange={set('mobile')} placeholder="98765 43210" required />
            </div>
          </>
        )}
        <div className="mb-4">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={form.email} onChange={set('email')} required autoComplete="email" />
        </div>
        <div className="mb-2">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" minLength={6} className="input" value={form.password} onChange={set('password')} required autoComplete={needsSetup ? 'new-password' : 'current-password'} />
        </div>
        {!needsSetup && (
          <div className="mb-5 text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-teal-dark hover:underline">Forgot password?</Link>
          </div>
        )}
        <button className={`btn-primary w-full ${needsSetup ? 'mt-4' : ''}`} disabled={busy}>
          {busy ? 'Please wait…' : needsSetup ? 'Continue to face scan' : 'Continue'}
        </button>
      </form>
      {!needsSetup && portal === 'staff' && (
        <p className="mt-8 text-center text-sm text-ink-500">
          New here? <Link to="/signup" className="font-medium text-teal-dark hover:underline">Request an account</Link>
        </p>
      )}
    </AuthShell>
  );
}
