import { transaction } from './transaction';
import * as SQLite from 'expo-sqlite';
import { hashPassword } from '../security/password';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) opening = open().catch(error => { opening = null; throw error; });
  return opening;
}
async function open() {
  const db = await SQLite.openDatabaseAsync('abaulytics.db');
  try {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) < 1) {
      await transaction(db, async tx => {
        await tx.execAsync(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
            password TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, result TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE TABLE users_secure (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
            password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operador'
              CHECK(role IN ('operador', 'auditor')), created_at TEXT NOT NULL
          );
        `);
        const users = await tx.getAllAsync<{ id: number; name: string; email: string; password: string; created_at: string }>('SELECT * FROM users');
        for (const user of users) {
          await tx.runAsync('INSERT INTO users_secure VALUES (?, ?, ?, ?, ?, ?)',
            [user.id, user.name, user.email, user.password ? await hashPassword(user.password) : 'legacy-reset-required', 'operador', user.created_at]);
        }
        await tx.execAsync(`
          CREATE TEMP TABLE analyses_backup AS SELECT * FROM analyses;
          DROP TABLE analyses;
          DROP TABLE users;
          ALTER TABLE users_secure RENAME TO users;
          CREATE TABLE analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, result TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          INSERT INTO analyses SELECT a.* FROM analyses_backup a JOIN users u ON u.id = a.user_id;
          DROP TABLE analyses_backup;
          CREATE TABLE consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            purpose TEXT NOT NULL, policy_version TEXT NOT NULL, granted INTEGER NOT NULL CHECK(granted IN (0,1)),
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, actor_role TEXT NOT NULL, action TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')), created_at TEXT NOT NULL
          );
          CREATE TABLE audit_identity (
            event_id INTEGER PRIMARY KEY REFERENCES audit_events(id),
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events
            BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
          CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events
            BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
          CREATE TABLE login_throttle (id INTEGER PRIMARY KEY CHECK(id = 1), failures INTEGER NOT NULL, locked_until INTEGER NOT NULL);
          INSERT INTO login_throttle VALUES (1, 0, 0);
          CREATE INDEX analyses_owner ON analyses(user_id, created_at);
          CREATE INDEX consents_owner ON consents(user_id, id);
          CREATE INDEX audit_date ON audit_events(created_at, id);
          PRAGMA user_version = 1;
        `);
      });
    }
    if ((version?.user_version ?? 0) < 2) {
      // Mark cleanup complete only after checkpoint/VACUUM, so interruption retries on next launch.
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA user_version = 2;');
    }
    return db;
  } catch (error) { await db.closeAsync(); throw error; }
}
