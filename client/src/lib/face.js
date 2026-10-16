import * as faceapi from '@vladmandic/face-api';

let loading = null;

// Model weights are served from /public/models (no internet needed after install).
export function loadFaceModels() {
  if (!loading) {
    loading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]);
  }
  return loading;
}

export const detectorOptions = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

export const detectAll = (video) =>
  faceapi.detectAllFaces(video, detectorOptions()).withFaceLandmarks().withFaceDescriptors();

// Faces + 68 landmarks only (fast). Used for the blink check.
export const detectWithLandmarks = (video) => faceapi.detectAllFaces(video, detectorOptions()).withFaceLandmarks();

// Eye Aspect Ratio: drops sharply when the eye closes
export function eyeAspectRatio(landmarks) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ear = (p) => (d(p[1], p[5]) + d(p[2], p[4])) / (2 * d(p[0], p[3]));
  return (ear(landmarks.getLeftEye()) + ear(landmarks.getRightEye())) / 2;
}

export const detectOne = (video) =>
  faceapi.detectSingleFace(video, detectorOptions()).withFaceLandmarks().withFaceDescriptor();

// Lower distance = closer match. 0.5 is stricter than the library default (0.6).
export const MATCH_THRESHOLD = 0.5;

export function buildMatcher(students, threshold = MATCH_THRESHOLD) {
  const labeled = students
    .filter((s) => s.descriptors?.length)
    .map((s) => new faceapi.LabeledFaceDescriptors(String(s._id), s.descriptors.map((d) => new Float32Array(d))));
  return labeled.length ? new faceapi.FaceMatcher(labeled, threshold) : null;
}

export { faceapi };
