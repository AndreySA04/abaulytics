import React from 'react';
import { View, Text } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { Analise } from '../types/analyses';
import { formatMeasurementMm, getAnalysisDetails, measurementPresentation } from '../utils/analyze';

export const MeasurementItem = ({ item }: { item: Analise }) => {
  const { id, mm, isEstimated, isContour, classification } = getAnalysisDetails(item.result);
  const quality = measurementPresentation(classification);

  const date = item.created_at.replace(' ', 'T');
  const safeDateString = /(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? date : date + 'Z';
  const dateObj = new Date(safeDateString);

  const formattedDate = dateObj.toLocaleDateString('pt-BR');
  const formattedTime = dateObj.toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100">
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2 flex-1 mr-3">
          <Text numberOfLines={1} ellipsizeMode="middle" style={{ flexShrink: 1 }} className="text-lg font-bold text-slate-800">
            BX-{id ?? item.id}
          </Text>
          <View className={`px-2 py-0.5 rounded-full ${quality.background}`}>
            <Text className={`text-[10px] font-bold ${quality.text}`}>
              {quality.label}
            </Text>
          </View>
        </View>
        <Text className="text-2xl font-bold text-slate-800">
          {isEstimated ? '≈ ' : ''}{formatMeasurementMm(mm)}{mm !== null && <Text className="text-sm font-normal text-gray-400"> mm</Text>}
        </Text>
      </View>
      
      <View className="flex-row items-center gap-1.5">
        <Calendar size={14} color="#9CA3AF" />
        <Text className="text-xs text-gray-500">{formattedDate}</Text>
        <Text className="text-xs text-gray-500 ml-1">{formattedTime}</Text>
        {isContour && <Text className="text-xs text-gray-500 ml-1">· Contorno</Text>}
      </View>
    </View>
  );
};
