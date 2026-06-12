export const PX_TO_MM_RATIO = 0.163453;

export const getAnalysisDetails = (resultadoString: string) => {
    try {
      const data = JSON.parse(resultadoString);
      const mm = data.abaulamento_mm !== undefined ? Number(data.abaulamento_mm) : ((data.abaulamento_px || 0) * PX_TO_MM_RATIO);
      return {
        mm: mm,
        id: data.id_medicao || '-'
      };
    } catch (error) {
      console.error("Erro ao fazer parse do resultado:", error);
      return { mm: 0, id: '-' };
    }
};