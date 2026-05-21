import { useState } from "react";
import { useRouter } from "expo-router";
import { saveUser } from "../database/userRepository";

export const useRegister = () =>{
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({ name: "", email: "", password: "" });

    const register = () =>{
        let newErrors = {name: "", email: "", password: ""};

        if(name === "" || email === "" || password === ""){
            if(name === "") newErrors.name = "O nome é obrigatório.";
            if(email === "") newErrors.email = "O e-mail é obrigatório.";
            if(password === "") newErrors.password = "A senha é obrigatória.";
        }

        if(password.length > 0 && password.length < 6){
            newErrors.password = "A senha deve conter no mínimo 6 caracteres.";
        }
        
        if(email.length > 0 && !/\S+@\S+\.\S+/.test(email)){
            newErrors.email = "Digite um e-mail válido.";
        }

        saveUser({ name, email, password });

        setErrors(newErrors);
        return false;
    }

    const handleEnter = () => {
        if(register()) router.replace('/(tabs)');
    }

    return { name, setName, email, setEmail, password, setPassword, errors, handleEnter };
}