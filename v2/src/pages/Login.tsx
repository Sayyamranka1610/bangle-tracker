import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';

export default function Login() {
  const { login, devLogin, showToast } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const ok = await login(username.trim(), password);
      if (ok) {
        navigate('/orders', { replace: true });
      } else {
        showToast('Wrong username or password', 'error');
      }
    } catch {
      showToast('Could not connect to database — check your internet', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f3ef] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#534AB7]">Siddhi Bangles</h1>
          <p className="text-[#1a1916]/60 mt-1 text-sm">Bangle Tracker — Phase 2</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#534AB7] hover:bg-[#6259c8] disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => { devLogin(); navigate('/orders', { replace: true }); }}
            className="w-full mt-3 text-xs text-[#1a1916]/55 hover:text-[#1a1916]/80 underline text-center"
          >
            Skip login (dev preview only — read-only)
          </button>
        )}
      </div>
    </div>
  );
}
