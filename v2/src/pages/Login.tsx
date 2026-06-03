import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';

export default function Login() {
  const { login, showToast } = useApp();
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
    <div className="min-h-screen bg-[#0f0e1a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#a89fff]">Siddhi Bangles</h1>
          <p className="text-white/50 mt-1 text-sm">Bangle Tracker — Phase 2</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1a1750] rounded-2xl p-6 space-y-4 shadow-xl">
          <div>
            <label className="block text-xs text-white/60 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
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
      </div>
    </div>
  );
}
