import { Navigate, Outlet } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Role } from '../types';

interface Props {
  requiredRole?: Role;
}

export default function ProtectedRoute({ requiredRole }: Props) {
  const { state } = useApp();
  if (!state.session) return <Navigate to="/login" replace />;
  if (requiredRole && state.session.role !== requiredRole) return <Navigate to="/orders" replace />;
  return <Outlet />;
}
