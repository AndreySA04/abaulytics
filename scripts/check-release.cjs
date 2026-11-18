// Validate public configuration without printing its values.
if (require('node:fs').existsSync('.env')) process.loadEnvFile('.env');
const missing = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_PRIVACY_CONTROLLER', 'EXPO_PUBLIC_PRIVACY_CONTACT']
  .filter(key => !process.env[key]?.trim());
if (missing.length) {
  console.error('Configure antes da distribuição: ' + missing.join(', '));
  process.exit(1);
}
try {
  const url = new URL(process.env.EXPO_PUBLIC_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error();
} catch {
  console.error('EXPO_PUBLIC_API_URL deve ser uma URL HTTPS sem credenciais, query ou fragmento.');
  process.exit(1);
}
console.log('Configuração de distribuição válida.');
