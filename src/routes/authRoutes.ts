import {Router, type NextFunction, type Request, type Response} from "express";
import { HttpStatus } from "../constants/index.js";
import { AppError } from "../errors/AppError.js";
import { getUserByEmail, insertNewUser, isPasswordCorrect } from "../services/userService.js";
import { generateToken } from "../utils/jwt.js";
import {type ResponseRegister, type ResponseLogin, type User} from "../interfaces/index.js";

export const authRoute = Router();

authRoute.post("/register", registerUser);
authRoute.post("/login", loginUser);

async function registerUser(req : Request, res : Response, _next: NextFunction) {

    const {email, password, name} : ResponseRegister = req.body;
    if(!email || !password || !name){
        throw new AppError("Invalid Credentials", HttpStatus.BAD_REQUEST);
    }

    // insertNewUser : throws if user already exists  
    const newUser = await insertNewUser(email, name, password);
    const token = generateToken({id: newUser.id, email: newUser.email});

    res.status(HttpStatus.CREATED).json({
        token,
        user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name
        }
    });
}


async function loginUser(req : Request, res : Response, _next: NextFunction) {
    
    const { email, password } : ResponseLogin = req.body;
    if(!email || !password){
        throw new AppError("Invalid Credentials", HttpStatus.UNAUTHORIZED);
    }

    const user : User | null = await getUserByEmail(email);
    if(!user){
        throw new AppError("User does not exist", HttpStatus.UNAUTHORIZED);
    }

    const passwordMatch = await isPasswordCorrect(password, user.password);
    if(!passwordMatch){
        throw new AppError("Wrong Password", HttpStatus.UNAUTHORIZED);
    }

    const token = generateToken({id: user.id, email: user.email});

    return res.status(HttpStatus.OK).json({
        token,
        user: {
            id: user.id,
            email: user.email,
            name: user.name
        }
    })
}
