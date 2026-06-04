import React from 'react';
import { View, Text } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { Analise } from '../types/analyses';

const PX_TO_MM_RATIO = 0.264583;

const getStatusByMm = (mm: number) => {
  if (mm <= 3) return 'SUCESSO';
  if (mm > 3 && mm <= 5) return 'ATENÇÃO';
  if (mm > 5) return 'CRÍTICO';
  return 'SUCESSO';
};

const getStatusClasses = (status: string) => {
  switch (status) {
    case 'SUCESSO': return { bg: 'bg-emerald-100', text: 'text-emerald-500' };
    case 'ATENÇÃO': return { bg: 'bg-amber-100', text: 'text-amber-600' };
    case 'CRÍTICO': return { bg: 'bg-red-100', text: 'text-red-500' };
    default: return { bg: 'bg-gray-100', text: 'text-gray-500' };
  }
};

export const MeasurementItem = ({ item }: { item: Analise }) => {
  const pxValue = parseFloat(item.resultado) || 0;
  const mmValue = pxValue * PX_TO_MM_RATIO;
  
  const statusLabel = getStatusByMm(mmValue);
  const statusStyle = getStatusClasses(statusLabel);

  const dateObj = new Date(item.created_at);
  const formattedDate = dateObj.toLocaleDateString('pt-BR');
  const formattedTime = dateObj.toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-bold text-slate-800">BX-{item.id}</Text>
          <View className={`px-2 py-0.5 rounded-full ${statusStyle.bg}`}>
            <Text className={`text-[10px] font-bold ${statusStyle.text}`}>{statusLabel}</Text>
          </View>
        </View>
        <Text className="text-2xl font-bold text-slate-800">
          {mmValue.toFixed(1)} <Text className="text-sm font-normal text-gray-400">mm</Text>
        </Text>
      </View>
      
      <View className="flex-row items-center gap-1.5">
        <Calendar size={14} color="#9CA3AF" />
        <Text className="text-xs text-gray-500">{formattedDate}</Text>
        <Text className="text-xs text-gray-500 ml-1">{formattedTime}</Text>
      </View>
    </View>
  );
};