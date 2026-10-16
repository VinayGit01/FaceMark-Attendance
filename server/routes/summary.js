// Executive overview: totals and trends only. Never lists an individual's record.
const router = require('express').Router();
const Student = require('../models/Student');
const Settings = require('../models/Settings');
const { protect, allow } = require('../middleware/auth');
const { buildRange, summarize } = require('../services/attendanceService');
const { personFilter } = require('../config/permissions');
const { nowInfo, addDays, eachDay } = require('../utils/time');
const audit = require('../services/audit');

router.use(protect, allow('summary.view'));

router.get('/org', async (req, res, next) => {
  try {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const settings = await Settings.get();
    const to = nowInfo(settings.timezone).date;
    const from = addDays(to, -(days - 1));

    const people = await Student.find(personFilter(req.user, ['summary.view'])).select('_id kind department createdAt');
    const map = await buildRange(people, from, to, settings);

    const blank = () => ({ people: 0, present: 0, late: 0, halfDay: 0, leave: 0, absent: 0, totalMinutes: 0, daysWorked: 0, earlyOut: 0 });
    const add = (a, s) => { a.people++; ['present', 'late', 'halfDay', 'leave', 'absent', 'totalMinutes', 'daysWorked', 'earlyOut'].forEach((k) => (a[k] += s[k])); };
    const pct = (a) => { const e = a.present + a.late + a.halfDay + a.absent; return e ? Math.round(((a.present + a.late + a.halfDay * 0.5) / e) * 100) : 0; };
    const finish = (a) => ({ ...a, attendancePct: pct(a), avgMinutes: a.daysWorked ? Math.round(a.totalMinutes / a.daysWorked) : 0 });

    const total = blank(); const byDept = {}; const byKind = {};
    const trend = Object.fromEntries(eachDay(from, to).map((d) => [d, { date: d, attended: 0, expected: 0 }]));
    let todayIn = 0, todayLeave = 0, todayAbsent = 0;

    for (const p of people) {
      const list = map.get(String(p._id)) || [];
      const s = summarize(list);
      add(total, s);
      const dep = p.department || 'Unassigned';
      add((byDept[`${p.kind}|${dep}`] ||= { ...blank(), kind: p.kind, department: dep }), s);
      add((byKind[p.kind] ||= blank()), s);
      for (const d of list) {
        const t = trend[d.date];
        if (!t) continue;
        if (['present', 'late', 'half-day'].includes(d.status)) { t.attended++; t.expected++; }
        else if (d.status === 'absent') t.expected++;
        if (d.date === to) { if (['present', 'late', 'half-day'].includes(d.status)) todayIn++; else if (d.status === 'leave') todayLeave++; else if (d.status === 'absent') todayAbsent++; }
      }
    }

    audit(req, 'summary.view', { meta: { days, people: people.length } });
    res.json({
      from, to, days, totals: finish(total),
      byDepartment: Object.values(byDept).map(finish).sort((a, b) => a.department.localeCompare(b.department)),
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, finish(v)])),
      trend: Object.values(trend).filter((t) => t.expected > 0),
      today: { in: todayIn, leave: todayLeave, absent: todayAbsent, people: people.length },
    });
  } catch (err) { next(err); }
});

module.exports = router;
