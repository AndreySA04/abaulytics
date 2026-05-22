export interface Analise {
    id: number;
    user_id: number;
    resultado: string;
    created_at: string;
}

export interface saveAnalise {
    user_id: number;
    resultado: string;
}