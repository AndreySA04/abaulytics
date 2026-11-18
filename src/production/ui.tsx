import { ReactNode } from 'react';
import { Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { Reading } from './api';

export function Button({ title, onPress, secondary = false, disabled = false }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
    className={`rounded-xl px-4 py-3 ${secondary ? 'bg-slate-100' : 'bg-orange-700'} ${disabled ? 'opacity-50' : ''}`}>
    <Text className={`text-center font-semibold ${secondary ? 'text-slate-800' : 'text-white'}`}>{title}</Text>
  </TouchableOpacity>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View className="gap-1">
    <Text className="text-sm font-semibold text-slate-700">{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor="#64748b"
      className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
      {...props} />
  </View>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
    <Text className="text-lg font-bold text-slate-900">{title}</Text>
    {children}
  </View>;
}

export const millimeters = (value: number) => (value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const readableDate = (value: string) => new Date(value).toLocaleString('pt-BR');

const failureLabels: Record<string, string> = {
  imagem_inutilizavel: 'Imagem inutilizável',
  janela_expirada: 'Chapa fora da janela de captura',
  par_nao_sincronizado: 'Par de imagens fora de sincronia',
  camera_indisponivel: 'Câmera indisponível',
  captura_interrompida: 'Captura interrompida',
};

export function ReadingRow({ reading, details = false }: { reading: Reading; details?: boolean }) {
  const status = reading.classification === 'conforme' ? 'Conforme' :
    reading.classification === 'nao_conforme' ? 'Não conforme' : failureLabels[reading.failure ?? ''] ?? 'Falha de captura';
  return <View className="gap-1 border-b border-slate-100 py-2">
    <View className="flex-row flex-wrap justify-between gap-1">
      <Text className="font-semibold text-slate-900">OP {reading.order_number} · Chapa {reading.sequence}</Text>
      <Text className={reading.classification === 'conforme' ? 'text-emerald-700' : 'text-red-700'}>{status}</Text>
    </View>
    <Text className="text-sm text-slate-600">
      {reading.deflection_um !== null ? `${millimeters(reading.deflection_um)} mm · ` : ''}
      {readableDate(reading.captured_at ?? reading.observed_at)}
    </Text>
    {details && <Text className="text-xs text-slate-500">
      #{reading.id} · {reading.product} · {millimeters(reading.width_um)} mm · {reading.version} / {reading.calibration_id}
    </Text>}
  </View>;
}
