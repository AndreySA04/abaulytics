export interface User {
  id: number;
  name: string;
  email: string;
  role: 'operador' | 'auditor';
  created_at: string;
}
export interface SaveUserInput { name: string; email: string; password: string; acceptedPrivacy: boolean; policyVersion: string; }
export interface ValidateUserInput { email: string; password: string; }
