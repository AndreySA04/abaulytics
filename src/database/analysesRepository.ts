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

export async function getAnalysesCountToday(userId: string | null): Promise<number> {
    const db = await getDatabase();
    
    const today = new Date().toISOString().split('T')[0];
    
    const row = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM analyses WHERE user_id = ? AND created_at LIKE ?", 
        [userId, `${today}%`]
    );
    
    return row?.count || 0;
}

export async function getRecentAnalyses(userId: string | null): Promise<Analise[]> {
    const db = await getDatabase();
    
    return db.getAllAsync<Analise>(
        "SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 3", 
        [userId]
    );
}

const PX_TO_MM_RATIO = 0.264583;

export async function getCriticalAnalysesCountToday(userId: string | null): Promise<number> {
    const db = await getDatabase();
    
    const today = new Date().toISOString().split('T')[0];
    
    const todayAnalyses = await db.getAllAsync<Analise>(
        "SELECT * FROM analyses WHERE user_id = ? AND created_at LIKE ?", 
        [userId, `${today}%`]
    );
    
    const criticalCount = todayAnalyses.filter(item => {
        const pxValue = parseFloat(item.resultado) || 0;
        const mm = pxValue * PX_TO_MM_RATIO;
        return mm > 5;
    }).length;
    
    return criticalCount;
}

export async function getAnalysesByDateRange(
  userId: string | null,
  startDate: string,
  endDate: string  
): Promise<Analise[]> {
  const db = await getDatabase();
  
  if (!userId) return [];

  return db.getAllAsync<Analise>(
    `SELECT * FROM analyses 
     WHERE user_id = ? 
     AND date(created_at) >= date(?) 
     AND date(created_at) <= date(?)
     ORDER BY created_at DESC`,
    [userId, startDate, endDate]
  );
}