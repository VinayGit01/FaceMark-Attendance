/* ------------------------------------------------------------------
   Role-based access control.
   - A role gives a default set of permissions.
   - A Super Admin can grant extra permissions to a single user (never revoke below role defaults).
   - Data permissions are "scoped": <capability>.<scope>
        all       everyone (employees and students)
        employee  employees only            (company side)
        student   students only             (college side)
        dept      students in the user's own department
   - Face data (biometric.*) is never part of any role by default.
------------------------------------------------------------------- */
const CAPS = {
  'attendance.view': 'View attendance records',
  'attendance.edit': 'Correct attendance / handle exceptions',
  'reports.view': 'Generate attendance reports',
  'summary.view': 'View aggregate summaries (totals only, no individual records)',
  'people.view': 'View profiles',
  'people.manage': 'Create, edit and remove profiles',
  'corrections.review': 'Review attendance correction requests',
  'leaves.review': 'Handle leave requests',
};

const SCOPES = {
  all: 'Everyone',
  employee: 'Employees',
  student: 'Students',
  dept: 'Students in own department',
};

const SINGLES = {
  'users.manage': { label: 'Create accounts, assign roles and permissions', group: 'System' },
  'settings.manage': { label: 'Change attendance rules and working hours', group: 'System' },
  'audit.view': { label: 'View the audit log', group: 'System' },
  'attendance.terminal': { label: 'Run the face attendance terminal', group: 'Attendance' },
  'biometric.enroll': { label: 'Capture or replace face samples', group: 'Biometric', sensitive: true },
  'biometric.settings': { label: 'Change face recognition settings', group: 'Biometric', sensitive: true },
};

const scoped = (caps, scope) => caps.map((c) => `${c}.${scope}`);
const ALL_CAPS = Object.keys(CAPS);

const ROLES = {
  admin: { label: 'Super Admin', portal: 'staff', staff: true, side: 'system' },
  ceo: { label: 'CEO / Director', portal: 'staff', staff: true, side: 'company' },
  hr_manager: { label: 'HR Manager', portal: 'staff', staff: true, side: 'company' },
  hod: { label: 'Head of Department', portal: 'staff', staff: true, side: 'college', needsDepartment: true },
  faculty: { label: 'Faculty', portal: 'staff', staff: true, side: 'college', needsDepartment: true },
  terminal: { label: 'Attendance terminal (device)', portal: 'staff', staff: true, side: 'system' },
  employee: { label: 'Employee', portal: 'member', staff: false, side: 'company', personKind: 'employee' },
  student: { label: 'Student', portal: 'member', staff: false, side: 'college', personKind: 'student' },
};

const ROLE_DEFAULTS = {
  admin: ['users.manage', 'settings.manage', 'audit.view', ...scoped(ALL_CAPS, 'all')],
  ceo: ['summary.view.employee'],
  hr_manager: scoped(['attendance.view', 'attendance.edit', 'reports.view', 'people.view', 'people.manage', 'corrections.review', 'leaves.review'], 'employee'),
  hod: scoped(['attendance.view', 'attendance.edit', 'reports.view', 'people.view', 'people.manage', 'corrections.review', 'leaves.review'], 'dept'),
  faculty: scoped(['attendance.view', 'reports.view', 'people.view', 'corrections.review'], 'dept'),
  terminal: ['attendance.terminal'],
  employee: [],
  student: [],
};

const VALID = new Set([...Object.keys(SINGLES), ...ALL_CAPS.flatMap((c) => Object.keys(SCOPES).map((s) => `${c}.${s}`))]);

const effective = (u) => {
  const set = new Set(ROLE_DEFAULTS[u.role] || []);
  (u.grantedPermissions || []).forEach((p) => VALID.has(p) && set.add(p));
  return [...set];
};

// can(user, 'people.manage') is true for any scope; can(user, 'users.manage') for the exact permission.
const can = (u, key) => effective(u).some((p) => p === key || p.startsWith(`${key}.`));

const scopesFor = (u, caps) => {
  const out = new Set();
  for (const p of effective(u)) for (const c of [].concat(caps)) if (p.startsWith(`${c}.`)) out.add(p.slice(c.length + 1));
  return [...out];
};

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Mongo filter for the people this user may reach through the given capabilities. null = no access at all.
const personFilter = (u, caps) => {
  const sc = scopesFor(u, caps);
  if (!sc.length) return null;
  if (sc.includes('all')) return {};
  const or = [];
  if (sc.includes('employee')) or.push({ kind: 'employee' });
  if (sc.includes('student')) or.push({ kind: 'student' });
  else if (sc.includes('dept')) {
    or.push(u.department ? { kind: 'student', department: new RegExp(`^${escapeRx(u.department.trim())}$`, 'i') } : { _id: { $in: [] } });
  }
  return or.length === 1 ? or[0] : { $or: or };
};

// Same rule applied to one person object (or a draft {kind, department}).
const inScope = (u, caps, person) => {
  const sc = scopesFor(u, caps);
  if (!person) return false;
  if (sc.includes('all')) return true;
  if (sc.includes('employee') && person.kind === 'employee') return true;
  if (sc.includes('student') && person.kind === 'student') return true;
  if (sc.includes('dept') && person.kind === 'student' && u.department && String(person.department || '').trim().toLowerCase() === u.department.trim().toLowerCase()) return true;
  return false;
};

const catalog = () => ({
  singles: Object.entries(SINGLES).map(([key, v]) => ({ key, ...v })),
  caps: Object.entries(CAPS).map(([cap, label]) => ({ cap, label, scopes: Object.entries(SCOPES).map(([key, l]) => ({ key, label: l, permission: `${cap}.${key}` })) })),
  roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, { ...v, defaults: ROLE_DEFAULTS[k] }])),
});

module.exports = { ROLES, ROLE_DEFAULTS, VALID, effective, can, scopesFor, personFilter, inScope, catalog, escapeRx };
