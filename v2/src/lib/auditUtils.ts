import type { AuditEntry } from '../types';

// Mirrors Phase 1 audit() — prepends an entry, caps at 500.
// Pure — the caller merges the result into a single saveAppData() call so the
// whole appData envelope (orders + auditLog + vocabulary, ...) is written
// atomically, exactly like Phase 1's single fbPush() per action.
export function buildAuditLog(
  action: string,
  detail: string,
  username: string,
  currentLog: AuditEntry[],
): AuditEntry[] {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    action,
    detail,
    user: username,
  };
  return [entry, ...currentLog].slice(0, 500);
}
