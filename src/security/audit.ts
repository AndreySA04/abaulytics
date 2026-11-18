import type { SQLiteDatabase } from 'expo-sqlite';
export type AuditAction = 'register' | 'login' | 'logout' | 'consent_granted' | 'consent_revoked' |
  'profile_corrected' | 'analysis' | 'data_exported' | 'pdf_exported' | 'account_deleted' | 'role_changed' | 'audit_viewed' | 'password_reset';

// Use the operation's transaction. Never accept free-form personal data in the payload.
export async function appendAudit(db: SQLiteDatabase, action: AuditAction, user: { id: number; role: string } | null,
  outcome: 'success' | 'failure' = 'success') {
  const event = await db.runAsync(
    'INSERT INTO audit_events(actor_role, action, outcome, created_at) VALUES (?, ?, ?, ?)',
    [user?.role ?? 'anonymous', action, outcome, new Date().toISOString()]);
  if (user) await db.runAsync('INSERT INTO audit_identity(event_id, user_id) VALUES (?, ?)', [event.lastInsertRowId, user.id]);
}
