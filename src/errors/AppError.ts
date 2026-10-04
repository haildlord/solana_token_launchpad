export class AppError extends Error {
    
    public readonly statusCode: number;
    public readonly isOperational: boolean;

     constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
     
      super(message);

      this.statusCode = statusCode;
      this.isOperational = isOperational;
      this.name = 'AppError !';
     

      Object.setPrototypeOf(this, new.target.prototype);
      // V8 has captureStackTrace, but the Workers types do not list it
      (Error as any).captureStackTrace?.(this, this.constructor);
    }
  }
 