const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD in the organisation's timezone
    status: { type: String, enum: ['present', 'late', 'half-day'], default: 'present' },
    checkIn: { type: Date },
    checkOut: { type: Date },
    workingMinutes: { type: Number, default: 0 },
    earlyMinutes: { type: Number, default: 0 }, // left this many minutes before the official check-out time
    overtimeMinutes: { type: Number, default: 0 }, // stayed this many minutes after it
    method: { type: String, enum: ['face', 'manual'], default: 'face' },
    checkOutMethod: { type: String, enum: ['face', 'manual'] },
    confidence: { type: Number, min: 0, max: 1 },
    note: { type: String, default: '' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// "Absent" and "Leave" are not stored: they are worked out from missing records and approved leave.
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
