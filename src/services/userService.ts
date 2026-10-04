import { type User, type SafeUser } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

export async function getUserByEmail(db : D1Database, email : string) : Promise<User | null> {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<User>();
}

export async function getUserById(db : D1Database, id : number) : Promise<User | null> {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<User>();
}

export async function isPasswordCorrect(plainPassword : string, storedHashedPassword : string) : Promise<boolean> {
    return verifyPassword(plainPassword, storedHashedPassword);
}

 // * insertNewUser : throws if user already exists 
export async function insertNewUser(db : D1Database, email : string, name : string, unHashedPassword : string) : Promise<SafeUser> {

    const existing = await getUserByEmail(db, email);
    if (existing) {
        throw new AppError("User already exists", HttpStatus.CONFLICT);
    }

    const hashedPassword = await hashPassword(unHashedPassword);

    let user : SafeUser | null;
    try {
        user = await db
            .prepare(`INSERT INTO users (email, name, password) VALUES (?, ?, ?) RETURNING id, email, name`)
            .bind(email, name, hashedPassword)
            .first<SafeUser>();
    } catch (err) {
        // two sign ups with the same email at the same moment
        if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
            throw new AppError("User already exists", HttpStatus.CONFLICT);
        }
        throw err;
    }

    if (!user) {
        throw new AppError("Could not create a new user", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return user;
}
