import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ScanFace } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminFace } from '../context/AdminFaceContext.jsx';
import { Field, PageHeader } from '../components/ui.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Settings() {
  const { can } = useAuth();
  const { withProof } = useAdminFace();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { api.get('/settings').then((r) => setF(r.data.settings)); }, []);
  if (!f) return <p className="text-ink-500">Loading…</p>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleDay = (d) => setF({ ...f, weekOffDays: f.weekOffDays.includes(d) ? f.weekOffDays.filter((x) => x !== d) : [...f.weekOffDays, d] });

  const saveRules = async (e) => {
    e.preventDefault();
    setBusy('rules');
    try {
      const { lateAfter, checkOutTime, allowEarlyCheckout, halfDayBelowHours, minCheckoutGapMinutes, weekOffDays, timezone } = f;
      await api.put('/settings', { lateAfter, checkOutTime, allowEarlyCheckout, halfDayBelowHours, minCheckoutGapMinutes, weekOffDays, timezone });
      toast.success('Rules saved. They apply from the next scan.');
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(''); }
  };

  const saveBio = async (e) => {
    e.preventDefault();
    setBusy('bio');
    try {
      const res = await withProof((cfg) => api.put('/settings', { matchThreshold: Number(f.matchThreshold), selfMarking: f.selfMarking }, cfg));
      if (res) toast.success('Face recognition settings saved');
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(''); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Working hours and attendance rules, and (for people specifically authorised) face recognition settings." />

      {can('settings.manage') && (
        <form onSubmit={saveRules} className="panel mb-8 max-w-xl space-y-5 p-6">
          <h2 className="text-lg font-bold">Attendance rules</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Check-in time (late after)"><input type="time" className="input" value={f.lateAfter} onChange={set('lateAfter')} required /></Field>
            <Field label="Check-out time (end of day)"><input type="time" className="input" value={f.checkOutTime} onChange={set('checkOutTime')} required /></Field>
          </div>
          <p className="-mt-2 text-xs text-ink-500">Arriving after the check-in time is Late. Leaving before the check-out time is flagged as an early check-out, and staying past it is overtime.</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-teal" checked={!f.allowEarlyCheckout} onChange={(e) => setF({ ...f, allowEarlyCheckout: !e.target.checked })} />
            <span className="text-sm"><span className="font-medium">Block check-out before the check-out time</span><span className="block text-xs text-ink-500">When on, a scan before the end of day is not recorded.</span></span>
          </label>
          <Field label="Half-day if total time worked is under (hours)"><input type="number" min="0" max="24" step="0.5" className="input" value={f.halfDayBelowHours} onChange={set('halfDayBelowHours')} required /></Field>
          <Field label="Ignore a second scan within (minutes)"><input type="number" min="0" max="600" className="input" value={f.minCheckoutGapMinutes} onChange={set('minCheckoutGapMinutes')} required /></Field>
          <Field label="Week-off days">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button type="button" key={d} onClick={() => toggleDay(i)} aria-pressed={f.weekOffDays.includes(i)} className={`rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition ${f.weekOffDays.includes(i) ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white hover:bg-ink/5'}`}>{d}</button>
              ))}
            </div>
          </Field>
          <Field label="Timezone"><input className="input" value={f.timezone} onChange={set('timezone')} placeholder="Asia/Kolkata" required /></Field>
          <button className="btn-primary" disabled={!!busy}>{busy === 'rules' ? 'Saving…' : 'Save rules'}</button>
        </form>
      )}

      {can('biometric.settings') && (
        <form onSubmit={saveBio} className="panel max-w-xl space-y-5 p-6">
          <div>
            <h2 className="text-lg font-bold">Face recognition</h2>
            <p className="mt-1 text-xs text-ink-500">Only people with the biometric permission can see or change this. Saving asks for a face scan.</p>
          </div>
          <Field label={`Match strictness: ${Number(f.matchThreshold).toFixed(2)}`}>
            <input type="range" min="0.35" max="0.65" step="0.01" className="w-full accent-teal" value={f.matchThreshold} onChange={set('matchThreshold')} />
            <div className="flex justify-between text-xs text-ink-500"><span>Stricter (fewer false matches)</span><span>Looser (fewer misses)</span></div>
          </Field>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-teal" checked={!!f.selfMarking} onChange={(e) => setF({ ...f, selfMarking: e.target.checked })} />
            <span className="text-sm"><span className="font-medium">Let students and employees mark their own attendance</span><span className="block text-xs text-ink-500">They verify their own face on their own device. This can be done away from the premises, so most organisations keep it off and use the terminal.</span></span>
          </label>
          <button className="btn-primary" disabled={!!busy}><ScanFace size={16} /> {busy === 'bio' ? 'Saving…' : 'Save face settings'}</button>
        </form>
      )}
    </>
  );
}
