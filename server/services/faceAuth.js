const { cleanDescriptors, bestDistance, threshold } = require('../utils/face');

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

// `user` must be loaded with .select('+faceDescriptors'). Counts failures and locks after too many.
async function verifyUserFace(user, submitted) {
  if (user.faceLockedUntil && user.faceLockedUntil > new Date()) {
    const mins = Math.ceil((user.faceLockedUntil - Date.now()) / 60000);
    return { ok: false, status: 429, message: `Too many failed face scans. Try again in ${mins} minute(s).` };
  }
  const scans = cleanDescriptors(submitted, 1, 5);
  if (!scans) return { ok: false, status: 400, message: 'The face scan was not valid. Please try again.' };

  const stored = user.faceDescriptors || [];
  if (!stored.length) return { ok: false, status: 409, code: 'FACE_NOT_ENROLLED', message: 'No face is enrolled for this account.' };

  if (bestDistance(scans, stored) <= threshold()) {
    user.faceFailures = 0;
    user.faceLockedUntil = undefined;
    await user.save();
    return { ok: true };
  }

  user.faceFailures = (user.faceFailures || 0) + 1;
  let message = `Face did not match. ${MAX_FAILS - user.faceFailures} attempt(s) left.`;
  if (user.faceFailures >= MAX_FAILS) {
    user.faceLockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
    user.faceFailures = 0;
    message = `Too many failed face scans. Locked for ${LOCK_MINUTES} minutes.`;
  }
  await user.save();
  return { ok: false, status: 401, message };
}

module.exports = { verifyUserFace };
