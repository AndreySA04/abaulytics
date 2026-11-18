import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { hmac } from '@noble/hashes/hmac';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const scheme = 'device-hmac-sha256-v1';
const maintenanceScheme = 'pbkdf2-sha256';
const maintenanceIterations = 600_000;
export const isDevicePassword = (encoded: string) => encoded.startsWith(`${scheme}$`);
const keyName = (id: string) => `abaulytics.credential.v2.${id}`;
const digest = (key: Uint8Array, id: string, password: string) =>
  bytesToHex(hmac(sha256, key, JSON.stringify([scheme, id, password])));
function constantEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function hashPassword(password: string): Promise<string> {
  const id = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const key = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(keyName(id), bytesToHex(key));
  return [scheme, id, digest(key, id, password)].join('$');
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts[0] === maintenanceScheme) {
    const [, iterations, salt, expected] = parts;
    if (parts.length !== 4 || iterations !== String(maintenanceIterations) ||
        !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
    const derived = await pbkdf2Async(sha256, password, hexToBytes(salt), { c: maintenanceIterations, dkLen: 32 });
    return constantEqual(bytesToHex(derived), expected);
  }
  const [format, id, expected] = parts;
  if (format !== scheme) return false;
  if (parts.length !== 3 || !/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const raw = await SecureStore.getItemAsync(keyName(id));
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return false;
  return constantEqual(digest(hexToBytes(raw), id, password), expected);
}
export async function forgetDevicePassword(encoded: string): Promise<void> {
  const [format, id] = encoded.split('$');
  if (format === scheme && /^[a-f0-9]{32}$/.test(id)) await SecureStore.deleteItemAsync(keyName(id));
}
