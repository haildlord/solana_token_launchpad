export interface User {
    id       : number,
    email    : string,
    name     : string,
    password : string
}

export interface TokenPayload {
    id: number;
    email: string;
}

export type SafeUser = Omit<User, 'password'>;
export type ResponseRegister = Omit<User, 'id'>;
export type ResponseLogin = Omit<User, 'id, name'>;