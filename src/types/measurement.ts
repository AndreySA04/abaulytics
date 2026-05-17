export type StatusType = "SUCESSO" | "ATENÇÃO" | "CRÍTICO";

export interface MeasurementRecord {
  id: string;
  boxId: string;
  status: StatusType;
  date: string;
  time: string;
  value: number;
}

export interface MeasurementCreate {
  boxId: string;
  status: StatusType;
  date: string;
  time: string;
  value: number;
}
