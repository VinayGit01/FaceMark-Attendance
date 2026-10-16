const mongoose = require('mongoose');

// A "person" whose attendance is tracked: a student (college) or an employee (company).
const studentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['student', 'employee'], default: 'student', index: true },
    name: { type: String, required: true, trim: true },
    rollNo: { type: String, required: true, unique: true, trim: true }, // roll number or employee ID
    email: { type: String, trim: true, lowercase: true },
    department: { type: String, trim: true, default: 'General' },
    className: { type: String, trim: true, default: '' }, // class / year, or designation
    // 128-number face templates. Never returned by any API: matching happens on the server.
    faceDescriptors: {
      type: [[Number]],
      validate: {
        validator: (arr) => arr.every((d) => d.length === 128),
        message: 'Each face descriptor must contain 128 values',
      },
      select: false,
    },
    faceCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
