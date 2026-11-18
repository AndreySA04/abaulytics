import * as SecureStore from 'expo-secure-store';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Cleanup of credentials created by the previous optional acceleration scheme.
export function forgetPassword(encoded: string): Promise<void> {
  return SecureStore.deleteItemAsync(`abaulytics.password.v1.${bytesToHex(sha256(encoded))}`);
}
