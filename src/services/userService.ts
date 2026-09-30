import bcrypt from "bcryptjs";
import {db} from "../config/db.js";
import { type QueryResult } from "pg";
import { type User, type SafeUser } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";


export async function getUserByEmail(email : string) : Promise<User | null> {
    const result = await db.query<User>(`SELECT * FROM "user" WHERE email = $1`, [email]);
    return result.rows[0] ?? null;
}

export async function getUserById(id: number) : Promise<User | null> {
    const result = await db.query<User>(`SELECT * FROM "user" WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
}

export async function hashUsersPassword(password: string) : Promise<string> {
    return bcrypt.hash(password, 10); 
}

export async function isPasswordCorrect(plainPassword: string, storedHashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, storedHashedPassword);
}

 // * insertNewUser : throws if user already exists 
export async function insertNewUser(email: string, name: string, unHashedPassword: string) : Promise<SafeUser> {
    
    const result : User | null = await getUserByEmail(email);
    if(result){
        throw new AppError("User already exists", HttpStatus.CONFLICT);
    }

    const hashedPassword : string = await hashUsersPassword(unHashedPassword);

    const user : QueryResult<SafeUser> = await db.query(`insert into "user" (email, name, password) values ($1, $2, $3) returning id, email, name`, 
        [email, name, hashedPassword]);

        if(user.rows[0]){
            return user.rows[0]
        }

    throw new AppError("Could not create a new user", HttpStatus.INTERNAL_SERVER_ERROR);
}
