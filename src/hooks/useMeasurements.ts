import { useState, useMemo } from "react";
import { MeasurementRecord, StatusType } from "../types/measurement";

const mockData: MeasurementRecord[] = [
  {
    id: "1",
    boxId: "BX-1042",
    status: "SUCESSO",
    date: "17/05/2026",
    time: "10:42",
    value: 1.2,
  },
  {
    id: "2",
    boxId: "BX-1041",
    status: "ATENÇÃO",
    date: "17/05/2026",
    time: "10:15",
    value: 3.4,
  },
  {
    id: "3",
    boxId: "BX-1040",
    status: "CRÍTICO",
    date: "17/05/2026",
    time: "09:58",
    value: 5.8,
  },
  {
    id: "4",
    boxId: "BX-1039",
    status: "SUCESSO",
    date: "16/05/2026",
    time: "16:30",
    value: 2.1,
  },
  {
    id: "5",
    boxId: "BX-1038",
    status: "CRÍTICO",
    date: "16/05/2026",
    time: "14:20",
    value: 4.6,
  },
  {
    id: "6",
    boxId: "BX-1037",
    status: "SUCESSO",
    date: "15/05/2026",
    time: "11:10",
    value: 1.8,
  },
];

export const useMeasurements = () => {
  const [measurements] = useState<MeasurementRecord[]>(mockData);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusType | "Todos">(
    "Todos",
  );

  const filteredMeasurements = useMemo(() => {
    return measurements.filter((item) => {
      const matchesSearch = item.boxId
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStatus =
        selectedStatus === "Todos" || item.status === selectedStatus;
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
