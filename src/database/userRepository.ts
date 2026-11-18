import { transaction } from './transaction';
import { getDatabase } from './database';
import { User, SaveUserInput, ValidateUserInput } from '../types/user';
import { hashPassword, isDevicePassword, verifyPassword } from '../security/password';
import { appendAudit } from '../security/audit';
import { requireUser } from '../security/session';
import { POLICY_VERSION, PURPOSE, policyConfigured } from '../privacy/policy';

const columns = 'id, name, email, role, created_at';
export async function getProfile(userId: string | null): Promise<User | null> { return requireUser(userId); }
export async function validateUser(input: ValidateUserInput): Promise<User | null> {
  const db = await getDatabase();
  let result: User | null = null;
  await transaction(db, async tx => {
    const throttle = await tx.getFirstAsync<{ failures: number; locked_until: number }>('SELECT * FROM login_throttle WHERE id = 1');
    if (throttle && throttle.locked_until > Date.now()) { await appendAudit(tx, 'login', null, 'failure'); return; }
    const matches = await tx.getAllAsync<User & { password_hash: string }>(
      `SELECT ${columns}, password_hash FROM users WHERE lower(trim(email)) = ?`, [input.email.trim().toLowerCase()]);
    for (const user of matches) {
      const { password_hash: credential, ...profile } = user;
      if (!await verifyPassword(input.password, credential)) continue;
      if (!isDevicePassword(credential)) {
        await tx.runAsync('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(input.password), user.id]);
      }
      result = profile;
      break;
    }
    const failures = result ? 0 : (throttle?.failures ?? 0) + 1;
    await tx.runAsync('UPDATE login_throttle SET failures = ?, locked_until = ? WHERE id = 1',
      [failures >= 5 ? 0 : failures, failures >= 5 ? Date.now() + 60_000 : 0]);
    await appendAudit(tx, 'login', result, result ? 'success' : 'failure');
  });
  return result;
}

export function validateProfile(name: string, email: string) {
  if (!name.trim() || name.trim().length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Informe nome (até 120 caracteres) e e-mail válido.');
  }
}
export async function saveUser(input: SaveUserInput): Promise<User> {
  if (input.acceptedPrivacy !== true || input.policyVersion !== POLICY_VERSION) {
    throw new Error('Leia e aceite a política de privacidade para criar sua conta.');
  }
  if (!__DEV__ && !policyConfigured) throw new Error('O responsável e o contato de privacidade precisam ser configurados.');
  validateProfile(input.name, input.email);
  if (input.password.length < 8 || input.password.length > 128) throw new Error('A senha deve conter entre 8 e 128 caracteres.');
  const db = await getDatabase();
  // Avoid running an expensive KDF for a registration we already know will fail.
  if (await db.getFirstAsync('SELECT id FROM users WHERE lower(trim(email)) = ?', [input.email.trim().toLowerCase()])) {
    throw new Error('Não foi possível cadastrar este e-mail.');
  }
  const passwordHash = await hashPassword(input.password);
  let user!: User;
  await transaction(db, async tx => {
    if (await tx.getFirstAsync('SELECT id FROM users WHERE lower(trim(email)) = ?', [input.email.trim().toLowerCase()])) {
      throw new Error('Não foi possível cadastrar este e-mail.');
    }
    const createdAt = new Date().toISOString();
    const saved = await tx.runAsync('INSERT INTO users(name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [input.name.trim(), input.email.trim().toLowerCase(), passwordHash, createdAt]);
    user = { id: saved.lastInsertRowId, name: input.name.trim(), email: input.email.trim().toLowerCase(), role: 'operador', created_at: createdAt };
    await appendAudit(tx, 'register', user);
    await tx.runAsync('INSERT INTO consents(user_id, purpose, policy_version, granted, created_at) VALUES (?, ?, ?, 1, ?)',
      [user.id, PURPOSE, POLICY_VERSION, createdAt]);
    await appendAudit(tx, 'consent_granted', user);
  });
  return user;
}
