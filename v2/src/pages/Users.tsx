import { useState, useEffect, type FormEvent } from 'react';
import { useApp } from '../store/AppContext';
import { db, PATHS } from '../lib/firebase';
import type { Role } from '../types';

// Users are stored as an array at /users (separate from /appData)
interface UserRecord {
  id: string;
  username: string;
  password: string;
  role: Role;
  createdAt?: string;
}

type ModalMode =
  | { kind: 'add' }
  | { kind: 'changePassword'; user: UserRecord; index: number }
  | { kind: 'delete'; user: UserRecord; index: number };

export default function Users() {
  const { state, showToast } = useApp();
  const currentUser = state.session?.username;

  const [users, setUsers]       = useState<UserRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [modal, setModal]       = useState<ModalMode | null>(null);
  const [revealIdx, setRevealIdx] = useState<number | null>(null);

  // ── Load users on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await db.get<unknown>(PATHS.users);
        const arr: UserRecord[] = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object'
            ? Object.values(raw as Record<string, UserRecord>)
            : [];
        setUsers(arr);
      } catch {
        showToast('Could not load users', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function persistUsers(next: UserRecord[]) {
    setSaving(true);
    try {
      await db.set(PATHS.users, next);
      setUsers(next);
    } catch {
      showToast('Failed to save — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Add user ──────────────────────────────────────────────────────────────────
  async function handleAddUser(username: string, password: string, role: Role) {
    if (users.find(u => u.username === username)) {
      showToast('Username already exists', 'error');
      return;
    }
    const newUser: UserRecord = {
      id: 'u_' + Date.now(),
      username,
      password,
      role,
      createdAt: new Date().toISOString(),
    };
    setModal(null);
    showToast(`User "${username}" created`, 'success');
    await persistUsers([...users, newUser]);
  }

  // ── Change password ───────────────────────────────────────────────────────────
  async function handleChangePassword(index: number, newPassword: string) {
    const next = users.map((u, i) => i === index ? { ...u, password: newPassword } : u);
    setModal(null);
    showToast('Password updated', 'success');
    await persistUsers(next);
  }

  // ── Delete user ───────────────────────────────────────────────────────────────
  async function handleDelete(index: number) {
    const next = users.filter((_, i) => i !== index);
    setModal(null);
    showToast('User removed', 'info');
    await persistUsers(next);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">User Management</h1>
        <p className="text-white/40 animate-pulse">Loading users…</p>
      </div>
    );
  }

  const ownerCount = users.filter(u => u.role === 'owner').length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-sm text-white/40 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-yellow-300 animate-pulse">Saving…</span>}
          <button
            onClick={() => setModal({ kind: 'add' })}
            className="flex items-center gap-2 bg-[#534AB7] hover:bg-[#6259c8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <span>+</span> Add User
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        {users.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-10">No users yet. Add the first user above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-white/40">
                <th className="text-left px-5 py-3 font-normal">Username</th>
                <th className="text-left px-4 py-3 font-normal">Password</th>
                <th className="text-left px-4 py-3 font-normal">Role</th>
                <th className="text-left px-4 py-3 font-normal">Created</th>
                <th className="px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user, i) => {
                const isMe = user.username === currentUser;
                const isLastOwner = user.role === 'owner' && ownerCount <= 1;
                const canDelete = !isMe && !isLastOwner;
                const isRevealed = revealIdx === i;

                return (
                  <tr key={user.id ?? i} className="hover:bg-white/3 transition-colors">
                    {/* Username */}
                    <td className="px-5 py-3">
                      <span className="font-semibold text-white">{user.username}</span>
                      {isMe && (
                        <span className="ml-2 text-xs text-white/30">(you)</span>
                      )}
                    </td>

                    {/* Password */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white/60 tracking-widest">
                          {isRevealed ? user.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => setRevealIdx(isRevealed ? null : i)}
                          className="text-white/30 hover:text-white/70 transition-colors text-sm"
                          title={isRevealed ? 'Hide' : 'Show password'}
                        >
                          {isRevealed ? '🙈' : '👁'}
                        </button>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        user.role === 'owner'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-[#534AB7]/30 text-[#a89fff]'
                      }`}>
                        {user.role === 'owner' ? 'Owner' : 'Member'}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-xs text-white/40">
                      {user.createdAt ? user.createdAt.slice(0, 10) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setModal({ kind: 'changePassword', user, index: i })}
                          className="px-2.5 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                          title="Change password"
                        >
                          🔑 Change PW
                        </button>
                        {canDelete ? (
                          <button
                            onClick={() => setModal({ kind: 'delete', user, index: i })}
                            className="px-2.5 py-1 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 text-xs text-white/20">
                            {isMe ? 'Cannot remove self' : 'Last owner'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info box */}
      <div className="mt-4 bg-white/3 border border-white/10 rounded-xl px-5 py-4 text-xs text-white/40 space-y-1">
        <p><span className="text-white/60 font-medium">Owner</span> — full access: read, write, manage users, export data.</p>
        <p><span className="text-white/60 font-medium">Member</span> — read-only access: can view orders, designs, and inventory but cannot edit.</p>
        <p className="text-white/25 mt-2">You cannot remove your own account or the last remaining owner.</p>
      </div>

      {/* ── Modals ── */}
      {modal?.kind === 'add'            && <AddUserModal onSave={handleAddUser} onClose={() => setModal(null)} />}
      {modal?.kind === 'changePassword' && (
        <ChangePwModal
          user={modal.user}
          onSave={pw => handleChangePassword(modal.index, pw)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteModal
          user={modal.user}
          onConfirm={() => handleDelete(modal.index)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({ onSave, onClose }: { onSave: (u: string, p: string, r: Role) => void; onClose: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState<Role>('member');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Username is required.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    onSave(username.trim(), password, role);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-semibold">Add New User</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs text-white/60 mb-1">Username *</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. rahul"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1">Password * (min 4 chars)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Set a password"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-9 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-2 text-white/40 hover:text-white/80">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/60 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#534AB7] text-sm"
            >
              <option value="member">Member (read-only)</option>
              <option value="owner">Owner (full access)</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white font-medium text-sm transition-colors">Create User</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────

function ChangePwModal({ user, onSave, onClose }: { user: UserRecord; onSave: (pw: string) => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    onSave(password);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">Change Password</h2>
            <p className="text-xs text-white/50 mt-0.5">for <span className="text-[#a89fff]">{user.username}</span></p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs text-white/60 mb-1">New password * (min 4 chars)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter new password"
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-9 text-white placeholder-white/30 focus:outline-none focus:border-[#534AB7] text-sm"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-2 text-white/40 hover:text-white/80">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white font-medium text-sm transition-colors">Save Password</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteModal({ user, onConfirm, onClose }: { user: UserRecord; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-white font-semibold mb-1">Remove user?</h3>
        <p className="text-sm text-white/50 mb-5">
          This will permanently remove <span className="text-white font-medium">{user.username}</span> ({user.role === 'owner' ? 'Owner' : 'Member'}). They will no longer be able to log in.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors">Remove</button>
        </div>
      </div>
    </div>
  );
}
