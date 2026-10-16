import { useEffect, useRef, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { detectAll, detectWithLandmarks, eyeAspectRatio, loadFaceModels } from '../lib/face';
import useCamera from '../lib/useCamera';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Camera + liveness + face samples.
 *  mode "enroll": blink, then collect `samples` descriptors (used at sign-up / first enrolment)
 *  mode "verify": blink, then collect 3 quick descriptors (used at login and admin approval)
 * Calls onDone(arrayOfDescriptors). Remount it (change `key`) to start over after a failed attempt.
 */
export default function FaceCapture({ mode = 'verify', samples = 5, onDone, busy = false }) {
  const { videoRef, ready, error, start, stop } = useCamera();
  const [phase, setPhase] = useState('loading'); // loading | blink | capture | done | failed
  const [msg, setMsg] = useState('Starting camera…');
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let alive = true;
    loadFaceModels().then(() => alive && start());
    return () => { alive = false; };
  }, [start]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    (async () => {
      // 1) Liveness: the person must blink. A still photo cannot.
      setPhase('blink');
      setProgress(0);
      const t0 = Date.now();
      let baseline = 0, seen = 0, state = 'learn', passed = false;
      while (alive && Date.now() - t0 < 15000) {
        const faces = await detectWithLandmarks(videoRef.current);
        if (faces.length !== 1) {
          setMsg(faces.length === 0 ? 'No face found. Move into the frame.' : 'Only one person in view, please.');
          baseline = 0; seen = 0; state = 'learn';
          await sleep(120);
          continue;
        }
        setMsg('Look at the camera and blink once.');
        const ear = eyeAspectRatio(faces[0].landmarks);
        if (state === 'learn') {
          baseline += ear; seen++;
          if (seen === 6) { baseline /= seen; state = baseline > 0.15 ? 'closed?' : 'learn'; if (state === 'learn') { baseline = 0; seen = 0; } }
        } else if (state === 'closed?') {
          if (ear < baseline * 0.72) state = 'reopen?';
        } else if (state === 'reopen?') {
          if (ear > baseline * 0.88) { passed = true; break; }
        }
        await sleep(90);
      }
      if (!alive) return;
      if (!passed) { setPhase('failed'); setMsg('We could not see a blink. Try again.'); return; }

      // 2) Face samples
      setPhase('capture');
      const need = mode === 'enroll' ? samples : 3;
      setMsg(mode === 'enroll' ? 'Good. Hold still, then turn your head slightly.' : 'Hold still…');
      const out = [];
      for (let tries = 0; alive && out.length < need && tries < 50; tries++) {
        const dets = await detectAll(videoRef.current);
        if (dets.length === 1) { out.push(Array.from(dets[0].descriptor)); setProgress(out.length / need); }
        else setMsg(dets.length ? 'Only one person in view, please.' : 'Face lost. Look at the camera.');
        await sleep(mode === 'enroll' ? 450 : 200);
      }
      if (!alive) return;
      if (out.length < need) { setPhase('failed'); setMsg('Could not capture a clear face. Try again.'); return; }

      stop();
      setPhase('done');
      doneRef.current(out);
    })();

    return () => { alive = false; };
  }, [ready, attempt, mode, samples, stop, videoRef]);

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        {ready && phase !== 'done' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className={`h-3/4 w-1/2 rounded-[50%] border-4 transition-colors ${phase === 'capture' ? 'border-teal' : 'border-white/70'}`} />
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/70">
            <div>
              <ScanFace className="mx-auto mb-2 opacity-60" size={36} />
              {error || 'Starting camera…'}
            </div>
          </div>
        )}
        {(phase === 'done' || busy) && ready === false && (
          <div className="absolute inset-0 grid place-items-center bg-ink/80 text-sm font-medium text-white">{busy ? 'Checking…' : 'Captured'}</div>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full bg-teal transition-all" style={{ width: `${phase === 'capture' || phase === 'done' ? Math.max(progress, phase === 'done' ? 1 : 0) * 100 : 0}%` }} />
      </div>
      <p className="mt-3 text-center text-sm font-medium" role="status" aria-live="polite">{error ? '' : msg}</p>

      {phase === 'failed' && (
        <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      )}
    </div>
  );
}
