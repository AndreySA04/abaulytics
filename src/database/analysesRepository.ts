import { Analise } from '../types/analyses';
import {getDatabase} from './database';
import * as SecureStore from 'expo-secure-store';

export async function salvarNoBanco(result: string): Promise<void> {
    const db = await getDatabase();
    const userId: string | null = await SecureStore.getItemAsync('userId');

    await db.runAsync(`
        INSERT INTO analyses (user_id, result)
        VALUES (?, ?)
    `, [userId, result]);
}

export async function getAnalysesByUserId(userId: string | null): Promise<Analise[]> {
    const db = await getDatabase();
    return db.getAllAsync<Analise>("SELECT * FROM analyses WHERE user_id = ?", [userId]);
}
