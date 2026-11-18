export const PX_TO_MM_RATIO = 0.163453;
export const PROFILE_MEASUREMENT_METHOD = 'flecha_perfil_v1';
export const CONTOUR_MEASUREMENT_METHOD = 'flecha_contorno_v1';
export const isEstimatedMeasurement = (method: unknown) =>
    method === PROFILE_MEASUREMENT_METHOD || method === CONTOUR_MEASUREMENT_METHOD;

export const getAnalysisDetails = (resultadoString: string) => {
    try {
      const data = JSON.parse(resultadoString);
      const mm = data.abaulamento_mm !== undefined ? Number(data.abaulamento_mm) : ((data.abaulamento_px || 0) * PX_TO_MM_RATIO);
      return {
        status: data.status,
        mm: mm,
        isEstimated: isEstimatedMeasurement(data.metodo_medicao),
        isContour: data.metodo_medicao === CONTOUR_MEASUREMENT_METHOD,
        id: data.id_medicao || '-'
      };
    } catch (error) {
      console.error("Erro ao fazer parse do resultado:", error);
      return { mm: 0, id: '-', isEstimated: false, isContour: false };
    }
};
