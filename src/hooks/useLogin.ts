import { useState } from 'react';
import { useRouter } from 'expo-router';

export const useLogin = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });

  const validate = () => {
    let isValid = true;
    let newErrors = { email: "", password: "" };

    if (!email.trim()) {
      newErrors.email = "O e-mail é obrigatório.";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Digite um e-mail válido.";
      isValid = false;
    }

    if (!password) {
      newErrors.password = "A senha é obrigatória.";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "A senha deve ter no mínimo 6 caracteres.";
      isValid = false;
    }

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