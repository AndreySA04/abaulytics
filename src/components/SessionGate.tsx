import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { currentUser, subscribeSession, sessionRevision } from '../security/session';
export function SessionGate({ children }: { children: React.ReactNode }) {
  const revision = useSyncExternalStore(subscribeSession, sessionRevision);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const check = () => { currentUser().then(user => { if (active) setAllowed(Boolean(user)); }).catch(() => { if (active) setAllowed(false); }); };
    check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    const timer = setInterval(check, 15_000);
    return () => { active = false; subscription.remove(); clearInterval(timer); };
  }, [revision]);
  if (allowed === null) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!allowed) return <Redirect href="/(auth)" />;
  return <React.Fragment key={revision}>{children}</React.Fragment>;
}
