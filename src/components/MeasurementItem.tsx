import React from 'react';
import { View, Text } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { MeasurementRecord } from '../types/measurement';

const getStatusClasses = (status: string) => {
  switch (status) {
    case 'SUCESSO': return { bg: 'bg-emerald-100', text: 'text-emerald-500' };
    case 'ATENÇÃO': return { bg: 'bg-amber-100', text: 'text-amber-600' };
    case 'CRÍTICO': return { bg: 'bg-red-100', text: 'text-red-500' };
    default: return { bg: 'bg-gray-100', text: 'text-gray-500' };
  }
};

export const MeasurementItem = ({ item }: { item: MeasurementRecord }) => {
  const statusStyle = getStatusClasses(item.status);

  return (
    <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-bold text-slate-800">{item.boxId}</Text>
          <View className={`px-2 py-0.5 rounded-full ${statusStyle.bg}`}>
            <Text className={`text-[10px] font-bold ${statusStyle.text}`}>{item.status}</Text>
          </View>
        </View>
        <Text className="text-2xl font-bold text-slate-800">
          {item.value} <Text className="text-sm font-normal text-gray-400">cm</Text>
        </Text>
      </View>
      
      <View className="flex-row items-center gap-1.5">
        <Calendar size={14} color="#9CA3AF" />
        <Text className="text-xs text-gray-500">{item.date}</Text>
        <Text className="text-xs text-gray-500 ml-1">{item.time}</Text>
      </View>
    </View>
  );
};