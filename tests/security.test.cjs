const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abaulytics-test-'));
const filename = path.join(directory, 'abaulytics.db');
const connections = [];
const storage = new Map();
let development = true;
let printedHtml = '';
let sharingFails = false;
const deletedFiles = [];
const mocks = {
  'expo-print': { printToFileAsync: async ({ html }) => { printedHtml = html; return { uri: 'file:///cache/Print/report.pdf' }; } },
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => { if (sharingFails) throw new Error('Sharing failed'); } },
  'expo-file-system/legacy': {
    cacheDirectory: 'file:///cache/',
    makeDirectoryAsync: async () => {}, moveAsync: async () => {},
    writeAsStringAsync: async () => {}, deleteAsync: async uri => { deletedFiles.push(uri); },
  },
  'expo-crypto': { getRandomBytesAsync: async n => new Uint8Array(randomBytes(n)) },
  'expo-secure-store': {
    getItemAsync: async key => storage.get(key) ?? null,
    setItemAsync: async (key, value) => { storage.set(key, value); },
    deleteItemAsync: async key => { storage.delete(key); },
  },
  'expo-sqlite': { openDatabaseAsync: async (name, options, folder = directory) => {
    const db = new DatabaseSync(path.join(folder, name));
    connections.push(db);
    const bind = args => args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return {
      databasePath: path.join(folder, name),
      execAsync: async sql => { db.exec(sql); },
      runAsync: async (sql, ...args) => { const r = db.prepare(sql).run(...bind(args)); return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes }; },
      getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...bind(args)) ?? null,
      getAllAsync: async (sql, ...args) => db.prepare(sql).all(...bind(args)),
      closeAsync: async () => { db.close(); connections.splice(connections.indexOf(db), 1); },
    };
  } },
};
const cache = new Map();
function load(relative) {
  const file = path.resolve(relative);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = id => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    return require(id);
  };
  vm.runInNewContext('(function(require,module,exports){' + output + '\n})', { console, process, get __DEV__() { return development; }, URL, Uint8Array, setTimeout, clearTimeout })(localRequire, mod, mod.exports);
  return mod.exports;
}

