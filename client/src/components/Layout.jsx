import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ScanFace, Users, ClipboardList, LogOut, History, BarChart3, CalendarOff, UserCog, SlidersHorizontal, KeyRound, PieChart, FileEdit, ScrollText, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Each item shows only if the person's role (plus grants) allows it. The server enforces the same rules.
const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, show: (u, c) => !u.person && c('attendance.view', 'attendance.edit') },
  { to: '/', label: 'My attendance', icon: LayoutDashboard, end: true, show: (u) => !!u.person },
  { to: '/overview', label: 'Executive overview', icon: PieChart, show: (u, c) => c('summary.view') },
  { to: '/scan', label: 'Attendance terminal', icon: ScanFace, show: (u, c) => c('attendance.terminal') },
  { to: '/records', label: 'Daily records', icon: ClipboardList, show: (u, c) => c('attendance.view', 'attendance.edit') },
  { to: '/history', label: 'History', icon: History, show: (u, c) => c('attendance.view', 'reports.view', 'attendance.edit') },
  { to: '/reports', label: 'Reports', icon: BarChart3, show: (u, c) => c('reports.view') },
  { to: '/leaves', label: 'Leave', icon: CalendarOff, show: (u, c) => !!u.person || c('leaves.review') },
  { to: '/corrections', label: 'Corrections', icon: FileEdit, show: (u, c) => !!u.person || c('corrections.review') },
  { to: '/people', label: 'People', icon: Users, show: (u, c) => c('people.view', 'people.manage') },
  { to: '/users', label: 'Accounts & access', icon: UserCog, show: (u, c) => c('users.manage') },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal, show: (u, c) => c('settings.manage', 'biometric.settings') },
  { to: '/audit', label: 'Audit log', icon: ScrollText, show: (u, c) => c('audit.view') },
];

export default function Layout() {
  const { user, logout, canAny } = useAuth();
  const navigate = useNavigate();

  const itemClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/8 hover:text-white'}`;
  const visible = links.filter((l) => l.show(user, canAny));

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink text-white md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal"><ScanFace size={20} /></div>
          <div>
            <p className="font-display text-lg font-bold leading-none">FaceMark</p>
            <p className="mt-1 text-xs text-white/55">Smart attendance</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-visible md:pb-0">
          {visible.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={label} to={to} end={end} className={itemClass}>
              <Icon size={18} /><span className="whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-white/10 p-4 md:block">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="mb-3 truncate text-xs text-white/55">{user?.roleLabel}{user?.department ? ` · ${user.department}` : ''}</p>
          <NavLink to="/profile" className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white"><UserRound size={16} /> My profile</NavLink>
          <NavLink to="/change-password" className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white"><KeyRound size={16} /> Change password</NavLink>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white" onClick={() => { const member = !!user.person; logout(); navigate(member ? '/login?portal=member' : '/login'); }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
