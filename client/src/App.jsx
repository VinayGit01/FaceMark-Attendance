import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Signup from './pages/Signup.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Home from './pages/Home.jsx';
import Executive from './pages/Executive.jsx';
import People from './pages/People.jsx';
import Scanner from './pages/Scanner.jsx';
import Records from './pages/Records.jsx';
import History from './pages/History.jsx';
import Reports from './pages/Reports.jsx';
import Leaves from './pages/Leaves.jsx';
import Corrections from './pages/Corrections.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Profile from './pages/Profile.jsx';

// any: the person needs at least one of these permissions.  person: students/employees are also let in.
function Guard({ children, any, person }) {
  const { user, loading, canAny } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <div className="grid h-screen place-items-center text-ink-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if (any && !(canAny(...any) || (person && user.person))) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/" element={<Home />} />
        <Route path="/overview" element={<Guard any={['summary.view']}><Executive /></Guard>} />
        <Route path="/scan" element={<Guard any={['attendance.terminal']}><Scanner /></Guard>} />
        <Route path="/records" element={<Guard any={['attendance.view', 'attendance.edit']}><Records /></Guard>} />
        <Route path="/history" element={<Guard any={['attendance.view', 'reports.view', 'attendance.edit']}><History /></Guard>} />
        <Route path="/reports" element={<Guard any={['reports.view']}><Reports /></Guard>} />
        <Route path="/leaves" element={<Guard any={['leaves.review']} person><Leaves /></Guard>} />
        <Route path="/corrections" element={<Guard any={['corrections.review']} person><Corrections /></Guard>} />
        <Route path="/people" element={<Guard any={['people.view', 'people.manage']}><People /></Guard>} />
        <Route path="/users" element={<Guard any={['users.manage']}><Users /></Guard>} />
        <Route path="/settings" element={<Guard any={['settings.manage', 'biometric.settings']}><Settings /></Guard>} />
        <Route path="/audit" element={<Guard any={['audit.view']}><AuditLog /></Guard>} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/students" element={<Navigate to="/people" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
