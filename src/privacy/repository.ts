import { getDatabase } from '../database/database';
import { transaction } from '../database/transaction';
import { validateProfile, validateUser } from '../database/userRepository';
import { requireUser, clearSession } from '../security/session';
import { appendAudit, AuditAction } from '../security/audit';
import { POLICY_VERSION, PURPOSE, policyConfigured } from './policy';
import { forgetDevicePassword } from '../security/password';
import { forgetPassword } from '../security/passwordAccelerator';

export async function hasConsent(): Promise<boolean> {
  const user = await requireUser();
  return consentFor(user.id);
}
async function consentFor(userId: number): Promise<boolean> {
  const row = await (await getDatabase()).getFirstAsync<{ granted: number; policy_version: string }>(
    'SELECT granted, policy_version FROM consents WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1', [userId, PURPOSE]);
  return row?.granted === 1 && row.policy_version === POLICY_VERSION;
}
export async function requireConsent() {
  const user = await requireUser();
  if (!__DEV__ && !policyConfigured) throw new Error('Configure o responsável e o contato de privacidade antes de realizar análises.');
  if (!await consentFor(user.id)) throw new Error('Autorize as análises em Minha Conta > Privacidade.');
  return user;
}
export async function setConsent(granted: boolean) {
  const user = await requireUser();
  if (granted && !__DEV__ && !policyConfigured) throw new Error('O responsável e o contato de privacidade precisam ser configurados.');
  const db = await getDatabase();
  await transaction(db, async tx => {
    await tx.runAsync('INSERT INTO consents(user_id, purpose, policy_version, granted, created_at) VALUES (?, ?, ?, ?, ?)',
      [user.id, PURPOSE, POLICY_VERSION, granted ? 1 : 0, new Date().toISOString()]);
    await appendAudit(tx, granted ? 'consent_granted' : 'consent_revoked', user);
  });
}
export async function correctProfile(name: string, email: string, password: string) {
  const user = await reauthenticate(password);
  validateProfile(name, email);
  const db = await getDatabase();
  await transaction(db, async tx => {
    const duplicate = await tx.getFirstAsync('SELECT id FROM users WHERE lower(trim(email)) = ? AND id <> ?',
      [email.trim().toLowerCase(), user.id]);
    if (duplicate) throw new Error('Não foi possível usar este e-mail.');
    await tx.runAsync('UPDATE users SET name = ?, email = ? WHERE id = ?', [name.trim(), email.trim().toLowerCase(), user.id]);
    await appendAudit(tx, 'profile_corrected', user);
  });
}
export async function reauthenticate(password: string) {
  const user = await requireUser();
  const verified = await validateUser({ email: user.email, password });
  if (!verified || verified.id !== user.id) throw new Error('Senha inválida ou tentativas temporariamente bloqueadas.');
  return user;
}
export async function exportOwnData() {
  const user = await requireUser();
  const db = await getDatabase();
  let output = '';
  await transaction(db, async tx => {
    const analyses = await tx.getAllAsync('SELECT id, result, created_at FROM analyses WHERE user_id = ?', [user.id]);
    const consents = await tx.getAllAsync('SELECT purpose, policy_version, granted, created_at FROM consents WHERE user_id = ?', [user.id]);
    const events = await tx.getAllAsync('SELECT e.action, e.outcome, e.created_at FROM audit_events e JOIN audit_identity i ON i.event_id = e.id WHERE i.user_id = ?', [user.id]);
    await appendAudit(tx, 'data_exported', user);
    output = JSON.stringify({ exported_at: new Date().toISOString(), profile: user, analyses, consents, events }, null, 2);
  });
  return output;
}
export async function deleteOwnAccount(password: string) {
  const user = await reauthenticate(password);
  const db = await getDatabase();
  const credential = await db.getFirstAsync<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
  if (credential) { await forgetDevicePassword(credential.password_hash); await forgetPassword(credential.password_hash); }
  await transaction(db, async tx => {
    await appendAudit(tx, 'account_deleted', user);
    await tx.runAsync('DELETE FROM users WHERE id = ?', [user.id]);
  });
  await clearSession();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
}
export interface AuditEvent { id: number; actor_role: string; user_id: number | null; action: string; outcome: string; created_at: string; }
export async function queryAudit(start: string, end: string, action: string, page: number, maxId = Number.MAX_SAFE_INTEGER): Promise<AuditEvent[]> {
  const user = await requireUser();
  if (user.role !== 'auditor') throw new Error('Acesso restrito ao auditor.');
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(start) || !validDate(end) || start > end ||
      !Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(maxId) || maxId < 0) throw new Error('Período ou página inválidos.');
  const db = await getDatabase();
  let rows: AuditEvent[] = [];
  await transaction(db, async tx => {
    rows = await tx.getAllAsync<AuditEvent>(`SELECT e.*, i.user_id FROM audit_events e
      LEFT JOIN audit_identity i ON i.event_id = e.id
      WHERE substr(e.created_at, 1, 10) BETWEEN ? AND ? AND (? = '' OR e.action = ?) AND e.id <= ?
      ORDER BY e.id DESC LIMIT 50 OFFSET ?`, [start, end, action, action, maxId, page * 50]);
    await appendAudit(tx, 'audit_viewed', user);
  });
  return rows;
}
export async function recordOwnAction(action: Extract<AuditAction, 'analysis' | 'pdf_exported'>, outcome: 'success' | 'failure' = 'success') {
  const user = await requireUser();
  await transaction(await getDatabase(), tx => appendAudit(tx, action, user, outcome));
}
