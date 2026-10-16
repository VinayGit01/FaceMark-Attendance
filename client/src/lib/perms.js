// Plain-English names for permission keys (the server is the source of truth; this is only for display)
const CAP = {
  'attendance.view': 'View attendance', 'attendance.edit': 'Correct attendance', 'reports.view': 'Generate reports',
  'summary.view': 'View totals and trends (no individual records)', 'people.view': 'View profiles', 'people.manage': 'Create, edit and remove profiles',
  'corrections.review': 'Review correction requests', 'leaves.review': 'Handle leave requests',
};
const SCOPE = { all: 'everyone', employee: 'employees', student: 'students', dept: 'students in own department' };
const SINGLE = {
  'users.manage': 'Create accounts, assign roles and permissions', 'settings.manage': 'Change attendance rules', 'audit.view': 'View the audit log',
  'attendance.terminal': 'Run the face attendance terminal', 'biometric.enroll': 'Capture or replace face samples', 'biometric.settings': 'Change face recognition settings',
};
export const permLabel = (p) => {
  if (SINGLE[p]) return SINGLE[p];
  const i = p.lastIndexOf('.');
  const cap = p.slice(0, i), scope = p.slice(i + 1);
  return CAP[cap] ? `${CAP[cap]}: ${SCOPE[scope] || scope}` : p;
};
