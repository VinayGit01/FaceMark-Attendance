// Face descriptors are 128 numbers produced in the browser by face-api.js.
// The SERVER does the comparison, so the browser can never decide "this face matches".
const isDescriptor = (d) =>
  Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && Number.isFinite(n)) && d.some((n) => n !== 0);

const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const average = (list) => list[0].map((_, i) => list.reduce((s, d) => s + d[i], 0) / list.length);

// Returns the list if it is a valid set of descriptors, otherwise null.
function cleanDescriptors(list, min, max) {
  if (!Array.isArray(list) || list.length < min || list.length > max || !list.every(isDescriptor)) return null;
  return list;
}

// All samples must look like the same person (stops mixing two faces into one enrolment)
function consistent(list, maxDistance = 0.6) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (dist(list[i], list[j]) > maxDistance) return false;
  return true;
}

// Smallest distance between the averaged scan and any enrolled sample (lower = more alike)
const bestDistance = (submitted, stored) => {
  const avg = average(submitted);
  return Math.min(...stored.map((s) => dist(avg, s)));
};

const threshold = () => Number(process.env.FACE_LOGIN_THRESHOLD || 0.5);
const faceRequired = () => (process.env.FACE_LOGIN_REQUIRED || 'true') !== 'false';
const proofMinutes = () => Number(process.env.FACE_PROOF_MINUTES || 3);

module.exports = { cleanDescriptors, consistent, bestDistance, threshold, faceRequired, proofMinutes };
