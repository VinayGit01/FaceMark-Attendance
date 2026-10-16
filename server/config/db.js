const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');

// One-time upgrades for databases created by earlier versions. Safe to run on every start.
async function migrate() {
  await User.collection.updateMany({ role: 'teacher' }, { $set: { role: 'faculty' } });
  await Student.collection.updateMany({ kind: { $exists: false } }, { $set: { kind: 'student' } });
  // Admins from before permissions existed keep the two things they could already do, as visible grants
  await User.collection.updateMany(
    { role: 'admin', grantedPermissions: { $exists: false } },
    { $set: { grantedPermissions: ['biometric.enroll', 'attendance.terminal'] } }
  );
}

module.exports = async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    await migrate();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};
