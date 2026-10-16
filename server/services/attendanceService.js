const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const { dayString, hhmm, nowInfo, eachDay, dow, toMinutes } = require('../utils/time');

// Hours worked, plus how early / how much overtime relative to the official check-out time.
function checkoutStats(checkIn, checkOut, settings) {
  const workingMinutes = Math.max(0, Math.round((checkOut - checkIn) / 60000));
  const outAt = toMinutes(hhmm(checkOut, settings.timezone));
  const end = toMinutes(settings.checkOutTime || '17:00');
  return { workingMinutes, earlyMinutes: Math.max(0, end - outAt), overtimeMinutes: Math.max(0, outAt - end) };
}

// Builds a day-by-day picture for each student: stored records + approved leave + week-offs + absences.
async function buildRange(students, from, to, settings) {
  const tz = settings.timezone;
  const today = nowInfo(tz).date;
  const last = to < today ? to : today; // never mark future days as absent
  const ids = students.map((s) => s._id);

  const [records, leaves] = await Promise.all([
    Attendance.find({ student: { $in: ids }, date: { $gte: from, $lte: to } }),
    Leave.find({ student: { $in: ids }, status: 'approved', fromDate: { $lte: to }, toDate: { $gte: from } }),
  ]);

  const recMap = new Map(records.map((r) => [`${r.student}|${r.date}`, r]));
  const leaveMap = new Map();
  leaves.forEach((l) => {
    const k = String(l.student);
    if (!leaveMap.has(k)) leaveMap.set(k, []);
    leaveMap.get(k).push(l);
  });

  const dates = from <= last ? eachDay(from, last) : [];
  const out = new Map();

  for (const s of students) {
    const startDay = dayString(s.createdAt, tz);
    const myLeaves = leaveMap.get(String(s._id)) || [];

    const days = [];
    for (const d of dates) {
      const rec = recMap.get(`${s._id}|${d}`);
      if (rec) {
        days.push({
          date: d, status: rec.status,
          checkInTime: hhmm(rec.checkIn, tz), checkOutTime: hhmm(rec.checkOut, tz),
          workingMinutes: rec.workingMinutes || 0, earlyMinutes: rec.earlyMinutes || 0, overtimeMinutes: rec.overtimeMinutes || 0,
          method: rec.method, confidence: rec.confidence,
          note: rec.note, recordId: rec._id,
        });
        continue;
      }
      const leave = myLeaves.find((l) => l.fromDate <= d && l.toDate >= d);
      if (leave) { days.push({ date: d, status: 'leave', note: leave.type }); continue; }
      if (settings.weekOffDays.includes(dow(d))) { days.push({ date: d, status: 'weekoff' }); continue; }
      if (d < startDay) continue; // student did not exist yet
      days.push({ date: d, status: 'absent' });
    }
    out.set(String(s._id), days);
  }
  return out;
}

function summarize(days) {
  const s = { present: 0, late: 0, halfDay: 0, leave: 0, absent: 0, weekoff: 0, totalMinutes: 0, daysWorked: 0, earlyOut: 0, overtimeMinutes: 0 };
  for (const d of days) {
    if (d.status === 'present') s.present++;
    else if (d.status === 'late') s.late++;
    else if (d.status === 'half-day') s.halfDay++;
    else if (d.status === 'leave') s.leave++;
    else if (d.status === 'absent') s.absent++;
    else if (d.status === 'weekoff') s.weekoff++;
    if (d.workingMinutes) { s.totalMinutes += d.workingMinutes; s.daysWorked++; }
    if (d.earlyMinutes > 0) s.earlyOut++;
    s.overtimeMinutes += d.overtimeMinutes || 0;
  }
  const expected = s.present + s.late + s.halfDay + s.absent; // leave and week-offs are not counted against anyone
  s.attendancePct = expected ? Math.round(((s.present + s.late + s.halfDay * 0.5) / expected) * 100) : 0;
  s.avgMinutes = s.daysWorked ? Math.round(s.totalMinutes / s.daysWorked) : 0;
  return s;
}

module.exports = { buildRange, summarize, checkoutStats };