test('local security and privacy integration on real SQLite', async t => {
  await t.test('device credentials are fast from first use and fail closed without their key', async () => {
    const password = load('src/security/password.ts');
    const encoded = await password.hashPassword('correct-password');
    assert(encoded.startsWith('device-hmac-sha256-v1$'));
    assert.equal(await password.verifyPassword('correct-password', encoded), true);
    assert.equal(await password.verifyPassword('wrong', encoded), false);
    const other = await password.hashPassword('correct-password');
    assert.notEqual(encoded, other);
    await password.forgetDevicePassword(encoded);
    assert.equal(await password.verifyPassword('correct-password', encoded), false);
    assert.equal(await password.verifyPassword('any', 'pbkdf2-sha256$600000$invalid'), false);
    assert.equal(await password.verifyPassword('any', 'reset-required-v1$invalid$9999999999999'), false);
    await password.forgetDevicePassword(other);
  });
  const seed = new DatabaseSync(filename);
  seed.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT, created_at TEXT);
    CREATE TABLE analyses(id INTEGER PRIMARY KEY, user_id INTEGER, result TEXT, created_at TEXT);
    INSERT INTO users VALUES(1, 'Legacy', 'legacy@example.test', 'legacy-password', '2026-01-01');
    INSERT INTO analyses VALUES(7, 1, '{"abaulamento_px":12}', '2026-01-02');
    INSERT INTO analyses VALUES(8, 999, '{}', '2026-01-02');`);
  seed.close();
  const { getDatabase } = load('src/database/database.ts');
  const accounts = load('src/database/userRepository.ts');
  const session = load('src/security/session.ts');
  const privacy = load('src/privacy/repository.ts');
  const analyses = load('src/database/analysesRepository.ts');
  const password = load('src/security/password.ts');
  let db, first, second;
  await t.test('migration preserves valid history, removes plaintext and enforces FKs', async () => {
    db = await getDatabase();
    const columns = await db.getAllAsync('PRAGMA table_info(users)');
    assert(!columns.some(c => c.name === 'password'));
    const row = await db.getFirstAsync('SELECT * FROM users WHERE id=1');
    assert(password.isDevicePassword(row.password_hash));
    assert(await password.verifyPassword('legacy-password', row.password_hash));
    assert.equal((await db.getAllAsync('SELECT * FROM analyses')).length, 1);
    assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length, 0);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 2);
    assert(!fs.readFileSync(filename).includes(Buffer.from('legacy-password')));
    assert.equal(await getDatabase(), db);
  });
  await t.test('legacy ID in SecureStore does not establish a session', async () => {
    storage.set('userId', '1');
    await assert.rejects(() => session.requireUser());
    await assert.rejects(() => analyses.getRecentAnalyses('1'));
  });
  await t.test('legacy accounts can sign in using their migrated password', async () => {
    const user = await accounts.validateUser({ email: 'legacy@example.test', password: 'legacy-password' });
    assert.equal(user.id, 1);
    await session.startSession(user);
    assert.equal((await session.requireUser()).id, 1);
    assert.equal((await db.getFirstAsync('SELECT user_id FROM analyses WHERE id=7')).user_id, 1);
  });
  await t.test('maintenance password is accepted on the normal login and revokes the previous session', async () => {
    const { execFileSync } = require('node:child_process');
    const replacement = ' senha com espaço e ç ';
    const script = "import runpy, sys; runpy.run_path('scripts/reset-password.py')['replace_password'](sys.argv[1], 1, sys.stdin.buffer.read().decode('utf-8'))";
    const output = execFileSync('python', ['-B', '-c', script, filename], { input: replacement, encoding: 'utf8' });
    assert.equal(output, '');
    assert.equal(await session.currentUser(), null);
    assert.equal(await accounts.validateUser({ email: 'legacy@example.test', password: 'legacy-password' }), null);
    const user = await accounts.validateUser({ email: 'legacy@example.test', password: replacement });
    assert.equal(user.id, 1);
    assert(password.isDevicePassword((await db.getFirstAsync('SELECT password_hash FROM users WHERE id=1')).password_hash));
    assert.equal(await session.currentUser(), null, 'upgrading the credential must not revive the old session');
    await session.startSession(user);
    assert.equal((await session.requireUser()).id, 1);
    assert.equal((await db.getFirstAsync('SELECT user_id FROM analyses WHERE id=7')).user_id, 1);
  });
  await t.test('registration uses salts and never returns password hashes', async () => {
    const accepted = { acceptedPrivacy: true, policyVersion: load('src/privacy/policy.ts').POLICY_VERSION };
    await assert.rejects(() => accounts.saveUser({ name: 'No consent', email: 'none@example.test', password: 'password-123' }));
    await assert.rejects(() => accounts.saveUser({ ...accepted, acceptedPrivacy: false, name: 'No', email: 'none@example.test', password: 'password-123' }));
    await assert.rejects(() => accounts.saveUser({ ...accepted, policyVersion: 'outdated', name: 'No', email: 'none@example.test', password: 'password-123' }));
    assert.equal(await db.getFirstAsync('SELECT id FROM users WHERE email=?', ['none@example.test']), null);
    first = await accounts.saveUser({ ...accepted, name: 'First', email: ' FIRST@example.test ', password: 'password-123' });
    second = await accounts.saveUser({ ...accepted, name: 'Second', email: 'second@example.test', password: 'password-123' });
    assert.equal(first.role, 'operador');
    assert.equal(first.email, 'first@example.test');
    assert(!('password_hash' in first));
    const rows = await db.getAllAsync('SELECT password_hash FROM users WHERE id IN (?,?)', [first.id, second.id]);
    assert.notEqual(rows[0].password_hash, rows[1].password_hash);
    assert(rows[0].password_hash.startsWith('device-hmac-sha256-v1$'));
    assert(await password.verifyPassword('password-123', rows[0].password_hash));
    assert.equal(await password.verifyPassword('wrong-password', rows[0].password_hash), false);
    await assert.rejects(() => accounts.saveUser({ ...accepted, name: 'Duplicate', email: first.email, password: 'password-123' }));
    const consent = await db.getFirstAsync('SELECT * FROM consents WHERE user_id=?', [first.id]);
    assert.equal(consent.granted, 1);
    assert.equal(consent.policy_version, accepted.policyVersion);
    assert.equal(consent.purpose, 'analysis');
    assert(consent.created_at.endsWith('Z'));
    assert(await db.getFirstAsync("SELECT e.id FROM audit_events e JOIN audit_identity i ON i.event_id=e.id WHERE i.user_id=? AND e.action='consent_granted'", [first.id]));
  });
  await t.test('new account can sign out and sign back in with the exact registration password', async () => {
    const policyVersion = load('src/privacy/policy.ts').POLICY_VERSION;
    const secret = '  Senha com ç 🔑  ';
    const created = await accounts.saveUser({ name: 'Direct sign-in', email: 'direct@example.test', password: secret, acceptedPrivacy: true, policyVersion });
    await session.startSession(created);
    await session.logout();
    assert.equal(await session.currentUser(), null);
    assert.equal(await accounts.validateUser({ email: created.email, password: secret.trim() }), null);
    const authenticated = await accounts.validateUser({ email: ' DIRECT@example.test ', password: secret });
    assert.equal(authenticated.id, created.id);
    await session.startSession(authenticated);
    assert.equal((await session.requireUser()).id, created.id);
  });
  await t.test('failed login is audited and device throttle expires', async () => {
    const previous = await db.getFirstAsync("SELECT COUNT(*) AS total FROM audit_events WHERE action='login' AND outcome='failure'");
    for (let i = 0; i < 5; i++) assert.equal(await accounts.validateUser({ email: first.email, password: 'wrong-pass' }), null);
    assert.equal(await accounts.validateUser({ email: first.email, password: 'password-123' }), null);
    assert((await db.getFirstAsync('SELECT locked_until FROM login_throttle')).locked_until > Date.now());
    const events = await db.getAllAsync("SELECT * FROM audit_events WHERE action='login' AND outcome='failure'");
    assert.equal(events.length, previous.total + 6);
    assert(!JSON.stringify(events).includes(first.email));
    await db.runAsync('UPDATE login_throttle SET locked_until=0');
    const user = await accounts.validateUser({ email: first.email, password: 'password-123' });
    assert.equal(user.id, first.id); assert(!('password_hash' in user));
    await session.startSession(user);
  });
  await t.test('ownership is enforced by every history query and profile repository', async () => {
    for (const operation of [
      () => accounts.getProfile(String(second.id)),
      () => analyses.getAnalysesByUserId(String(second.id)),
      () => analyses.getAnalysesCountToday(String(second.id)),
      () => analyses.getRecentAnalyses(String(second.id)),
      () => analyses.getCriticalAnalysesCountToday(String(second.id)),
      () => analyses.getAnalysesByDateRange(String(second.id), '2026-01-01', '2026-12-31'),
    ]) await assert.rejects(operation);
  });
  const result = JSON.stringify({ status: 'sucesso', abaulamento_mm: 3.14, abaulamento_px: 20, id_medicao: 'test' });
  await t.test('registration consent permits immediate analysis; revocation blocks and new consent resumes', async () => {
    assert.equal(await privacy.hasConsent(), true);
    await analyses.salvarNoBanco(result);
    await assert.rejects(() => analyses.salvarNoBanco('{"erro":"failure"}'));
    await privacy.setConsent(false); await assert.rejects(() => analyses.salvarNoBanco(result));
    assert.equal((await analyses.getAnalysesByUserId(String(first.id))).length, 1);
    await privacy.setConsent(true); await analyses.salvarNoBanco(result);
    const rows = await db.getAllAsync('SELECT * FROM consents WHERE user_id=?', [first.id]);
    assert.equal(rows.length, 3);
  });
  await t.test('operators cannot query audit and events cannot be modified or deleted', async () => {
    await assert.rejects(() => privacy.queryAudit('2020-01-01', '2099-12-31', '', 0));
    await assert.rejects(() => db.runAsync("UPDATE audit_events SET action='changed'"));
    await assert.rejects(() => db.runAsync('DELETE FROM audit_events'));
  });
  await t.test('correction reauthenticates and export contains only current user data', async () => {
    await assert.rejects(() => privacy.correctProfile('Changed', 'changed@example.test', 'wrong'));
    await assert.rejects(() => privacy.correctProfile('Changed', second.email, 'password-123'));
    await privacy.correctProfile('Changed', 'changed@example.test', 'password-123');
    const output = JSON.parse(await privacy.exportOwnData());
    assert.equal(output.profile.name, 'Changed');
    assert.equal(output.analyses.length, 2);
    assert(!JSON.stringify(output).includes('password_hash'));
    assert(!JSON.stringify(output).includes(second.email));
  });
  await t.test('offline role provisioning enables paginated auditor access without access to other histories', async () => {
    const { execFileSync } = require('node:child_process');
    execFileSync('python', ['scripts/provision-role.py', '--db', filename, '--user-id', String(first.id), '--role', 'auditor']);
    const events = await privacy.queryAudit('2020-01-01', '2099-12-31', 'analysis', 0);
    assert(events.length > 0); assert(events.every(e => e.action === 'analysis'));
    await assert.rejects(() => analyses.getAnalysesByUserId(String(second.id)));
    await assert.rejects(() => privacy.queryAudit('bad', 'date', '', 0));
    await assert.rejects(() => privacy.queryAudit('2026-02-30', '2026-03-01', '', 0));
    for (let i = 0; i < 55; i++) await privacy.recordOwnAction('analysis');
    assert.equal((await privacy.queryAudit('2020-01-01', '2099-12-31', 'analysis', 0)).length, 50);
    assert((await privacy.queryAudit('2020-01-01', '2099-12-31', 'analysis', 1)).length >= 5);
    const snapshot = await privacy.queryAudit('2020-01-01', '2099-12-31', '', 0);
    await privacy.recordOwnAction('analysis');
    const next = await privacy.queryAudit('2020-01-01', '2099-12-31', '', 1, snapshot[0].id);
    assert(next.every(event => !snapshot.some(previous => previous.id === event.id)));
  });
  await t.test('deletion cascades identity, history and consent; logs survive without identity', async () => {
    await assert.rejects(() => privacy.deleteOwnAccount('wrong'));
    const count = (await db.getFirstAsync('SELECT count(*) AS n FROM audit_events')).n;
    await privacy.deleteOwnAccount('password-123');
    assert.equal(await session.currentUser(), null);
    for (const table of ['analyses', 'consents', 'audit_identity']) {
      assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM ' + table + ' WHERE user_id=?', [first.id])).n, 0);
    }
    assert.equal(await db.getFirstAsync('SELECT * FROM users WHERE id=?', [first.id]), null);
    assert(await db.getFirstAsync('SELECT id FROM users WHERE id=?', [second.id]));
    assert((await db.getFirstAsync('SELECT count(*) AS n FROM audit_events')).n > count);
    assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length, 0);
  });
  await t.test('expired sessions cannot authorize operations', async () => {
    await session.startSession(second);
    storage.set('abaulytics.session.v1', JSON.stringify({ id: second.id, expires: Date.now() - 1 }));
    await assert.rejects(() => session.requireUser());
  });
  await t.test('failed transactions roll back data and audit together', async () => {
    const { transaction } = load('src/database/transaction.ts');
    const { appendAudit } = load('src/security/audit.ts');
    const count = (await db.getFirstAsync('SELECT count(*) AS n FROM audit_events')).n;
    await assert.rejects(() => transaction(db, async tx => {
      await tx.runAsync('UPDATE users SET name=? WHERE id=?', ['Must roll back', second.id]);
      await appendAudit(tx, 'profile_corrected', second);
      throw new Error('Injected failure');
    }));
    assert.equal((await db.getFirstAsync('SELECT name FROM users WHERE id=?', [second.id])).name, 'Second');
    assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM audit_events')).n, count);
  });
  await t.test('PDF preserves explicit millimeters, escapes markup and cleans temporary files', async () => {
    await session.startSession(second);
    const generate = load('src/components/GeneratePDF.tsx').default;
    const row = { id: 1, user_id: second.id, result: JSON.stringify({ abaulamento_px: 999, abaulamento_mm: 9.25, id_medicao: '<script>alert(1)</script>', status: '<img src=x>' }), created_at: '2026-11-13T10:00:00Z' };
    const contour = { ...row, id: 2, result: JSON.stringify({ abaulamento_mm: 83.63, status: 'sucesso', metodo_medicao: 'flecha_contorno_v1' }) };
    await generate([row, contour], '2026-01-01', '2026-12-31');
    assert(printedHtml.includes('9.25 mm'));
    assert(printedHtml.includes('≈ 83.63 mm (contorno)'));
    assert(printedHtml.includes('&lt;script&gt;'));
    assert(!printedHtml.includes('<img src=x>'));
    assert(!printedHtml.includes('Invalid Date'));
    assert(deletedFiles.some(uri => uri.includes('abaulytics-private/pdf-')));
    await assert.rejects(() => generate([{ ...row, user_id: first.id }], '2026-01-01', '2026-12-31'));
    const before = deletedFiles.length;
    sharingFails = true;
    await assert.rejects(() => generate([row], '2026-01-01', '2026-12-31'));
    assert.equal(deletedFiles.length, before + 1);
    sharingFails = false;
  });
  await t.test('production requires HTTPS and configured privacy contacts for new consent', async () => {
    const { analysisUrl } = load('src/privacy/api.ts');
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.2:8000';
    assert(analysisUrl().endsWith('/api/analisar-chapa'));
    development = false;
    assert.throws(analysisUrl);
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    assert(analysisUrl().startsWith('https://'));
    await assert.rejects(() => privacy.setConsent(true));
    await privacy.setConsent(false);
    process.env.EXPO_PUBLIC_API_URL = 'https://user:secret@api.example.test';
    assert.throws(analysisUrl);
    delete process.env.EXPO_PUBLIC_API_URL;
    development = true;
  });
  for (const connection of connections) connection.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith('abaulytics-test-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
