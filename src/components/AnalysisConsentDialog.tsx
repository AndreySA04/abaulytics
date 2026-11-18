import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { POLICY_TEXT } from '../privacy/policy';

export function AnalysisConsentDialog({ visible, onAccept, onCancel }: {
  visible: boolean; onAccept: () => Promise<void>; onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try { await onAccept(); }
    catch (error) { Alert.alert('Privacidade', error instanceof Error ? error.message : 'Não foi possível registrar o aceite.'); }
    finally { setBusy(false); }
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onCancel(); }}>
    <View className="flex-1 bg-slate-50 px-6 pt-16 pb-8">
      <Text className="text-slate-900 text-xl font-bold mb-3">Privacidade para analisar</Text>
      <Text className="text-slate-700 mb-4">Leia a política e autorize o envio das imagens das chapas e o armazenamento dos resultados para continuar. Você pode revogar em Minha Conta.</Text>
      <ScrollView className="flex-1 mb-4"><Text selectable className="text-slate-700 leading-6">{POLICY_TEXT}</Text></ScrollView>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { void accept(); }} className="bg-orange-500 rounded-xl p-4 items-center">
        {busy ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Li, aceito e quero analisar</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onCancel} className="p-4 items-center"><Text className="text-slate-700">Agora não</Text></TouchableOpacity>
    </View>
  </Modal>;
}
