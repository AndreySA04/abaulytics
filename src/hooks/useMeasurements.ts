import { useState, useMemo, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { StatusType } from "../types/measurement";
import { Analise } from "../types/analyses";
import { getAnalysesByUserId } from "../database/analysesRepository";
import { getAnalysisDetails } from '../utils/analyze';

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
      const { id, classification } = getAnalysisDetails(item.result);
      const formattedBoxId = `BX-${id ?? item.id}`.toLowerCase();
      const matchesSearch = formattedBoxId.includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatus === "Todos" || classification === selectedStatus;
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
