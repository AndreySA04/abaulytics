import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { apiBaseUrl } from '../privacy/api';

export type Role = 'operador' | 'analista' | 'lider' | 'tecnico' | 'auditor';
export type Classification = 'conforme' | 'nao_conforme';
export type Session = { token: string; user: { badge: string; name: string; role: Role } };
export type Lot = {
  id: number; order_number: string; product: string; width_um: number;
  version: string; calibration_id: string; started_at: string;
};
export type Reading = {
  id: number; lot_id: number; sequence: number; order_number: string; product: string;
  width_um: number; version: string; calibration_id: string; observed_at: string;
  captured_at: string | null; recorded_at: string; deflection_um: number | null;
  classification: Classification | null; failure: string | null;
};
export type Dashboard = {
  lot: Lot | null; cursor: number; recent: Reading[]; latest: Reading | null;
  collector: { at: string; buffered: number } | null; sequence_gap?: number;
  counts?: { valid: number; nonconforming: number; failed: number };
  environment: 'bancada' | 'producao';
};
export type Changes = { items: Reading[]; cursor: number };
export type Order = { number: string; product: string; width_um: number };
export type Trend = { day: string; order_number: string; valid: number; nonconforming: number; failed: number };
export type Filters = {
  start?: string; end?: string; order_number?: string; product?: string;
  classification?: Classification; width_mm?: number;
};
export type ReadingPage = { items: Reading[]; next: number | null; ceiling: number };
export type AuditEvent = { id: number; action: string; role: string; at: string; detail: string | null; badge: string | null };
export type Configuration = {
  active: { version: string; calibration_id: string | null };
  versions: { version: string; method: string; registered_at: string }[];
  calibrations: { id: string; registered_at: string }[];
};

const SESSION_KEY = 'abaulytics.production.session';

export class ProductionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function loadProductionSession(): Promise<Session | null> {
  if (Platform.OS === 'web') return null;
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;
  try { return JSON.parse(value); }
  catch { await clearProductionSession(); return null; }
}

export async function saveProductionSession(session: Session) {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearProductionSession() {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SESSION_KEY);
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT'; data?: object; signal?: AbortSignal };

async function request(path: string, session?: Session, options: RequestOptions = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(cancel, 15_000);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  try {
    const response = await fetch(apiBaseUrl() + '/v1' + path, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        ...(session ? { Authorization: 'Bearer ' + session.token } : {}),
        ...(options.data ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.data ? JSON.stringify(options.data) : undefined,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ProductionError(response.status, error?.erro ?? error?.detail ?? 'Falha na API de produção.');
    }
    return response;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export async function productionApi<T>(path: string, session?: Session, options?: RequestOptions): Promise<T> {
  const response = await request(path, session, options);
  return response.status === 204 ? undefined as T : response.json();
}

export function queryString(filters: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value != null && value !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? '?' + query : '';
}

export async function shareReport(session: Session, filters: Filters, ceiling: number, format: 'pdf' | 'csv') {
  if (!await Sharing.isAvailableAsync()) throw new Error('Compartilhamento indisponível neste dispositivo.');
  const response = await request('/reports', session, { method: 'POST', data: { ...filters, ceiling, format } });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const directory = new Directory(Paths.cache, 'abaulytics-private');
  await directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, 'producao-' + Date.now() + '.' + format);
  await file.create();
  try {
    await file.write(bytes);
    await Sharing.shareAsync(file.uri, { mimeType: format === 'pdf' ? 'application/pdf' : 'text/csv' });
  } finally { await file.delete(); }
}
