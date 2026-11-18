import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuditView, ConfigurationView } from '../src/production/Administration';
import { DashboardView } from '../src/production/DashboardView';
import { HistoryView } from '../src/production/HistoryView';
import { Button, Field, Panel } from '../src/production/ui';
import { ProductionError, Session, clearProductionSession, loadProductionSession, productionApi, saveProductionSession } from '../src/production/api';

type ViewName = 'dashboard' | 'history' | 'account';

export default function ProductionScreen() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [badge, setBadge] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<ViewName>('dashboard');

  useEffect(() => {
    let active = true;
    loadProductionSession().then(value => { if (active) setSession(value); })
      .catch(() => { if (active) setMessage('Não foi possível ler a sessão de produção.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const onError = useCallback((error: unknown) => {
    if (error instanceof ProductionError && error.status === 401) {
      void clearProductionSession().catch(() => {});
      setSession(null);
    }
    setMessage(error instanceof Error ? error.message : 'Falha na comunicação com a produção.');
  }, []);

  async function enter() {
    setBusy(true);
    setMessage('');
    try {
      const result = await productionApi<Session>('/auth/login', undefined, { method: 'POST', data: { badge: badge.trim(), password } });
      await saveProductionSession(result);
      setSession(result);
      setView('dashboard');
      setPassword('');
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  async function leave() {
    if (!session) return;
    setBusy(true);
    try {
      await productionApi('/auth/logout', session, { method: 'POST' });
    } catch (error) {
      setMessage(error instanceof ProductionError && error.status === 401 ? '' : 'A sessão foi encerrada neste aparelho. O servidor estava indisponível.');
    } finally {
      try { await clearProductionSession(); }
      catch { setMessage('Não foi possível remover a sessão armazenada neste aparelho.'); }
      setSession(null);
      setPassword('');
      setBusy(false);
    }
  }

  async function unlink() {
    if (!session) return;
    setBusy(true);
    setMessage('');
    try {
      await productionApi('/auth/remove-account', session, { method: 'POST', data: { badge: session.user.badge, password } });
      await clearProductionSession();
      setSession(null);
      setPassword('');
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  function show(next: ViewName) {
    setMessage('');
    setPassword('');
    setView(next);
  }

  const role = session?.user.role;
  const canRead = role === 'operador' || role === 'analista' || role === 'lider';
  const canExport = role === 'analista' || role === 'lider';

  return <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'bottom']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-3xl font-bold text-slate-900">Produção</Text>
        <Button title="Voltar" secondary onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)')} />
      </View>
      {!!message && <View className="gap-2 rounded-xl bg-red-50 p-3">
        <Text accessibilityRole="alert" className="text-red-800">{message}</Text>
        <Button title="Fechar aviso" secondary onPress={() => setMessage('')} />
      </View>}
      {loading ? <ActivityIndicator accessibilityLabel="Carregando a sessão" /> : !session ?
        <Panel title="Acesso por crachá">
          <Field label="Crachá" value={badge} onChangeText={setBadge} autoCapitalize="none" autoCorrect={false} maxLength={64} />
          <Field label="Senha industrial" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} />
          <Button title={busy ? 'Entrando…' : 'Entrar'} disabled={busy || !badge.trim() || !password} onPress={() => void enter()} />
          <Button title="Privacidade e tratamento de dados" secondary onPress={() => router.push('/privacy-policy')} />
        </Panel> : <>
          <Text className="text-slate-600">{session.user.name} · {session.user.role}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button title={canRead ? 'Linha' : role === 'tecnico' ? 'Configuração' : 'Auditoria'}
              secondary={view !== 'dashboard'} onPress={() => show('dashboard')} />
            {canExport && <Button title="Histórico" secondary={view !== 'history'} onPress={() => show('history')} />}
            <Button title="Conta" secondary={view !== 'account'} onPress={() => show('account')} />
            <Button title="Sair" secondary onPress={() => void leave()} disabled={busy} />
          </View>
          {view === 'dashboard' && canRead && <DashboardView session={session} onError={onError} />}
          {view === 'dashboard' && role === 'tecnico' && <ConfigurationView session={session} onError={onError} />}
          {view === 'dashboard' && role === 'auditor' && <AuditView session={session} onError={onError} />}
          {view === 'history' && canExport && <HistoryView session={session} onError={onError} />}
          {view === 'account' && <Panel title="Conta industrial">
            <Text className="text-slate-600">Crachá {session.user.badge}. A remoção da conta desvincula sua identidade e preserva os registros industriais.</Text>
            <Field label="Confirme sua senha industrial" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} />
            <Button title="Remover conta industrial" secondary disabled={busy || !password} onPress={() =>
              Alert.alert('Remover conta?', 'A remoção encerra suas sessões e desvincula seu crachá do histórico industrial.', [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Remover', style: 'destructive', onPress: () => void unlink() },
              ])} />
          </Panel>}
        </>}
    </ScrollView>
  </SafeAreaView>;
}
