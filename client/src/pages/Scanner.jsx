import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Play, Square } from 'lucide-react';
import api, { errMsg } from '../lib/api';
import { detectAll, loadFaceModels } from '../lib/face';
import { fmtHours } from '../lib/format';
import useCamera from '../lib/useCamera';
import { PageHeader } from '../components/ui.jsx';

const SEND_EVERY_MS = 2500; // the camera sends one fresh face at most this often
const LOG_COOLDOWN_MS = 3 * 60 * 1000;

const ACTIONS = {
  'check-in': { label: 'Checked in', cls: 'bg-teal-soft text-teal-dark' },
  'check-out': { label: 'Checked out', cls: 'bg-sky-100 text-sky-800' },
  'already-checked-in': { label: 'Already checked in', cls: 'bg-ink/5 text-ink-500' },
  completed: { label: 'Day complete', cls: 'bg-ink/5 text-ink-500' },
  'on-leave': { label: 'On approved leave', cls: 'bg-indigo-100 text-indigo-700' },
  'no-checkin': { label: 'No check-in today', cls: 'bg-amber-soft text-[#8A5A0B]' },
  'too-early': { label: 'Too early to check out', cls: 'bg-amber-soft text-[#8A5A0B]' },
};

export default function Scanner() {
  const { videoRef, ready, error, start, stop } = useCamera();
  const canvasRef = useRef(null);
  const busyRef = useRef(false);
  const timerRef = useRef(null);
  const lastSend = useRef(0);
  const logSeen = useRef(new Map());
  const labelRef = useRef({ text: 'Scanning…', until: 0, color: '#E8A33D' });
  const modeRef = useRef('auto');

  const [status, setStatus] = useState('idle'); // idle | loading | running
  const [mode, setMode] = useState('auto');
  const [log, setLog] = useState([]);
  const [last, setLast] = useState(null);
  modeRef.current = mode;

  // The camera never holds anyone's stored face. It sends what it sees; the server says who it was.
  const send = useCallback(async (descriptor) => {
    lastSend.current = Date.now();
    try {
      const { data } = await api.post('/attendance/recognize', { descriptor, mode: modeRef.current });
      if (data.action === 'unknown' || data.action === 'ambiguous') {
        labelRef.current = { text: data.action === 'unknown' ? 'Not recognised' : 'Try again', until: Date.now() + 2500, color: '#E8A33D' };
        setLast({ text: data.action === 'unknown' ? 'Face not recognised' : 'Could not tell clearly. Look straight at the camera.', tone: 'warn' });
        return;
      }
      const name = data.student.name;
      labelRef.current = { text: name, until: Date.now() + 3000, color: '#0F8B8D' };
      const a = ACTIONS[data.action];
      setLast({ text: `${name} · ${a?.label || data.action}`, tone: 'ok' });
      if (data.action === 'check-in') toast.success(`${name} checked in at ${data.record.checkInTime}`);
      if (data.action === 'check-out') toast.success(`${name} checked out · ${fmtHours(data.record.workingMinutes)} worked${data.record.earlyMinutes ? ' (early)' : ''}`);
      if (data.action === 'on-leave') toast(`${name} is on approved leave today`, { icon: '🗓️' });
      if (data.action === 'too-early') toast(`${name}: check-out opens at ${data.checkOutTime}`, { icon: '⏳' });

      const key = `${data.student._id}:${data.action}`;
      if (Date.now() - (logSeen.current.get(key) || 0) > LOG_COOLDOWN_MS) {
        logSeen.current.set(key, Date.now());
        setLog((l) => [{ ...data, at: new Date(), key: crypto.randomUUID() }, ...l].slice(0, 30));
      }
    } catch (err) {
      toast.error(errMsg(err));
    }
  }, []);

  const tick = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (busyRef.current || !video || video.readyState < 2) return;
    busyRef.current = true;
    try {
      const dets = await detectAll(video);
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!dets.length) return;

      const big = dets.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a));
      const fresh = Date.now() < labelRef.current.until;
      for (const d of dets) {
        const { x, y, width, height } = d.detection.box;
        const mx = canvas.width - x - width; // video is mirrored
        const mine = d === big;
        const color = mine && fresh ? labelRef.current.color : '#ffffff';
        ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.strokeRect(mx, y, width, height);
        if (mine) {
          const text = fresh ? labelRef.current.text : 'Scanning…';
          ctx.font = '600 16px "Public Sans", sans-serif';
          ctx.fillStyle = color === '#ffffff' ? '#12263A' : color;
          ctx.fillRect(mx, y - 28, ctx.measureText(text).width + 16, 28);
          ctx.fillStyle = '#fff';
          ctx.fillText(text, mx + 8, y - 8);
        }
      }
      if (Date.now() - lastSend.current > SEND_EVERY_MS) send(Array.from(big.descriptor));
    } finally {
      busyRef.current = false;
    }
  }, [send, videoRef]);

  const begin = async () => {
    setStatus('loading');
    try {
      await loadFaceModels();
      logSeen.current = new Map();
      await start();
      setStatus('running');
    } catch (err) {
      setStatus('idle');
      toast.error(errMsg(err));
    }
  };
  const end = () => {
    clearInterval(timerRef.current);
    stop();
    canvasRef.current?.getContext('2d').clearRect(0, 0, 9999, 9999);
    setStatus('idle');
  };

  useEffect(() => {
    if (status === 'running' && ready) {
      timerRef.current = setInterval(tick, 600);
      return () => clearInterval(timerRef.current);
    }
  }, [status, ready, tick]);

  return (
    <>
      <PageHeader title="Attendance terminal" subtitle="People face the camera. The server recognises them and records check-in or check-out. Stored faces never reach this screen.">
        {status === 'running' ? (
          <button className="btn-danger" onClick={end}><Square size={16} /> Stop camera</button>
        ) : (
          <button className="btn-primary" onClick={begin} disabled={status === 'loading'}><Play size={16} /> {status === 'loading' ? 'Preparing…' : 'Start camera'}</button>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
            <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
            {status === 'running' && ['left-4 top-4 border-l-4 border-t-4', 'right-4 top-4 border-r-4 border-t-4', 'bottom-4 left-4 border-b-4 border-l-4', 'bottom-4 right-4 border-b-4 border-r-4'].map((c) => (
              <span key={c} className={`pointer-events-none absolute h-10 w-10 rounded-sm border-white/80 ${c}`} />
            ))}
            {status !== 'running' && <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/70">{error || 'Camera is off. Choose Start camera to begin.'}</div>}
            {status === 'running' && last && (
              <div className={`absolute inset-x-4 bottom-4 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${last.tone === 'ok' ? 'bg-teal text-white' : 'bg-amber text-ink'}`} role="status" aria-live="polite">{last.text}</div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="mode" className="text-sm font-medium text-ink-600">This camera is for</label>
            <select id="mode" className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="auto">Both (first scan in, next scan out)</option>
              <option value="in">Check-in only (entrance)</option>
              <option value="out">Check-out only (exit)</option>
            </select>
          </div>
        </div>

        <div className="panel self-start">
          <div className="border-b border-ink/10 px-5 py-4"><h2 className="text-lg font-bold">This session</h2></div>
          {log.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-500">Recognised people will appear here.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-ink/10 overflow-y-auto">
              {log.map((e) => {
                const a = ACTIONS[e.action] || ACTIONS.completed;
                return (
                  <li key={e.key} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{e.student.name}</p>
                      <p className="text-xs text-ink-500">
                        {e.student.rollNo} · {e.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {e.record?.status === 'late' && ' · late'}
                        {e.action === 'check-out' && ` · ${fmtHours(e.record.workingMinutes)}`}
                        {e.action === 'check-out' && e.record.earlyMinutes > 0 && ' · left early'}
                      </p>
                    </div>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.cls}`}>{a.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
