import { useState, useMemo, useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
import { StatusType } from "../types/measurement";
import { Analise } from "../types/analyses";
import { getAnalysesByUserId } from "../database/analysesRepository";

const PX_TO_MM_RATIO = 0.264583;

const getStatusFromResultado = (resultado: string): string => {
  const pxValue = parseFloat(resultado) || 0;
  const mm = pxValue * PX_TO_MM_RATIO;
  
  if (mm <= 3) return 'SUCESSO';
  if (mm > 3 && mm <= 5) return 'ATENÇÃO';
  if (mm > 5) return 'CRÍTICO';
  return 'SUCESSO';
};

export const useMeasurements = () => {
  const [measurements, setMeasurements] = useState<Analise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusType | "Todos">("Todos");

  useEffect(() => {
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
  }, []);

  const filteredMeasurements = useMemo(() => {
    return measurements.filter((item) => {
      const formattedBoxId = `BX-${item.id}`.toLowerCase();
      const matchesSearch = formattedBoxId.includes(searchQuery.toLowerCase());
      
      const currentStatus = getStatusFromResultado(item.resultado);
      const matchesStatus = selectedStatus === "Todos" || currentStatus === selectedStatus;
      
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
