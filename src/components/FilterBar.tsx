import React from 'react';
import { ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { StatusType } from '../types/measurement';

interface FilterBarProps {
  selectedStatus: StatusType | 'Todos';
  setSelectedStatus: (status: StatusType | 'Todos') => void;
}

export const FilterBar = ({ selectedStatus, setSelectedStatus }: FilterBarProps) => {
  return (
    <View className="h-12 mt-6 mb-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        <TouchableOpacity 
          onPress={() => setSelectedStatus('Todos')}
          className={`flex-row items-center py-2 px-4 rounded-full border ${selectedStatus === 'Todos' ? 'bg-[#151B2B] border-[#151B2B]' : 'bg-white border-gray-200'}`}
        >
          <Text className={`font-semibold ${selectedStatus === 'Todos' ? 'text-white' : 'text-gray-600'}`}>Todos</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => setSelectedStatus('SUCESSO')}
          className={`flex-row items-center py-2 px-4 rounded-full border ${selectedStatus === 'SUCESSO' ? 'bg-[#151B2B] border-[#151B2B]' : 'bg-white border-gray-200'}`}
        >
          <Text className={`font-semibold ${selectedStatus === 'SUCESSO' ? 'text-white' : 'text-gray-600'}`}>Sucesso</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setSelectedStatus('ATENÇÃO')}
          className={`flex-row items-center py-2 px-4 rounded-full border ${selectedStatus === 'ATENÇÃO' ? 'bg-[#151B2B] border-[#151B2B]' : 'bg-white border-gray-200'}`}
        >
          <Text className={`font-semibold ${selectedStatus === 'ATENÇÃO' ? 'text-white' : 'text-gray-600'}`}>Atenção</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setSelectedStatus('CRÍTICO')}
          className={`flex-row items-center py-2 px-4 rounded-full border ${selectedStatus === 'CRÍTICO' ? 'bg-[#151B2B] border-[#151B2B]' : 'bg-white border-gray-200'}`}
        >
          <Text className={`font-semibold ${selectedStatus === 'CRÍTICO' ? 'text-white' : 'text-gray-600'}`}>Crítico</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};