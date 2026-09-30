import {type Request, type Response, type NextFunction} from "express";
import { AppError } from "../errors/AppError.js";
import { type ResponseUser, type User } from "../interfaces/index.js";
import { HttpStatus } from "../constants/index.js";
import { getUserByEmail } from "../services/userService.js";


export function errorHandler(err : AppError | Error, _req : Request, res : Response, _next: NextFunction){
        
        if(err instanceof AppError){
            return res.status(err.statusCode).json({
                success : false,
                message : err.message
            })
        }

        console.error("Unhandled Error:", err);
        return res.status(500).json({
            success : false,
            message : "Internal Server Error"
        })
}
