import {getDatabase} from './database';
import {User, SaveUserInput, ValidateUserInput} from '../types/user';

export async function getId(): Promise<User[]> {
    const db = await getDatabase();
    return db.getAllAsync<User>("SELECT id FROM users");
}

export async function getProfile(): Promise<User | null> {
    const db = await getDatabase();

    return db.getFirstAsync<User>("SELECT * FROM users LIMIT 1");
}

export async function validateUser(input: ValidateUserInput): Promise<User | null> {
    const db = await getDatabase();

    return db.getFirstAsync<User>(`
        SELECT * FROM users 
        WHERE email = ? AND password = ?`,
        [input.email, input.password]
    );
}

export async function saveUser(input: SaveUserInput): Promise<void> {
    const db = await getDatabase();

    await db.runAsync(`
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
    `, [input.name, input.email, input.password]);
}