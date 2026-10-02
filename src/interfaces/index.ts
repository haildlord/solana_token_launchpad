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

export interface Tier {
    minAmount: number;
    maxAmount: number;
    pricePerToken: number;
}

export interface Vesting {
    cliffDays: number;
    vestingDays: number;
    tgePercent: number;
}

export interface LaunchPayload {
    name            : string,
    symbol          : string,
    totalSupply     : number,
    pricePerToken   : number,
    startsAt        : string | Date,
    endsAt          : string | Date,
    maxPerWallet    : number,
    description     : string,
    tiers?          : Tier[] | undefined,
    vesting?        : Vesting | undefined
}

export interface Launch extends LaunchPayload {
    id: number;
    creatorId: number;
    totalPurchased  : number,
}

export interface LaunchWithStatus extends Launch {
    status : LaunchStatus;
}

export interface ReturnLaunch {
    launches : LaunchWithStatus[],
    total    : number,
    page     : number,
    limit    : number
}

export interface WhitelistingPayload {
    address : string[]
}

export interface WhitelistAddress{
    id : number,
    address : string,
    launchId : number,
}

export interface ReferralPayload {
    code: string;
    discountPercent: number;
    maxUses: number;
}

export interface Referral extends ReferralPayload {
    id: number;
    launchId: number;
    usedCount: number;
}

export type LaunchStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "SOLD_OUT";

export type SafeUser = Omit<User, 'password'>;
export type ResponseRegister = Omit<User, 'id'>;
export type ResponseLogin = Omit<User, 'id' | 'name'>;