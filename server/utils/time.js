// All attendance logic uses the organisation's timezone (Settings.timezone), not the server's or browser's.
const pad = (n) => String(n).padStart(2, '0');

function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute };
}

const dayString = (date, tz) => {
  const p = partsIn(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
const hhmm = (date, tz) => {
  if (!date) return null;
  const p = partsIn(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};
const nowInfo = (tz) => {
  const p = partsIn(new Date(), tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, minutes: p.hour * 60 + p.minute };
};
const toMinutes = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

// "2026-10-09" + "09:15" in a timezone -> real Date
function zonedToDate(dateStr, time, tz) {
  const [h, m] = time.split(':').map(Number);
  const guess = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00Z`);
  const p = partsIn(guess, tz);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime());
const addDays = (s, n) => {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (s) => parseDay(s).getUTCDay(); // 0 = Sunday
const eachDay = (from, to) => {
  const out = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
};
const weekRange = (s) => {
  const d = dow(s);
  const from = addDays(s, d === 0 ? -6 : 1 - d); // Monday start
  return { from, to: addDays(from, 6) };
};
const monthRange = (s) => {
  const [y, m] = s.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
};
const validTimezone = (tz) => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};

module.exports = { dayString, hhmm, nowInfo, toMinutes, zonedToDate, isDay, addDays, dow, eachDay, weekRange, monthRange, validTimezone };
