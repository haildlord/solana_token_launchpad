import {type Request, type Response, type NextFunction} from "express";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { verifyToken } from "../utils/jwt.js";


export function errorHandler(err : AppError | Error, _req : Request, res : Response, _next: NextFunction){
        
        if(err instanceof AppError){
            return res.status(err.statusCode).json({
                success : false,
                message : err.message
            })
        }

        // express.json() sets this when the body is not valid JSON
        if((err as any).type === "entity.parse.failed"){
            return res.status(400).json({
                success : false,
                message : "Invalid JSON body"
            })
        }

        // multer errors, for example a file that is too big
        if((err as any).name === "MulterError"){
            return res.status(400).json({
                success : false,
                message : (err as any).code === "LIMIT_FILE_SIZE" ? "Image must be 2MB or smaller" : err.message
            })
        }

        console.error("Unhandled Error:", err);
        return res.status(500).json({
            success : false,
            message : "Internal Server Error"
        })
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
    
    let bearerToken = req.headers["authorization"];
    
    const token = bearerToken?.split(" ")[1];
    if(!token) {
        throw new AppError("Auth token missing", HttpStatus.UNAUTHORIZED);
    }

    try{
        const payload = verifyToken(token);
        (req as any).user = payload;
        next();
    }catch(err){
        throw new AppError("Invalid or expired token", HttpStatus.UNAUTHORIZED);
    }
}


