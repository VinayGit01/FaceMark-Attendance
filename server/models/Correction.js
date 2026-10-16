const mongoose = require('mongoose');

const correctionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['present', 'late', 'half-day'], required: true },
    checkIn: { type: String }, // HH:MM
    checkOut: { type: String },
    reason: { type: String, required: true, trim: true },
    state: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, default: '' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Correction', correctionSchema);
