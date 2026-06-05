import { useState, useMemo, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { StatusType } from "../types/measurement";
import { Analise } from "../types/analyses";
import { getAnalysesByUserId } from "../database/analysesRepository";

const normalizeStatus = (status: string): string => {
  const normalized = status.toUpperCase().trim();
  if (normalized === 'SUCESSO') return 'SUCESSO';
  if (normalized === 'ATENÇÃO' || normalized === 'ATENCAO') return 'ATENÇÃO';
  if (normalized === 'CRÍTICO' || normalized === 'CRITICO') return 'CRÍTICO';
  return 'SUCESSO';
};

export const useMeasurements = () => {
  const [measurements, setMeasurements] = useState<Analise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusType | "Todos">("Todos");

  useFocusEffect(
    useCallback(() => {
      const fetchAnalyses = async () => {
        try {
          const userId: string | null = await SecureStore.getItemAsync('userId');
          
          if (userId) {
            const data = await getAnalysesByUserId(userId);
            setMeasurements(data);
          }
        } catch (error) {
          console.error("Erro ao buscar análises:", error);
        }
      };

      fetchAnalyses();
    }, [])
  );

  const filteredMeasurements = useMemo(() => {
    return measurements.filter((item) => {
      let apiStatus = 'SUCESSO';
      let idMedicao = item.id;

      try {
        const data = JSON.parse(item.result);
        apiStatus = normalizeStatus(data.status || '');
        idMedicao = data.id_medicao || item.id;
      } catch (error) {
        console.error("Erro ao ler JSON no filtro:", error);
      }

      const formattedBoxId = `BX-${idMedicao}`.toLowerCase();
      const matchesSearch = formattedBoxId.includes(searchQuery.toLowerCase());
      
      const matchesStatus = selectedStatus === "Todos" || apiStatus === selectedStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [measurements, searchQuery, selectedStatus]);

  return {
    measurements: filteredMeasurements,
    searchQuery,
    setSearchQuery,
    selectedStatus,
    setSelectedStatus,
  };
};
