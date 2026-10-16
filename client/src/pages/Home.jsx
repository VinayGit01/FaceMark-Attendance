import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Dashboard from './Dashboard.jsx';
import MyAttendance from './MyAttendance.jsx';
import { PageHeader } from '../components/ui.jsx';

// Each role lands on its own screen
export default function Home() {
  const { user, canAny } = useAuth();
  if (user.person) return <MyAttendance />;
  if (canAny('attendance.view', 'attendance.edit')) return <Dashboard />;
  if (canAny('summary.view')) return <Navigate to="/overview" replace />;
  if (canAny('attendance.terminal')) return <Navigate to="/scan" replace />;
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle={user.roleLabel} />
      <div className="panel max-w-lg p-6 text-sm">
        <ShieldCheck className="mb-3 text-teal" size={26} />
        <p className="font-semibold">Your account has no attendance access yet.</p>
        <p className="mt-1 text-ink-500">Ask a Super Admin to give your role the permissions you need.</p>
      </div>
    </>
  );
}
