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
  | { kind: 'delete'; user: UserRecord; index: number }
  | { kind: 'myPassword' };

export default function Users() {
  const { state, showToast } = useApp();
  const currentUser = state.session?.username;
  const isOwner = state.session?.role === 'owner';

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

  // ── Change my own password (requires current password) — mirrors Phase 1's
  // doMyPasswordChange(), which every non-owner is limited to.
  async function handleChangeMyPassword(current: string, next: string): Promise<string | null> {
    const me = users.find(u => u.username === currentUser);
    const correctPw = me?.password;
    if (current !== correctPw) return 'Current password is incorrect.';
    const updated = users.map(u => u.username === currentUser ? { ...u, password: next } : u);
    setModal(null);
    showToast('Password changed successfully', 'success');
    await persistUsers(updated);
    return null;
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-[#1a1916] mb-6">User Management</h1>
        <p className="text-[#1a1916]/55 animate-pulse">Loading users…</p>
      </div>
    );
  }

  // Non-owners can never see or manage other accounts (mirrors Phase 1's
  // Masters → Users tab, which shows a bare "Change my password" card to
  // anyone who isn't an owner — matching that is a real security boundary,
  // not just cosmetic parity).
  if (!isOwner) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-[#1a1916] mb-1">My Account</h1>
        <p className="text-sm text-[#1a1916]/55 mb-6">Change your login password. Contact the owner to change your username or role.</p>
        <button
          onClick={() => setModal({ kind: 'myPassword' })}
          className="flex items-center gap-2 bg-[#534AB7] hover:bg-[#6259c8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          🔑 Change my password
        </button>
        {modal?.kind === 'myPassword' && (
          <MyPasswordModal onSave={handleChangeMyPassword} onClose={() => setModal(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1916]">User Management</h1>
          <p className="text-sm text-[#1a1916]/55 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-yellow-700 animate-pulse">Saving…</span>}
          <button
            onClick={() => setModal({ kind: 'add' })}
            className="flex items-center gap-2 bg-[#534AB7] hover:bg-[#6259c8] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <span>+</span> Add User
          </button>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
        {users.length === 0 ? (
          <p className="text-[#1a1916]/40 text-sm text-center py-10">No users yet. Add the first user above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-[#1a1916]/55">
                <th className="text-left px-5 py-3 font-normal">Username</th>
                <th className="text-left px-4 py-3 font-normal">Password</th>
                <th className="text-left px-4 py-3 font-normal">Role</th>
                <th className="text-left px-4 py-3 font-normal">Created</th>
                <th className="px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.07]">
              {users.map((user, i) => {
                const isMe = user.username === currentUser;
                // Mirrors Phase 1 exactly: the delete button never appears for
                // yourself or for ANY owner account (not just "the last one") —
                // removing an owner has to happen by changing their role first.
                const canDelete = !isMe && user.role !== 'owner';
                const isRevealed = revealIdx === i;

                return (
                  <tr key={user.id ?? i} className="hover:bg-black/5 transition-colors">
                    {/* Username */}
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[#1a1916]">{user.username}</span>
                      {isMe && (
                        <span className="ml-2 text-xs text-[#1a1916]/40">(you)</span>
                      )}
                    </td>

                    {/* Password */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#1a1916]/70 tracking-widest">
                          {isRevealed ? user.password : '••••••••'}
                        </span>
                        <button
                          onClick={() => setRevealIdx(isRevealed ? null : i)}
                          className="text-[#1a1916]/40 hover:text-[#1a1916]/80 transition-colors text-sm"
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
                          ? 'bg-green-500/15 text-green-700'
                          : 'bg-[#534AB7]/30 text-[#534AB7]'
                      }`}>
                        {user.role === 'owner' ? 'Owner' : 'Member'}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-xs text-[#1a1916]/55">
                      {user.createdAt ? user.createdAt.slice(0, 10) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setModal({ kind: 'changePassword', user, index: i })}
                          className="px-2.5 py-1 text-xs rounded-lg bg-white hover:bg-black/[0.06] text-[#1a1916]/70 hover:text-[#1a1916] transition-colors"
                          title="Change password"
                        >
                          🔑 Change PW
                        </button>
                        {canDelete ? (
                          <button
                            onClick={() => setModal({ kind: 'delete', user, index: i })}
                            className="px-2.5 py-1 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-700 hover:text-red-700 transition-colors"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 text-xs text-[#1a1916]/30">
                            {isMe ? 'Cannot remove self' : 'Owners are protected'}
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
      <div className="mt-4 bg-white border border-black/10 rounded-xl px-5 py-4 text-xs text-[#1a1916]/55 space-y-1">
        <p><span className="text-[#1a1916]/70 font-medium">Owner</span> — full access: read, write, manage users, export data.</p>
        <p><span className="text-[#1a1916]/70 font-medium">Member</span> — read-only access: can view orders, designs, and inventory but cannot edit.</p>
        <p className="text-[#1a1916]/35 mt-2">You cannot remove your own account or the last remaining owner.</p>
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
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-black/10 flex items-center justify-between">
          <h2 className="text-[#1a1916] font-semibold">Add New User</h2>
          <button onClick={onClose} className="text-[#1a1916]/55 hover:text-[#1a1916] text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-xs text-red-700 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Username *</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. rahul"
              autoFocus
              className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Password * (min 4 chars)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Set a password"
                className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 pr-9 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-2 text-[#1a1916]/55 hover:text-[#1a1916]/85">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] focus:outline-none focus:border-[#534AB7] text-sm"
            >
              <option value="member">Member (read-only)</option>
              <option value="owner">Owner (full access)</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-black/10 text-[#1a1916]/70 hover:text-[#1a1916] text-sm transition-colors">Cancel</button>
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
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-black/10 flex items-center justify-between">
          <div>
            <h2 className="text-[#1a1916] font-semibold">Change Password</h2>
            <p className="text-xs text-[#1a1916]/60 mt-0.5">for <span className="text-[#534AB7]">{user.username}</span></p>
          </div>
          <button onClick={onClose} className="text-[#1a1916]/55 hover:text-[#1a1916] text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-xs text-red-700 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">New password * (min 4 chars)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter new password"
                autoFocus
                className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 pr-9 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-2 text-[#1a1916]/55 hover:text-[#1a1916]/85">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-black/10 text-[#1a1916]/70 hover:text-[#1a1916] text-sm transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-2 rounded-lg bg-[#534AB7] hover:bg-[#6259c8] text-white font-medium text-sm transition-colors">Save Password</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── My Password Modal (self-service, requires current password) ────────────
// Mirrors Phase 1's openMyPasswordModal/doMyPasswordChange exactly.

function MyPasswordModal({ onSave, onClose }: { onSave: (current: string, next: string) => Promise<string | null>; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) { setError('Please enter your current password.'); return; }
    if (!password || password.length < 4) { setError('New password must be at least 4 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    const err = await onSave(current, password);
    if (err) setError(err);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 py-4 border-b border-black/10 flex items-center justify-between">
          <h2 className="text-[#1a1916] font-semibold">Change My Password</h2>
          <button onClick={onClose} className="text-[#1a1916]/55 hover:text-[#1a1916] text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-xs text-red-700 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Current password *</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="Enter current password"
              autoFocus
              className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">New password * (min 4 chars)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 pr-9 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2.5 top-2 text-[#1a1916]/55 hover:text-[#1a1916]/85">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#1a1916]/70 mb-1">Confirm new password *</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full bg-white border border-black/10 rounded-lg px-3 py-2 text-[#1a1916] placeholder-black/35 focus:outline-none focus:border-[#534AB7] text-sm"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-black/10 text-[#1a1916]/70 hover:text-[#1a1916] text-sm transition-colors">Cancel</button>
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
      <div className="bg-white border border-black/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-[#1a1916] font-semibold mb-1">Remove user?</h3>
        <p className="text-sm text-[#1a1916]/60 mb-5">
          This will permanently remove <span className="text-[#1a1916] font-medium">{user.username}</span> ({user.role === 'owner' ? 'Owner' : 'Member'}). They will no longer be able to log in.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-black/10 text-[#1a1916]/70 hover:text-[#1a1916] text-sm transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors">Remove</button>
        </div>
      </div>
    </div>
  );
}
