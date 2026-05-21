export interface User {
    id: number;
    email: string;
    password: string;
    created_at: string;
}

export interface SaveUserInput{
    name: string;
    email: string;
    password: string;
}

export interface ValidateUserInput{
    email: string;
    password: string;
}