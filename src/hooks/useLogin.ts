import { useState } from 'react';
import { useRouter } from 'expo-router';
import { validateUser } from '../database/userRepository';
import * as SecureStore from 'expo-secure-store';

export const useLogin = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });

  const validate = async () => {
    let newErrors = { email: "", password: "" };
    let hasFrontendErrors = false;

    if (!email.trim()) {
      newErrors.email = "O e-mail é obrigatório.";
      hasFrontendErrors = true;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Digite um e-mail válido.";
      hasFrontendErrors = true;
    }

    if (!password) {
      newErrors.password = "A senha é obrigatória.";
      hasFrontendErrors = true;
    } else if (password.length < 6) {
      newErrors.password = "A senha deve ter no mínimo 6 caracteres.";
      hasFrontendErrors = true;
    }

    setErrors(newErrors);

    if (hasFrontendErrors) {
      return false;
    }

    try {
      const user = await validateUser({ email, password });
      
      if (user) {
        await SecureStore.setItemAsync('userId', String(user.id));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("Erro ao validar usuário no banco:", error);
      return false;
    }
  };

  const handleEnter = async () => {
    const isValid = await validate();
    
    if (isValid) {
      router.replace('/(tabs)');
      return true;
    }
    
    return false;
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    errors,
    handleEnter,
  };
};