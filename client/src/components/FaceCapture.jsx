import { useEffect, useRef, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { detectAll, detectWithLandmarks, eyeAspectRatio, frameQuality, loadFaceModels, mainFace } from '../lib/face';
import { LivenessTracker } from '../lib/faceLogic';
import useCamera from '../lib/useCamera';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const ENROLL_PROMPTS = [
  'Look straight at the camera.',
  'Turn your head a little to one side.',
  'Now turn a little to the other side.',
  'Lift your chin slightly.',
  'Lower your chin slightly.',
  'Look straight again.',
  'One more, straight on.',
  'Last one. Hold still.',
];

/**
 * Camera + liveness + face samples.
 *  mode "enroll": liveness, then `samples` descriptors in different head positions (more robust later)
 *  mode "verify": liveness, then 3 quick descriptors (login, admin approval)
 * Liveness passes with a blink OR a slow head turn. The screen coaches the person (light, distance, centring).
 * Calls onDone(arrayOfDescriptors). Remount it (change `key`) to start over after a failed attempt.
 */
export default function FaceCapture({ mode = 'verify', samples = 6, onDone, busy = false }) {
  const { videoRef, ready, error, start, stop } = useCamera();
  const [phase, setPhase] = useState('loading'); // loading | liveness | capture | done | failed
  const [msg, setMsg] = useState('Starting camera…');
  const [good, setGood] = useState(false);
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let alive = true;
    setMsg('Loading face recognition…');
    loadFaceModels().then(() => alive && start()).catch(() => alive && setMsg('Could not load face recognition. Refresh the page and try again.'));
    return () => { alive = false; };
  }, [start]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    (async () => {
      // 1) Liveness: blink once or slowly turn the head. Takes as long as the person needs, up to 30 s.
      setPhase('liveness');
      const tracker = new LivenessTracker();
      const t0 = performance.now();
      let lastSeen = t0, passed = false;
      while (alive && performance.now() - t0 < 30000) {
        const { face, crowded } = mainFace(await detectWithLandmarks(videoRef.current));
        const now = performance.now();
        if (!face) {
          setGood(false);
          setMsg('No face found. Move into the frame and face the camera.');
          if (now - lastSeen > 1200) tracker.reset();
          await nextFrame();
          continue;
        }
        lastSeen = now;
        if (crowded) { setGood(false); setMsg('Only one person in view, please.'); await nextFrame(); continue; }
        const q = frameQuality(videoRef.current, face);
        setGood(q.ok);
        setMsg(q.hint || 'Blink once, or slowly turn your head side to side.');
        if (tracker.update({ ear: eyeAspectRatio(face.landmarks), yaw: q.yaw, t: now }).passed) { passed = true; break; }
        await nextFrame();
      }
      if (!alive) return;
      if (!passed) { setPhase('failed'); setMsg('We could not confirm a live face. Check the light and try again.'); return; }

      // 2) Samples: only sharp, well-lit, centred frames count
      setPhase('capture');
      const need = mode === 'enroll' ? samples : 3;
      const gap = mode === 'enroll' ? 1000 : 220;
      const out = [];
      let lastAt = 0, prevYaw = null;
      const t1 = performance.now();
      while (alive && out.length < need && performance.now() - t1 < 60000) {
        const { face, crowded } = mainFace(await detectAll(videoRef.current));
        if (!face) { setGood(false); setMsg('Face lost. Look at the camera.'); await nextFrame(); continue; }
        if (crowded) { setGood(false); setMsg('Only one person in view, please.'); await nextFrame(); continue; }
        const q = frameQuality(videoRef.current, face);
        setGood(q.ok);
        if (!q.ok) { setMsg(q.hint); await nextFrame(); continue; }
        setMsg(mode === 'enroll' ? ENROLL_PROMPTS[Math.min(out.length, ENROLL_PROMPTS.length - 1)] : 'Hold still…');

        const now = performance.now();
        // samples 2 and 3 should really be turned; give up waiting after 4 s so nobody gets stuck
        const turned = mode !== 'enroll' || out.length < 1 || out.length > 2 || prevYaw === null || Math.abs(q.yaw - prevYaw) > 0.05 || now - lastAt > 4000;
        if (now - lastAt >= gap && turned) {
          out.push(Array.from(face.descriptor));
          prevYaw = q.yaw;
          lastAt = now;
          setProgress(out.length / need);
        }
        await nextFrame();
      }
      if (!alive) return;
      if (out.length < need) { setPhase('failed'); setMsg('Could not get a clear face. Check the light and try again.'); return; }

      stop();
      setPhase('done');
      doneRef.current(out);
    })();

    return () => { alive = false; };
  }, [ready, attempt, mode, samples, stop, videoRef]);

  const active = ready && phase !== 'done';
  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        {active && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className={`h-3/4 w-1/2 rounded-[50%] border-4 transition-colors ${good ? 'border-teal' : 'border-amber'}`} />
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/70">
            <div><ScanFace className="mx-auto mb-2 opacity-60" size={36} />{error || msg}</div>
          </div>
        )}
        {(phase === 'done' || busy) && !ready && (
          <div className="absolute inset-0 grid place-items-center bg-ink/80 text-sm font-medium text-white">{busy ? 'Checking…' : 'Captured'}</div>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full bg-teal transition-all" style={{ width: `${phase === 'capture' || phase === 'done' ? Math.max(progress, phase === 'done' ? 1 : 0) * 100 : 0}%` }} />
      </div>
      <p className={`mt-3 text-center text-sm font-medium ${active && !good ? 'text-[#8A5A0B]' : ''}`} role="status" aria-live="polite">{error ? '' : msg}</p>
      {active && <p className="mt-1 text-center text-xs text-ink-500">{phase === 'liveness' ? 'Step 1 of 2: quick check that you are really there' : 'Step 2 of 2: capturing your face'}</p>}

      {phase === 'failed' && (
        <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
      )}
    </div>
  );
}
