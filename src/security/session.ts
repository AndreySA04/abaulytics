import { transaction } from '../database/transaction';
import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../database/database';
import { User } from '../types/user';
import { appendAudit } from './audit';
import { isDevicePassword } from './password';

const SESSION_KEY = 'abaulytics.session.v1';
let revision = 0;
const listeners = new Set<() => void>();
export const subscribeSession = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const sessionRevision = () => revision;
function changed() { revision++; listeners.forEach(listener => listener()); }
export async function startSession(user: User) {
  const credential = await (await getDatabase()).getFirstAsync<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
  if (!credential || !isDevicePassword(credential.password_hash)) throw new Error('Não foi possível iniciar a sessão.');
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ id: user.id, credential: credential.password_hash, expires: Date.now() + 8 * 60 * 60 * 1000 }));
  await SecureStore.setItemAsync('userId', String(user.id));
  changed();
}
export async function currentUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!Number.isSafeInteger(session.id) || !Number.isFinite(session.expires) || session.expires <= Date.now()) return null;
    const row = await (await getDatabase()).getFirstAsync<User & { password_hash: string }>(
      'SELECT id, name, email, role, created_at, password_hash FROM users WHERE id = ?', [session.id]);
    if (!row || row.password_hash !== session.credential || !isDevicePassword(row.password_hash)) return null;
    const { password_hash: _, ...profile } = row;
    return profile;
  } catch { return null; }
}
export async function requireUser(ownerId?: string | number | null): Promise<User> {
  const user = await currentUser();
  if (!user || (ownerId !== undefined && String(user.id) !== String(ownerId))) throw new Error('Sessão inválida. Entre novamente.');
  return user;
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync('userId');
  changed();
}
export async function logout() {
  const user = await currentUser();
  if (user) {
    const db = await getDatabase();
    await transaction(db, tx => appendAudit(tx, 'logout', user));
  }
  await clearSession();
}
