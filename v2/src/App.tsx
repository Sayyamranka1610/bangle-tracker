import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Orders from './pages/Orders';
import Designs from './pages/Designs';
import Inventory from './pages/Inventory';
import Analytics from './pages/Analytics';
import Audit from './pages/Audit';
import Users from './pages/Users';
import Vendors from './pages/Vendors';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/orders" replace />} />
              <Route path="/orders"    element={<Orders />} />
              <Route path="/designs"   element={<Designs />} />
              <Route path="/vendors"   element={<Vendors />} />
              <Route path="/inventory" element={<Inventory />} />
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
