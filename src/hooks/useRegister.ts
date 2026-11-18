import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { saveUser } from '../database/userRepository';
import { startSession } from '../security/session';
import { POLICY_VERSION } from '../privacy/policy';
export const useRegister = () => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [errors, setErrors] = useState({ name: '', email: '', password: '' });
  const [isLoading, setLoading] = useState(false);
  const busy = useRef(false);
  const handleEnter = async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true);
    const next = {
      name: name.trim() ? '' : 'O nome é obrigatório.',
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? '' : 'Informe um e-mail válido.',
      password: password.length >= 8 && password.length <= 128 ? '' : 'Use entre 8 e 128 caracteres.',
    };
    setErrors(next);
    try {
      if (Object.values(next).some(Boolean)) { Alert.alert('Confira os dados', Object.values(next).filter(Boolean).join('\n')); return; }
      if (!acceptedPrivacy) { Alert.alert('Privacidade', 'Leia e aceite a política de privacidade para continuar.'); return; }
      const user = await saveUser({ name, email, password, acceptedPrivacy, policyVersion: POLICY_VERSION });
      setPassword('');
      try {
        await startSession(user);
      } catch {
        router.replace('/(auth)');
        Alert.alert('Conta criada', 'Entre com o e-mail e a senha que você cadastrou.');
        return;
      }
      router.replace('/(tabs)');
    } catch (error) { Alert.alert('Cadastro', error instanceof Error ? error.message : 'Não foi possível criar a conta.'); }
    finally { busy.current = false; setLoading(false); }
  };
  return { name, setName, email, setEmail, password, setPassword, acceptedPrivacy, setAcceptedPrivacy, errors, handleEnter, isLoading };
};
