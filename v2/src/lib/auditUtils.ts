import type { AuditEntry } from '../types';
import { db, PATHS } from './firebase';

// Mirrors Phase 1 audit() — appends to appData.auditLog, caps at 500 entries
export async function writeAudit(
  action: string,
  detail: string,
  username: string,
  currentLog: AuditEntry[],
): Promise<void> {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    action,
    detail,
    user: username,
  };
  const next = [entry, ...currentLog].slice(0, 500);
  try {
    await db.set(`${PATHS.appData}/auditLog`, next);
  } catch {
    // audit failure is non-fatal
  }
}
