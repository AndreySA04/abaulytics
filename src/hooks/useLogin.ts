import { useState } from 'react';
import { useRouter } from 'expo-router';
import { validateUser } from '../database/userRepository';

export const useLogin = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });

  const validate = () => {
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

    if(validateUser({ email, password }) !== null) isValid = true;

    setErrors(newErrors);
    return isValid;
  };

  const handleEnter = () => {
    if (validate()) {
      router.replace('/(tabs)');
    }
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