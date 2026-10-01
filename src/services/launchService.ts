 import { type LaunchPayload, type Launch, type LaunchStatus, type ReturnLaunch, type LaunchWithStatus } from "../interfaces/index.js";
 import { type QueryResult } from "pg";
 import { AppError } from "../errors/AppError.js";
 import { HttpStatus } from "../constants/index.js";
 import {db} from "../config/db.js";

 // * insertNewLaunch : throws if unable to insert the launch
export async function insertNewLaunch(payload : LaunchPayload, userId : number) : Promise<Launch> {
    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } = payload;

    const insertedLaunch : QueryResult<Launch> = await db.query(
        `INSERT INTO "launches" (creatorId, name, symbol, description, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, tiers, vesting) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [
            userId,
            name,
            symbol,
            description,
            totalSupply,
            pricePerToken,
            startsAt,
            endsAt,
            maxPerWallet,
            tiers ? JSON.stringify(tiers) : null,
            vesting ? JSON.stringify(vesting) : null   
        ]
    );

    if(insertedLaunch.rows[0]){
        return insertedLaunch.rows[0];
    }

    throw new AppError("Could not insert Launch", HttpStatus.INTERNAL_SERVER_ERROR);
}

export function computeLaunchStatus(launch : {
    startsAt    : Date | string;
    endsAt      : Date | string;
    totalSupply : number;
    totalPurchased : number
}) : LaunchStatus {

    const now   = new Date();
    const start = new Date(launch.startsAt);
    const end   = new Date(launch.endsAt);

    const purchased = launch.totalPurchased;
    const total     = launch.totalSupply;

    if (purchased >= total && total > 0) {
        return "SOLD_OUT";
    }

    if (now < start) {
        return "UPCOMING";
    }

    if (now > end) {
        return "ENDED";
    }

    return "ACTIVE";
}


export async function getLaunches(page: number = 1, limit: number = 10, status? : LaunchStatus) : Promise<ReturnLaunch>{
    
    let whereClause = "";

    if (status === "SOLD_OUT") {
        whereClause = "WHERE totalPurchased >= totalSupply";
    } else if (status === "UPCOMING") {
        whereClause = "WHERE startsAt > NOW()";
    } else if (status === "ACTIVE") {
        whereClause = "WHERE startsAt <= NOW() AND endsAt >= NOW() AND totalPurchased < totalSupply";
    } else if (status === "ENDED") {
        whereClause = "WHERE endsAt < NOW()";
    }
    
    const offset = Math.max(0, (page - 1) * limit);
    
    const query = `
        SELECT * FROM launches 
        ${whereClause} 
        ORDER BY id DESC 
        LIMIT $1 OFFSET $2
    `;
    
    const result : QueryResult<Launch> = await db.query(query, [limit, offset]);
    const countResult = await db.query(`SELECT COUNT(*) FROM launches ${whereClause}`);

    let resultWithStatus : LaunchWithStatus[] = result.rows.map((item : Launch) => (
        {
            ...item,
            status : status ? status : computeLaunchStatus(item),
        }
    ))


    const total = parseInt(countResult.rows[0].count, 10);

    return { launches : resultWithStatus, total, page, limit};
}

export async function getLaunchById(id: number): Promise<LaunchWithStatus> {
    const result: QueryResult<Launch> = await db.query(
        "SELECT * FROM launches WHERE id = $1",
        [id]
    );

    const launch = result.rows[0];
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    return {
        ...launch,
        status: computeLaunchStatus(launch)
    };
}