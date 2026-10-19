import * as faceapi from '@vladmandic/face-api';
import { qualityHint, yawRatio } from './faceLogic';

let loading = null;

// Model weights are served from /public/models (no internet needed after install).
export function loadFaceModels() {
  if (!loading) {
    loading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.ssdMobilenetv1.loadFromUri('/models'), // slower but better in poor light, at an angle, or from far away
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ])
      .then(warmUp)
      .catch((e) => { loading = null; throw e; }); // a failed load can be retried instead of breaking until refresh
  }
  return loading;
}

// The first real scan used to freeze for seconds while the GPU compiled its programs. Do that up front.
async function warmUp() {
  try {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#888'; g.fillRect(0, 0, 160, 160);
    await faceapi.detectAllFaces(c, tinyOpts());
    await faceapi.nets.faceLandmark68Net.detectLandmarks(c);
    await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(c);
  } catch { /* best effort */ }
}

// Bigger input and a lower bar than before: finds faces that are smaller, dimmer or turned a little.
const tinyOpts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
const ssdOpts = () => new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

// Fast detector first. If it sees nothing, the stronger one gets a go (every third miss, so an empty
// room does not keep the CPU busy).
let misses = 0;
async function run(build) {
  let faces = await build(tinyOpts());
  if (!faces.length) {
    misses += 1;
    if (misses % 3 === 1) faces = await build(ssdOpts());
  } else misses = 0;
  return faces;
}

export const detectAll = (video) => run((o) => faceapi.detectAllFaces(video, o).withFaceLandmarks().withFaceDescriptors());
export const detectWithLandmarks = (video) => run((o) => faceapi.detectAllFaces(video, o).withFaceLandmarks());

const area = (f) => f.detection.box.area;

// The person in front of the camera is the biggest face. A second face of similar size means a crowd.
export function mainFace(faces) {
  if (!faces.length) return { face: null, crowded: false };
  const sorted = [...faces].sort((a, b) => area(b) - area(a));
  return { face: sorted[0], crowded: sorted.length > 1 && area(sorted[1]) > 0.5 * area(sorted[0]) };
}

export async function detectOne(video) {
  const { face } = mainFace(await detectAll(video));
  return face || undefined;
}

// Eye Aspect Ratio: drops sharply when the eye closes
export function eyeAspectRatio(landmarks) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ear = (p) => (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
  return (ear(landmarks.getLeftEye()) + ear(landmarks.getRightEye())) / 2;
}

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function meanLuma(video, sx, sy, sw, sh) {
  scratch.width = 24; scratch.height = 24;
  const g = scratch.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, sx, sy, sw, sh, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (d.length / 4);
}

// Is this a good frame to recognise from? Returns { ok, hint, yaw, ... } so screens can coach the person.
export function frameQuality(video, det) {
  const vw = video.videoWidth, vh = video.videoHeight, b = det.detection.box;
  const x = Math.max(0, b.x), y = Math.max(0, b.y);
  const faceLuma = meanLuma(video, x, y, Math.max(1, Math.min(b.width, vw - x)), Math.max(1, Math.min(b.height, vh - y)));
  const frameLuma = meanLuma(video, 0, 0, vw, vh);
  const info = { widthRatio: b.width / vw, cx: (b.x + b.width / 2) / vw, cy: (b.y + b.height / 2) / vh, faceLuma, frameLuma, score: det.detection.score };
  const hint = qualityHint(info);
  return { ok: !hint, hint, yaw: yawRatio(det.landmarks.positions), ...info };
}

export { faceapi };
