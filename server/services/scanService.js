const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Leave = require('../models/Leave');
const Settings = require('../models/Settings');
const { checkoutStats } = require('./attendanceService');
const { hhmm, nowInfo, toMinutes, zonedToDate } = require('../utils/time');

/* Check-in / check-out for one person. The server clock and the organisation timezone decide everything. */
async function processScan({ personId, mode = 'auto', confidence, userId, settings }) {
  settings = settings || (await Settings.get());
  const tz = settings.timezone;
  const now = nowInfo(tz);

  const person = await Student.findById(personId);
  if (!person) return { code: 404, body: { message: 'Person not found' } };
  const brief = { _id: person._id, name: person.name, rollNo: person.rollNo };

  const leave = await Leave.findOne({ student: personId, status: 'approved', fromDate: { $lte: now.date }, toDate: { $gte: now.date } });
  if (leave) return { code: 200, body: { action: 'on-leave', student: brief } };

  const view = (r) => ({
    status: r.status, checkInTime: hhmm(r.checkIn, tz), checkOutTime: hhmm(r.checkOut, tz),
    workingMinutes: r.workingMinutes, earlyMinutes: r.earlyMinutes, overtimeMinutes: r.overtimeMinutes,
  });

  let rec = await Attendance.findOne({ student: personId, date: now.date });
  if (!rec) {
    if (mode === 'out') return { code: 200, body: { action: 'no-checkin', student: brief } };
    const status = now.minutes > toMinutes(settings.lateAfter) ? 'late' : 'present';
    rec = await Attendance.create({ student: personId, date: now.date, status, checkIn: new Date(), method: 'face', confidence, markedBy: userId });
    return { code: 201, body: { action: 'check-in', student: brief, record: view(rec) } };
  }

  if (rec.checkOut) return { code: 200, body: { action: 'completed', student: brief, record: view(rec) } };

  const minutesIn = rec.checkIn ? (Date.now() - rec.checkIn.getTime()) / 60000 : Infinity;
  if (mode === 'in' || minutesIn < settings.minCheckoutGapMinutes) {
    return { code: 200, body: { action: 'already-checked-in', student: brief, record: view(rec) } };
  }
  if (!settings.allowEarlyCheckout && now.minutes < toMinutes(settings.checkOutTime)) {
    return { code: 200, body: { action: 'too-early', student: brief, checkOutTime: settings.checkOutTime, record: view(rec) } };
  }

  rec.checkOut = new Date();
  rec.checkOutMethod = 'face';
  Object.assign(rec, checkoutStats(rec.checkIn, rec.checkOut, settings));
  if (['present', 'late'].includes(rec.status) && rec.workingMinutes < settings.halfDayBelowHours * 60) rec.status = 'half-day';
  await rec.save();
  return { code: 200, body: { action: 'check-out', student: brief, record: view(rec) } };
}

/* Manual add / correct one day's record. Used by authorised staff and when a correction request is approved. */
async function applyManual({ studentId, date, status, checkIn, checkOut, note, userId, settings }) {
  settings = settings || (await Settings.get());
  const tz = settings.timezone;

  if (status === 'absent') {
    await Attendance.deleteOne({ student: studentId, date });
    return { removed: true };
  }

  const rec = (await Attendance.findOne({ student: studentId, date })) || new Attendance({ student: studentId, date });
  rec.status = status;
  rec.method = 'manual';
  rec.markedBy = userId;
  if (note !== undefined) rec.note = note;
  if (checkIn) rec.checkIn = zonedToDate(date, checkIn, tz);
  if (checkOut) { rec.checkOut = zonedToDate(date, checkOut, tz); rec.checkOutMethod = 'manual'; }
  if (checkOut === '') rec.checkOut = undefined;

  if (rec.checkIn && rec.checkOut) {
    if (rec.checkOut <= rec.checkIn) return { error: 'Check-out must be after check-in' };
    Object.assign(rec, checkoutStats(rec.checkIn, rec.checkOut, settings));
  } else {
    rec.workingMinutes = 0; rec.earlyMinutes = 0; rec.overtimeMinutes = 0;
  }
  await rec.save();
  return { record: rec };
}

module.exports = { processScan, applyManual };
