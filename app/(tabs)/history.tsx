import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { Search, FileText, X } from 'lucide-react-native';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { FilterBar } from '../../src/components/FilterBar';
import { MeasurementList } from '../../src/components/EmptyState';
import { getAnalysesByDateRange } from '../../src/database/analysesRepository';
import GeneratePDF from '../../src/components/GeneratePDF';
import * as SecureStore from 'expo-secure-store';
import MaskInput, { Masks } from 'react-native-mask-input';

export default function HistoryScreen() {
  const {
    measurements,
    searchQuery,
    setSearchQuery,
    selectedStatus,
    setSelectedStatus,
  } = useMeasurements();

  const [modalVisible, setModalVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleGeneratePDF = async () => {
    const dateRegexBR = /^\d{2}\/\d{2}\/\d{4}$/;
    
    if (!dateRegexBR.test(startDate) || !dateRegexBR.test(endDate)) {
      Alert.alert("Formato Inválido", "Por favor, insira as datas completas usando o padrão DD/MM/AAAA.");
      return;
    }

    const convertDateToISO = (dateString: string) => {
      const [day, month, year] = dateString.split('/');
      return `${year}-${month}-${day}`; 
    };

    try {
      setIsGenerating(true);
      const userId = await SecureStore.getItemAsync('userId');
      
      const formattedStartDate = convertDateToISO(startDate);
      const formattedEndDate = convertDateToISO(endDate);
      
      const recordsToExport = await getAnalysesByDateRange(userId, formattedStartDate, formattedEndDate);
      
      await GeneratePDF(recordsToExport, formattedStartDate, formattedEndDate);
      
      setModalVisible(false);
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Não foi possível gerar seu relatório em PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-[#151B2B] pt-14 px-5 pb-8 rounded-b-3xl">
        <View className="flex-row justify-between items-center mb-8">
          <Text className="text-2xl font-bold text-white">Histórico</Text>
          <TouchableOpacity 
            onPress={() => setModalVisible(true)}
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

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white w-full rounded-3xl p-6 shadow-xl border border-slate-100">
            
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-[#151B2B]">Exportar Histórico</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-slate-500 text-sm mb-5">
              Escolha as datas de início e fim no formato americano para consolidar as medições em PDF.
            </Text>

            <View className="gap-4 mb-6">
              <View>
                <Text className="text-slate-700 font-bold text-xs mb-2 tracking-wider">DATA INICIAL</Text>
                <MaskInput
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-[#151B2B] font-medium"
                  placeholder="DD/MM/AAAA"
                  value={startDate}
                  keyboardType="numeric"
                  onChangeText={(masked) => {
                    setStartDate(masked);
                  }}
                  mask={Masks.DATE_DDMMYYYY} 
                />
              </View>

              <View>
                <Text className="text-slate-700 font-bold text-xs mb-2 tracking-wider">DATA FINAL</Text>
                <MaskInput
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-[#151B2B] font-medium"
                  placeholder="DD/MM/AAAA"
                  value={endDate}
                  keyboardType="numeric"
                  onChangeText={(masked) => {
                    setEndDate(masked);
                  }}
                  mask={Masks.DATE_DDMMYYYY} 
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleGeneratePDF}
              disabled={isGenerating}
              className={`w-full py-4 rounded-xl items-center justify-center ${isGenerating ? 'bg-slate-400' : 'bg-[#FF7F00]'}`}
              activeOpacity={0.8}
            >
              <Text className="text-white font-bold text-base">
                {isGenerating ? "Processando..." : "Gerar Relatório"}
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
    </View>
  );
}