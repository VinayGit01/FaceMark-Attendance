const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/permissions');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: Object.keys(ROLES), default: 'faculty' },
    department: { type: String, trim: true }, // HOD / Faculty: the department they are limited to
    person: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }, // Student / Employee logins: their own record
    grantedPermissions: { type: [String], default: [] }, // extra permissions given by a Super Admin
    active: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'pending', 'rejected'], default: 'active' }, // self sign-ups start as pending
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
    // Face sign-in (second factor). Never returned by any API.
    faceDescriptors: { type: [[Number]], select: false, default: [] },
    faceEnrolled: { type: Boolean, default: false },
    faceFailures: { type: Number, default: 0 },
    faceLockedUntil: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
