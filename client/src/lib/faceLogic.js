// Pure helpers (no browser or model code) so they can be tested on their own.

// How good is this frame for recognition? Returns a plain-English hint, or null if it is fine.
export function qualityHint({ widthRatio, cx, cy, faceLuma, frameLuma, score }) {
  if (faceLuma < 55) return 'Too dark. Face a light or a window.';
  if (frameLuma - faceLuma > 70 && faceLuma < 130) return 'The light is behind you. Turn to face the light.';
  if (faceLuma > 225) return 'Too bright. Move away from direct light.';
  if (widthRatio < 0.18) return 'Move closer to the camera.';
  if (widthRatio > 0.7) return 'Move back a little.';
  if (Math.abs(cx - 0.5) > 0.25 || Math.abs(cy - 0.5) > 0.28) return 'Centre your face in the frame.';
  if (score < 0.5) return 'Hold still and look straight at the camera.';
  return null;
}

// Nose position between the jaw edges: about 0.5 when facing the camera, moves as the head turns.
export function yawRatio(points) {
  const left = points[0], right = points[16], nose = points[30];
  const span = right.x - left.x;
  return span > 1 ? (nose.x - left.x) / span : NaN;
}

const percentile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/* Liveness: the person passes by blinking once OR slowly turning their head. Either is enough, so
   glasses, squinting or a slow camera do not lock anyone out. Feed it one reading per frame. */
export class LivenessTracker {
  constructor() { this.reset(); }

  reset() {
    this.ears = [];
    this.yawMin = Infinity;
    this.yawMax = -Infinity;
    this.dipAt = null;
    this.dipBase = 0;
  }

  update({ ear, yaw, t }) {
    if (Number.isFinite(yaw)) {
      this.yawMin = Math.min(this.yawMin, yaw);
      this.yawMax = Math.max(this.yawMax, yaw);
      if (this.yawMax - this.yawMin > 0.16) return { passed: true, how: 'turn' };
    }
    if (Number.isFinite(ear)) {
      this.ears.push(ear);
      if (this.ears.length > 20) this.ears.shift();
      const base = percentile(this.ears, 0.8); // the "eyes open" level, tolerant of the odd noisy frame
      if (this.ears.length >= 5 && base > 0.16) {
        if (this.dipAt === null) {
          if (ear < base * 0.8) { this.dipAt = t; this.dipBase = base; }
        } else if (ear > this.dipBase * 0.9) {
          return { passed: true, how: 'blink' }; // eyes closed, then opened again
        } else if (t - this.dipAt > 1500) {
          this.dipAt = null; // eyes stayed shut too long: not a blink, start over
        }
      }
    }
    return { passed: false };
  }
}
