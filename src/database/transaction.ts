import * as SQLite from 'expo-sqlite';

// Expo's exclusive transaction opens another connection without copying PRAGMAs.
// Set foreign keys and secure deletion on that connection before BEGIN.
export async function transaction(db: SQLite.SQLiteDatabase, task: (tx: SQLite.SQLiteDatabase) => Promise<void>) {
  const separator = Math.max(db.databasePath.lastIndexOf('/'), db.databasePath.lastIndexOf('\\'));
  const connection = await SQLite.openDatabaseAsync(db.databasePath.slice(separator + 1),
    { useNewConnection: true }, db.databasePath.slice(0, separator));
  let began = false;
  try {
    await connection.execAsync('PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
    began = true;
    await task(connection);
    await connection.execAsync('COMMIT');
    began = false;
  } catch (error) {
    if (began) await connection.execAsync('ROLLBACK');
    throw error;
  } finally { await connection.closeAsync(); }
}
