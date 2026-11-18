export function apiBaseUrl() {
  const base = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!base) throw new Error('Configure EXPO_PUBLIC_API_URL para conectar à API.');
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:'))) {
    throw new Error('A API deve usar HTTPS fora do desenvolvimento.');
  }
  return base.replace(/\/+$/, '');
}

export function analysisUrl() {
  return apiBaseUrl() + '/api/analisar-chapa';
}
