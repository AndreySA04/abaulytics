import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { validateUser } from '../database/userRepository';
import { startSession } from '../security/session';

export const useLogin = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const busy = useRef(false);

  const handleEnter = async () => {
    if (busy.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    const nextErrors = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ? '' : 'Informe um e-mail válido.',
      password: password ? '' : 'A senha é obrigatória.',
    };
    setErrors(nextErrors);
    setMessage('');
    if (nextErrors.email || nextErrors.password) return;

    busy.current = true;
    setIsLoading(true);
    const started = performance.now();
    try {
      const user = await validateUser({ email: normalizedEmail, password });
      if (!user) {
        setMessage('E-mail ou senha incorretos, ou tentativas temporariamente bloqueadas.');
        return;
      }
      await startSession(user);
      setPassword('');
      router.replace('/(tabs)');
      if (__DEV__) console.info('[performance] login até navegação', { ms: Math.round(performance.now() - started) });
    } catch {
      setMessage('Não foi possível iniciar a sessão. Tente novamente.');
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  };

  return { email, setEmail, password, setPassword, errors, handleEnter, message, isLoading };
};
