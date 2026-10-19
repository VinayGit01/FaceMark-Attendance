// Face matching runs on the SERVER. Terminals send one fresh 128-number descriptor and get back
// only "who it was" — stored face templates never leave the database.
const Student = require('../models/Student');

let cache = null;

const invalidate = () => { cache = null; };

async function load() {
  if (!cache) {
    const rows = await Student.find({ faceCount: { $gt: 0 } }).select('+faceDescriptors');
    cache = rows.map((r) => ({ id: String(r._id), descs: r.faceDescriptors }));
  }
  return cache;
}

const distance = (a, b) => {
  let s = 0;
  for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
};

const validDescriptor = (d) => Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && Number.isFinite(n));

// 1:N search (terminal). Rejects ambiguous matches where two people are nearly equally close.
async function identify(descriptor, threshold) {
  const people = await load();
  let best = { id: null, distance: Infinity };
  let second = Infinity;
  for (const p of people) {
    const dmin = Math.min(...p.descs.map((d) => distance(descriptor, d)));
    if (dmin < best.distance) { second = best.distance; best = { id: p.id, distance: dmin }; }
    else if (dmin < second) second = dmin;
  }
  if (!best.id || best.distance > threshold) return { match: false };
  if (second - best.distance < 0.02) return { match: false, ambiguous: true };
  return { match: true, id: best.id, distance: best.distance };
}

// 1:1 check (self-marking): does this face belong to this specific person?
async function verify(personId, descriptor, threshold) {
  const p = (await load()).find((x) => x.id === String(personId));
  if (!p) return { match: false, noFace: true };
  const dmin = Math.min(...p.descs.map((d) => distance(descriptor, d)));
  return dmin <= threshold ? { match: true, id: p.id, distance: dmin } : { match: false };
}

const mean = (list) => list[0].map((_, i) => list.reduce((s, d) => s + d[i], 0) / list.length);

// A scan is 1 to 5 consecutive frames. Averaging them removes frame-to-frame noise, which is the biggest
// reason a real person fails to match. Frames that do not look like one face are rejected as unsteady.
function readScan(body) {
  const list = Array.isArray(body.descriptors) ? body.descriptors : body.descriptor ? [body.descriptor] : null;
  if (!list || list.length < 1 || list.length > 5 || !list.every(validDescriptor)) return { invalid: true };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (distance(list[i], list[j]) > 0.55) return { unsteady: true };
  return { descriptor: mean(list) };
}

module.exports = { identify, verify, invalidate, validDescriptor, readScan };
