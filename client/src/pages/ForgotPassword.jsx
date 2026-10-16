import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { errMsg } from '../lib/api';
import { AuthShell } from './Login.jsx';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 mobile, 2 code, 3 new password
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [pw, setPw] = useState({ a: '', b: '' });
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    return run(async () => {
      const { data } = await api.post('/auth/forgot-password', { mobile });
      toast.success(data.message);
      if (data.devOtp) toast(`Development mode: your code is ${data.devOtp}`, { icon: '🛠️', duration: 12000 });
      setWait(data.resendSeconds || 30);
      setStep(2);
    });
  };

  const verify = (e) => {
    e.preventDefault();
    return run(async () => {
      const { data } = await api.post('/auth/verify-otp', { mobile, otp });
      setResetToken(data.resetToken);
      setStep(3);
    });
  };

  const reset = (e) => {
    e.preventDefault();
    if (pw.a !== pw.b) return toast.error('The two passwords do not match');
    return run(async () => {
      const { data } = await api.post('/auth/reset-password', { resetToken, newPassword: pw.a });
      toast.success(data.message);
      navigate('/login');
    });
  };

  const titles = {
    1: ['Reset your password', 'Enter the mobile number saved on your account. We will text you a 6-digit code.'],
    2: ['Enter the code', `We sent a code to ${mobile}. It expires in a few minutes.`],
    3: ['Choose a new password', 'Use at least 6 characters.'],
  };

  return (
    <AuthShell title={titles[step][0]} subtitle={titles[step][1]}>
      {step === 1 && (
        <form onSubmit={sendCode}>
          <label className="label" htmlFor="mobile">Mobile number</label>
          <input id="mobile" type="tel" className="input mb-5" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" required autoFocus />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={verify}>
          <label className="label" htmlFor="otp">6-digit code</label>
          <input id="otp" inputMode="numeric" maxLength={6} className="input mb-3 text-center font-display text-2xl tracking-[0.5em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus autoComplete="one-time-code" />
          <button className="btn-primary mb-3 w-full" disabled={busy || otp.length !== 6}>{busy ? 'Checking…' : 'Verify code'}</button>
          <div className="flex justify-between text-sm">
            <button type="button" className="font-medium text-teal-dark disabled:text-ink-500 disabled:no-underline" disabled={wait > 0 || busy} onClick={sendCode}>
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
            <button type="button" className="text-ink-500 hover:underline" onClick={() => { setStep(1); setOtp(''); }}>Change number</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={reset}>
          <div className="mb-4">
            <label className="label" htmlFor="p1">New password</label>
            <input id="p1" type="password" minLength={6} className="input" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} required autoFocus autoComplete="new-password" />
          </div>
          <div className="mb-5">
            <label className="label" htmlFor="p2">Confirm password</label>
            <input id="p2" type="password" minLength={6} className="input" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} required autoComplete="new-password" />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-ink-500">
        <Link to="/login" className="font-medium text-teal-dark hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
