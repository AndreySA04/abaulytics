import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Search, FileText } from 'lucide-react-native';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { FilterBar } from '../../src/components/FilterBar';
import { MeasurementList } from '../../src/components/EmptyState';
import { getAnalysesByUserId } from '../../src/database/analysesRepository';

export default function HistoryScreen() {
  const {
    measurements,
    searchQuery,
    setSearchQuery,
    selectedStatus,
    setSelectedStatus,
  } = useMeasurements();

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-[#151B2B] pt-14 px-5 pb-8 rounded-b-3xl">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-2xl font-bold text-white">Histórico</Text>
          <TouchableOpacity 
            onPress={() => {}}
            className="bg-[#FF7F00] flex-row items-center px-4 py-2 rounded-xl gap-1.5"
          >
            <FileText size={16} color="#FFF" />
            <Text className="text-white font-bold text-sm">PDF</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center bg-[#222A3F] rounded-xl px-3">
          <Search size={20} color="#6B7280" />
          <TextInput
            className="flex-1 py-4 text-white text-base ml-2"
            placeholder="Buscar por ID da caixa..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FilterBar 
        selectedStatus={selectedStatus} 
        setSelectedStatus={setSelectedStatus} 
      />
      
      <MeasurementList data={measurements} />
    </View>
  );
}