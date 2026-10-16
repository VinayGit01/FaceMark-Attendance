const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    lateAfter: { type: String, default: '09:30' },
    checkOutTime: { type: String, default: '17:00' },
    allowEarlyCheckout: { type: Boolean, default: true },
    halfDayBelowHours: { type: Number, default: 4 },
    minCheckoutGapMinutes: { type: Number, default: 10 },
    weekOffDays: { type: [Number], default: [0] },
    timezone: { type: String, default: 'Asia/Kolkata' },
    // Biometric settings: only people with the biometric.settings permission can change these
    matchThreshold: { type: Number, default: 0.5 }, // lower = stricter
    selfMarking: { type: Boolean, default: false }, // let students/employees mark their own attendance after a face check
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  return (await this.findOne({ key: 'main' })) || (await this.create({ key: 'main' }));
};

module.exports = mongoose.model('Settings', settingsSchema);
