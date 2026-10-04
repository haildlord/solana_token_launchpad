export function fmtNumber(value, digits = 4) {
    const n = Number(value);
    if (Number.isNaN(n)) return "-";
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function shortAddress(address) {
    if (!address || address.length <= 14) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

// "2d 4h", "3h 10m", "12m"
export function duration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

// The small line shown under a launch, depending on its status
export function timeNote(launch) {
    const now = Date.now();
    const start = new Date(launch.startsAt).getTime();
    const end = new Date(launch.endsAt).getTime();
    switch (launch.status) {
        case "UPCOMING":
            return `Starts in ${duration(start - now)}`;
        case "ACTIVE":
            return `Ends in ${duration(end - now)}`;
        case "SOLD_OUT":
            return "Sold out";
        default:
            return `Ended ${duration(now - end)} ago`;
    }
}

export function percentSold(launch) {
    const total = Number(launch.totalSupply);
    if (!total) return 0;
    return Math.min(100, (Number(launch.totalPurchased) / total) * 100);
}

// value for <input type="datetime-local">
export function toLocalInput(value) {
    const d = new Date(value);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Same rule as the backend: fill the tiers in order, the rest costs the flat price
export function estimateCost(launch, amount) {
    let remaining = Number(amount);
    if (!remaining || remaining <= 0) return 0;

    let cost = 0;
    for (const tier of launch.tiers || []) {
        if (remaining <= 0) break;
        const fill = Math.min(remaining, tier.maxAmount - tier.minAmount);
        cost += fill * tier.pricePerToken;
        remaining -= fill;
    }
    return cost + remaining * Number(launch.pricePerToken);
}

export const STATUS_LABEL = {
    ACTIVE: "Live",
    UPCOMING: "Upcoming",
    ENDED: "Ended",
    SOLD_OUT: "Sold out",
};
