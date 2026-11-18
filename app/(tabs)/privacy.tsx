import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Switch, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { requireUser } from '../../src/security/session';
import { hasConsent, setConsent, correctProfile, exportOwnData, deleteOwnAccount, queryAudit, AuditEvent } from '../../src/privacy/repository';
import { clearPrivateFiles, shareOwnJson } from '../../src/privacy/files';

export default function PrivacyScreen() {
  const router = useRouter();
  const [consent, setAccepted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [auditor, setAuditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [action, setAction] = useState('');
  const [page, setPage] = useState(0);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [boundary, setBoundary] = useState<number | undefined>();
  useEffect(() => { let active = true;
    Promise.all([requireUser(), hasConsent()]).then(([user, accepted]) => {
      if (!active) return;
      setName(user.name); setEmail(user.email); setAuditor(user.role === 'auditor'); setAccepted(accepted); setReady(true);
    }).catch(() => Alert.alert('Privacidade', 'Não foi possível carregar os dados.'));
    return () => { active = false; };
  }, []);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await operation(); }
    catch (error) { Alert.alert('Privacidade', error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); }
    finally { setPassword(''); setBusy(false); }
  };
  const button = (label: string, onPress: () => void, destructive = false) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy || !ready} onPress={onPress}
      className={`rounded-xl p-4 mb-3 ${destructive ? 'bg-red-50' : 'bg-slate-100'} ${busy || !ready ? 'opacity-50' : ''}`}>
      <Text className={`font-semibold ${destructive ? 'text-red-700' : 'text-slate-800'}`}>{label}</Text>
    </TouchableOpacity>;
  const inputStyle = 'border border-slate-300 rounded-xl px-4 py-3 mb-3 text-slate-900 bg-white';
  const load = async (next: number) => {
    const rows = await queryAudit(start, end, action.trim(), next, next === 0 ? undefined : boundary);
    if (next === 0) setBoundary(rows[0]?.id ?? 0);
    setEvents(rows); setPage(next); setLoaded(true);
  };
  const remove = () => Alert.alert('Excluir conta e histórico?', 'Esta ação remove seus dados deste dispositivo. Cópias exportadas e backups externos não são apagados.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir definitivamente', style: 'destructive', onPress: () => { void run(async () => {
      await deleteOwnAccount(password); await clearPrivateFiles(); router.replace('/(auth)');
    }); } },
  ]);
  return <ScrollView className="flex-1 bg-slate-50 px-6 pt-16" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
    <Text className="text-2xl text-slate-900 font-bold mb-5">Privacidade e meus dados</Text>
    {button('Voltar à minha conta', () => router.back())}
    {button('Ler política de privacidade', () => router.push('/privacy-policy'))}
    {!ready && <ActivityIndicator />}
    <View className="bg-white rounded-2xl p-5 mb-6">
      <Text className="text-lg font-bold text-slate-900 mb-2">Autorização para análises</Text>
      <Text className="text-slate-600 mb-3">Autorizo capturar e enviar imagens das chapas à API para calcular o abaulamento e guardar os resultados no meu histórico. Li a política de privacidade. Posso revogar esta escolha a qualquer momento.</Text>
      <Switch accessibilityLabel="Consentimento para análises" value={consent} disabled={busy || !ready} onValueChange={value => {
        void run(async () => { await setConsent(value); setAccepted(value); });
      }} trackColor={{ true: '#f97316' }} />
      <Text className="text-slate-600 mt-2">{consent ? 'Autorizado. Você pode revogar acima.' : 'Não autorizado. Seus dados continuam acessíveis.'}</Text>
    </View>
    <Text className="text-lg font-bold text-slate-900 mb-3">Acessar e corrigir</Text>
    <Text className="text-slate-600 mb-3">Seu histórico está na aba Histórico. A exportação JSON inclui seu cadastro, análises, consentimentos e eventos vinculados.</Text>
    {button('Exportar meus dados (JSON)', () => { void run(async () => { await shareOwnJson(await exportOwnData()); }); })}
    <Text className="text-slate-700 mb-1">Nome</Text>
    <TextInput accessibilityLabel="Nome" editable={!busy} value={name} onChangeText={setName} maxLength={120} className={inputStyle} />
    <Text className="text-slate-700 mb-1">E-mail</Text>
    <TextInput accessibilityLabel="E-mail" editable={!busy} value={email} onChangeText={setEmail} maxLength={254} keyboardType="email-address" autoCapitalize="none" className={inputStyle} />
    <Text className="text-slate-700 mb-1">Senha atual para corrigir ou excluir</Text>
    <TextInput accessibilityLabel="Senha atual" editable={!busy} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" maxLength={128} className={inputStyle} />
    {button('Salvar correção', () => { void run(async () => { await correctProfile(name, email, password); Alert.alert('Dados atualizados'); }); })}
    {button('Excluir minha conta e histórico', remove, true)}
    {auditor && <View className="mt-6">
      <Text className="text-lg font-bold text-slate-900 mb-3">Trilha de auditoria</Text>
      <Text className="text-slate-600 mb-3">Datas em UTC (AAAA-MM-DD). Até 50 eventos por página. A identidade é removida quando a conta é excluída.</Text>
      <TextInput accessibilityLabel="Data inicial de auditoria" value={start} onChangeText={value => { setStart(value); setLoaded(false); }} placeholder="AAAA-MM-DD inicial" className={inputStyle} />
      <TextInput accessibilityLabel="Data final de auditoria" value={end} onChangeText={value => { setEnd(value); setLoaded(false); }} placeholder="AAAA-MM-DD final" className={inputStyle} />
      <TextInput accessibilityLabel="Ação de auditoria" value={action} onChangeText={value => { setAction(value); setLoaded(false); }} autoCapitalize="none" placeholder="Ação (vazio = todas; ex.: login)" className={inputStyle} />
      {button('Consultar eventos', () => { void run(() => load(0)); })}
      {loaded && <Text className="text-slate-600 mb-3">Página {page + 1} · {events.length} eventos</Text>}
      {events.map(event => <View key={event.id} className="bg-white rounded-xl p-4 mb-2">
        <Text selectable className="font-semibold text-slate-800">{event.action} · {event.outcome}</Text>
        <Text selectable className="text-slate-600">{event.created_at}{'\n'}{event.actor_role} · {event.user_id === null ? 'Sem vínculo pessoal' : 'Conta #' + event.user_id}</Text>
      </View>)}
      {loaded && !events.length && <Text className="text-slate-600 mb-3">Nenhum evento neste período.</Text>}
      {loaded && page > 0 && button('Página anterior', () => { void run(() => load(page - 1)); })}
      {loaded && events.length === 50 && button('Próxima página', () => { void run(() => load(page + 1)); })}
    </View>}
    {busy && <ActivityIndicator color="#f97316" />}
  </ScrollView>;
}
