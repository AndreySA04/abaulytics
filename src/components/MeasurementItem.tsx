import React from 'react';
import { View, Text } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { Analise } from '../types/analyses';
import { CONTOUR_MEASUREMENT_METHOD, isEstimatedMeasurement, PX_TO_MM_RATIO } from '../utils/analyze';

const getStatusClasses = (status: string) => {
  const normalizedStatus = status.toUpperCase().trim();
  
  if (normalizedStatus === 'SUCESSO') {
    return { bg: 'bg-emerald-100', text: 'text-emerald-500', label: 'SUCESSO' };
  }
  if (normalizedStatus === 'ATENÇÃO' || normalizedStatus === 'ATENCAO') {
    return { bg: 'bg-amber-100', text: 'text-amber-600', label: 'ATENÇÃO' };
  }
  if (normalizedStatus === 'CRÍTICO' || normalizedStatus === 'CRITICO') {
    return { bg: 'bg-red-100', text: 'text-red-500', label: 'CRÍTICO' };
  }
  
  return { bg: 'bg-gray-100', text: 'text-gray-500', label: normalizedStatus };
};

export const MeasurementItem = ({ item }: { item: Analise }) => {
  let pxValue = 0;
  let explicitMm: number | null = null;
  let isEstimated = false;
  let isContour = false;
  let idMedicaoAPI = null;
  let apiStatus = 'DESCONHECIDO';

  try {
    const data = JSON.parse(item.result);
    isEstimated = isEstimatedMeasurement(data.metodo_medicao);
    isContour = data.metodo_medicao === CONTOUR_MEASUREMENT_METHOD;
    pxValue = data.abaulamento_px || 0;
    if (typeof data.abaulamento_mm === 'number' && Number.isFinite(data.abaulamento_mm)) explicitMm = data.abaulamento_mm;
    idMedicaoAPI = data.id_medicao;
    apiStatus = data.status || 'DESCONHECIDO';
  } catch (error) {
    console.error("Erro ao fazer parse do resultado no MeasurementItem:", error);
  }

  const mmValue = explicitMm ?? pxValue * PX_TO_MM_RATIO;
  
  const statusConfig = getStatusClasses(apiStatus);

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
            BX-{idMedicaoAPI || item.id}
          </Text>
          <View className={`px-2 py-0.5 rounded-full ${statusConfig.bg}`}>
            <Text className={`text-[10px] font-bold ${statusConfig.text}`}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
        <Text className="text-2xl font-bold text-slate-800">
          {isEstimated ? '≈ ' : ''}{mmValue.toFixed(2)} <Text className="text-sm font-normal text-gray-400">mm</Text>
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
