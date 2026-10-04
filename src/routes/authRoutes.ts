import { Hono } from "hono";
import { HttpStatus } from "../constants/index.js";
import { AppError } from "../errors/AppError.js";
import { getUserByEmail, insertNewUser, isPasswordCorrect } from "../services/userService.js";
import { generateToken, getJwtSecret } from "../utils/jwt.js";
import { readJson } from "../utils/body.js";
import type { AppEnv } from "../types.js";

export const authRoute = new Hono<AppEnv>();

authRoute.post("/register", async (c) => {

    const { email, password, name } = await readJson(c);
    if (!email || !password || !name) {
        throw new AppError("Invalid Credentials", HttpStatus.BAD_REQUEST);
    }

    // insertNewUser : throws if user already exists
    const newUser = await insertNewUser(c.env.DB, email, name, password);
    const token = await generateToken({ id: newUser.id, email: newUser.email }, getJwtSecret(c.env));

    return c.json({
        token,
        user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name
        }
    }, HttpStatus.CREATED);
});

authRoute.post("/login", async (c) => {

    const { email, password } = await readJson(c);
    if (!email || !password) {
        throw new AppError("Invalid Credentials", HttpStatus.UNAUTHORIZED);
    }

    const user = await getUserByEmail(c.env.DB, email);
    if (!user) {
        throw new AppError("User does not exist", HttpStatus.UNAUTHORIZED);
    }

    const passwordMatch = await isPasswordCorrect(password, user.password);
    if (!passwordMatch) {
        throw new AppError("Wrong Password", HttpStatus.UNAUTHORIZED);
    }

    const token = await generateToken({ id: user.id, email: user.email }, getJwtSecret(c.env));

    return c.json({
        token,
        user: {
            id: user.id,
            email: user.email,
            name: user.name
        }
    }, HttpStatus.OK);
});
