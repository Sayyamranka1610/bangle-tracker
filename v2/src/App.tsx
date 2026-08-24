import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Dashboard from './pages/Dashboard';
import Designs from './pages/Designs';
import Analytics from './pages/Analytics';
import Audit from './pages/Audit';
import Users from './pages/Users';
import Vendors from './pages/Vendors';
import Masters from './pages/Masters';
import Assign from './pages/Assign';
import Pooling from './pages/Pooling';
import Library from './pages/Library';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/orders" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/orders"    element={<Orders />} />
              <Route path="/designs"   element={<Designs />} />
              <Route path="/vendors"   element={<Vendors />} />
              <Route path="/masters"   element={<Masters />} />
              <Route path="/assign"    element={<Assign />} />
              <Route path="/pooling"   element={<Pooling />} />
              <Route path="/library"   element={<Library />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/audit"     element={<Audit />} />
              <Route element={<ProtectedRoute requiredRole="owner" />}>
                <Route path="/users" element={<Users />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
