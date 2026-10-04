import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";

function bad(message : string) : never {
    throw new AppError(message, HttpStatus.BAD_REQUEST);
}

function isNumber(value : unknown) : value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isText(value : unknown) : value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isDate(value : unknown) : boolean {
    return (typeof value === "string" || value instanceof Date) && !Number.isNaN(new Date(value).getTime());
}

// Checks the launch fields that are present in body. Used for create and for update.
// On create, the required fields are checked separately before this is called.
export function validateLaunchFields(body : any) : void {

    if (body.name !== undefined && !isText(body.name)) bad("name must be a non empty string");
    if (body.symbol !== undefined && !isText(body.symbol)) bad("symbol must be a non empty string");
    if (body.description !== undefined && !isText(body.description)) bad("description must be a non empty string");

    if (body.imageUrl !== undefined && body.imageUrl !== null) {
        if (typeof body.imageUrl !== "string") bad("imageUrl must be a string");
        if (!/^(https?:\/\/|\/uploads\/)/.test(body.imageUrl)) bad("imageUrl must be an http(s) link");
    }

    if (body.totalSupply !== undefined && (!isNumber(body.totalSupply) || body.totalSupply <= 0)) {
        bad("totalSupply must be a number greater than 0");
    }
    if (body.pricePerToken !== undefined && (!isNumber(body.pricePerToken) || body.pricePerToken <= 0)) {
        bad("pricePerToken must be a number greater than 0");
    }
    if (body.maxPerWallet !== undefined && (!isNumber(body.maxPerWallet) || body.maxPerWallet <= 0)) {
        bad("maxPerWallet must be a number greater than 0");
    }

    if (body.startsAt !== undefined && !isDate(body.startsAt)) bad("startsAt is not a valid date");
    if (body.endsAt !== undefined && !isDate(body.endsAt)) bad("endsAt is not a valid date");
    if (body.startsAt !== undefined && body.endsAt !== undefined) {
        if (new Date(body.endsAt) <= new Date(body.startsAt)) bad("endsAt must be after startsAt");
    }

    if (body.tiers !== undefined && body.tiers !== null) {
        if (!Array.isArray(body.tiers)) bad("tiers must be an array");
        for (const tier of body.tiers) {
            if (!tier || !isNumber(tier.minAmount) || !isNumber(tier.maxAmount) || !isNumber(tier.pricePerToken)) {
                bad("every tier needs minAmount, maxAmount and pricePerToken as numbers");
            }
            if (tier.minAmount < 0 || tier.maxAmount <= tier.minAmount || tier.pricePerToken < 0) {
                bad("tier amounts are not valid");
            }
        }
    }

    if (body.vesting !== undefined && body.vesting !== null) {
        const { cliffDays, vestingDays, tgePercent } = body.vesting;
        if (!isNumber(cliffDays) || !isNumber(vestingDays) || !isNumber(tgePercent)) {
            bad("vesting needs cliffDays, vestingDays and tgePercent as numbers");
        }
        if (cliffDays < 0 || vestingDays < 0 || tgePercent < 0 || tgePercent > 100) {
            bad("vesting values are not valid");
        }
    }
}

export function validateAddresses(addresses : unknown) : string[] {
    if (!Array.isArray(addresses) || addresses.length === 0) bad("addresses must be a non empty array");
    if (addresses.length > 1000) bad("you can add at most 1000 addresses at a time");
    if (!addresses.every((item) => isText(item))) bad("every address must be a non empty string");
    return addresses.map((item : string) => item.trim());
}

export function validatePurchase(body : any) : void {
    if (!isText(body.walletAddress)) bad("walletAddress is required");
    if (!isNumber(body.amount) || body.amount <= 0) bad("amount must be a number greater than 0");
    if (!isText(body.txSignature)) bad("txSignature is required");
    if (body.referralCode !== undefined && body.referralCode !== null && typeof body.referralCode !== "string") {
        bad("referralCode must be a string");
    }
}
