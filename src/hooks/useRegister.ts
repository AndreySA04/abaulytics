import { useState } from "react";
import { useRouter } from "expo-router";
import { validateUser } from "../database/userRepository";

export const useRegister = () =>{
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({ email: "", password: "" });

    const register = () =>{
        
        return false;
    }

    const handleEnter = () => {
        if(register()) router.replace('/(tabs)');
    }

    return { email, setEmail, password, setPassword, errors, handleEnter };
}