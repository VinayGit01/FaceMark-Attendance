// Emergency recovery if an admin cannot pass the face check:  node resetface.js admin@school.com
// Removes the stored face and any lock; the person enrols a new face at their next sign-in (after their password).
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

(async () => {
  const email = (process.argv[2] || '').toLowerCase();
  if (!email) return console.log('Usage: node resetface.js <email>') || process.exit(1);
  await mongoose.connect(process.env.MONGO_URI);
  const u = await User.findOne({ email }).select('+faceDescriptors');
  if (!u) console.log('No user with that email.');
  else {
    u.faceDescriptors = []; u.faceEnrolled = false; u.faceFailures = 0; u.faceLockedUntil = undefined;
    await u.save();
    console.log(`Face reset for ${email}. They will enrol a new face at next sign-in.`);
  }
  await mongoose.disconnect();
})();
