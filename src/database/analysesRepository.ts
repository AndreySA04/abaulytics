import { Analise } from '../types/analyses';
import {getDatabase} from './database';
import { requireUser } from '../security/session';
import { requireConsent } from '../privacy/repository';
import { transaction } from './transaction';
import { appendAudit } from '../security/audit';
import { POLICY_VERSION, PURPOSE } from '../privacy/policy';

export async function salvarNoBanco(result: string): Promise<void> {
    const user = await requireConsent();
    const parsed = JSON.parse(result);
    if (parsed.status !== 'sucesso' || !Number.isFinite(parsed.abaulamento_mm) || parsed.abaulamento_mm < 0 || parsed.erro) {
      throw new Error('Resultado de análise inválido.');
    }
    const db = await getDatabase();
    await transaction(db, async tx => {
      const consent = await tx.getFirstAsync<{ granted: number; policy_version: string }>(
        'SELECT granted, policy_version FROM consents WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1', [user.id, PURPOSE]);
      if (consent?.granted !== 1 || consent.policy_version !== POLICY_VERSION) throw new Error('Consentimento revogado.');
      await tx.runAsync('INSERT INTO analyses (user_id, result) VALUES (?, ?)', [user.id, result]);
      await appendAudit(tx, 'analysis', user);
    });
}

export async function getAnalysesByUserId(userId: string | null): Promise<Analise[]> {
    await requireUser(userId);
    const db = await getDatabase();
    return db.getAllAsync<Analise>("SELECT * FROM analyses WHERE user_id = ?", [userId]);
}

export async function getAnalysesCountToday(userId: string | null): Promise<number> {
    await requireUser(userId);
    const db = await getDatabase();
    
    const today = new Date().toISOString().split('T')[0];
    
    const row = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM analyses WHERE user_id = ? AND created_at LIKE ?", 
        [userId, `${today}%`]
    );
    
    return row?.count || 0;
}

export async function getRecentAnalyses(userId: string | null): Promise<Analise[]> {
    await requireUser(userId);
    const db = await getDatabase();
    
    return db.getAllAsync<Analise>(
        "SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 3", 
        [userId]
    );
}

export async function getCriticalAnalysesCountToday(userId: string | null): Promise<number> {
  await requireUser(userId);
  const db = await getDatabase();
  
  const today = new Date().toISOString().split('T')[0];
  
  const todayAnalyses = await db.getAllAsync<Analise>(
    "SELECT * FROM analyses WHERE user_id = ? AND created_at LIKE ?", 
    [userId, `${today}%`]
  );
  
  const criticalCount = todayAnalyses.filter(item => {
    try {
      const data = JSON.parse(item.result);
      const status = (data.status || '').toUpperCase().trim();
      return status === 'CRÍTICO' || status === 'CRITICO';
    } catch (error) {
      console.error("Erro ao ler JSON no getCriticalAnalysesCountToday:", error);
      return false;
    }
  }).length;
  
  return criticalCount;
}

export async function getAnalysesByDateRange(
  userId: string | null,
  startDate: string,
  endDate: string  
): Promise<Analise[]> {
  await requireUser(userId);
  const db = await getDatabase();

  return db.getAllAsync<Analise>(
    `SELECT * FROM analyses 
     WHERE user_id = ? 
     AND date(created_at) >= date(?) 
     AND date(created_at) <= date(?)
     ORDER BY created_at DESC`,
    [userId, startDate, endDate]
  );
}
