import type { StatusType } from '../types/measurement';

export const PX_TO_MM_RATIO = 0.163453;
export const PROFILE_MEASUREMENT_METHOD = 'flecha_perfil_v1';
export const CONTOUR_MEASUREMENT_METHOD = 'flecha_contorno_v1';
const BENCH_LIMIT_UM = 12_000;
const BENCH_WARNING_UM = BENCH_LIMIT_UM - 200;

const presentation = {
    SUCESSO: { label: 'Sucesso', color: '#047857', highlight: '#34d399', background: 'bg-emerald-100', text: 'text-emerald-700' },
    ATENÇÃO: { label: 'Atenção', color: '#92400e', highlight: '#fbbf24', background: 'bg-amber-100', text: 'text-amber-800' },
    CRÍTICO: { label: 'Crítico', color: '#b91c1c', highlight: '#f87171', background: 'bg-red-100', text: 'text-red-700' },
    UNKNOWN: { label: 'Sem classificação', color: '#475569', highlight: '#cbd5e1', background: 'bg-slate-100', text: 'text-slate-600' },
};

export const measurementPresentation = (classification: StatusType | null) => presentation[classification ?? 'UNKNOWN'];

function normalizeClassification(value: unknown): StatusType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'SUCESSO') return 'SUCESSO';
    if (normalized === 'ATENCAO' || normalized === 'ATENÇÃO') return 'ATENÇÃO';
    if (normalized === 'CRITICO' || normalized === 'CRÍTICO') return 'CRÍTICO';
    return null;
}

function measurementNumber(value: unknown): number | null {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
}

function classifyLegacyMeasurement(mm: number): StatusType {
    const um = Math.round(mm * 1000);
    if (um > BENCH_LIMIT_UM) return 'CRÍTICO';
    if (um >= BENCH_WARNING_UM) return 'ATENÇÃO';
    return 'SUCESSO';
}

export const formatMeasurementMm = (mm: number | null) =>
    mm === null ? '—' : (Math.round(mm * 1000) / 1000).toFixed(3).replace(/(\.\d{2})0$/, '$1');

export function getAnalysisDetails(result: string) {
    try {
        const data = JSON.parse(result);
        const px = measurementNumber(data.abaulamento_px);
        const mm = measurementNumber(data.abaulamento_mm) ?? (px === null ? null : px * PX_TO_MM_RATIO);
        const legacyStatus = normalizeClassification(data.status);
        let classification: StatusType | null = null;
        if (mm !== null && !data.erro && (data.status == null || legacyStatus !== null)) {
            classification = normalizeClassification(data.classificacao) ??
                (legacyStatus === 'ATENÇÃO' || legacyStatus === 'CRÍTICO' ? legacyStatus : classifyLegacyMeasurement(mm));
        }
        const isContour = data.metodo_medicao === CONTOUR_MEASUREMENT_METHOD;
        const id: unknown = data.id_medicao;
        return {
            classification, mm, isContour,
            isEstimated: isContour || data.metodo_medicao === PROFILE_MEASUREMENT_METHOD,
            id: (typeof id === 'string' && id !== '') || typeof id === 'number' ? id : null,
        };
    } catch {
        return { classification: null, mm: null, id: null, isEstimated: false, isContour: false };
    }
}
