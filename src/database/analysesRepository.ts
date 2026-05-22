import {getDatabase} from './database';

export async function salvarNoBanco(result: string): Promise<void> {
    const db = await getDatabase();
    const userId = 1;

    await db.runAsync(`
        INSERT INTO analyses (user_id, result)
        VALUES (?, ?)
    `, [userId, result]);
}