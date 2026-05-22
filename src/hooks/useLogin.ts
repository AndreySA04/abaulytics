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
    let isValid = false;
    let newErrors = { email: "", password: "" };

    if (!email.trim()) {
      newErrors.email = "O e-mail é obrigatório.";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Digite um e-mail válido.";
    }

    if (!password) {
      newErrors.password = "A senha é obrigatória.";
    } else if (password.length < 6) {
      newErrors.password = "A senha deve ter no mínimo 6 caracteres.";
    }

    const user = await validateUser({ email, password });
    await SecureStore.setItemAsync('userId', String(user?.id));
    if (user !== null){
      isValid = true;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleEnter = () => {
    validate().then((isValid) => {
      if (isValid) {
        router.replace('/(tabs)');
      }
    });
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