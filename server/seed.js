// Optional: npm run seed -> creates a demo admin (only if that email does not exist).
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Settings = require('./models/Settings');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Settings.get();
  if (!(await User.findOne({ email: 'admin@school.com' }))) {
    await User.create({ name: 'Admin', email: 'admin@school.com', mobile: '+919999999999', password: 'admin123', role: 'admin', grantedPermissions: ['biometric.enroll', 'attendance.terminal'] });
    console.log('Admin created -> admin@school.com / admin123, mobile +919999999999 (change both!)');
  } else {
    console.log('Admin already exists.');
  }
  await mongoose.disconnect();
})();
