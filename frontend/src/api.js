// Everything that talks to the backend lives here.

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

async function request(method, path, { body, token, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
        res = await fetch(path, {
            method,
            headers,
            body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
        });
    } catch {
        throw new ApiError("Cannot reach the server. Is the backend running?", 0);
    }

    const data = await res.json().catch(() => null);
    // when the backend is not running, the dev proxy answers with an empty 500/502/503/504
    if (!res.ok && data === null && res.status >= 500) {
        throw new ApiError("Cannot reach the server. Start the backend with npm start in the project root.", 0);
    }
    if (!res.ok) {
        throw new ApiError(data?.message || `Request failed (${res.status})`, res.status);
    }
    return data;
}

export const api = {
    register: (body) => request("POST", "/api/auth/register", { body }),
    login: (body) => request("POST", "/api/auth/login", { body }),

    listLaunches: ({ page = 1, limit = 9, status } = {}) => {
        const params = new URLSearchParams({ page, limit });
        if (status) params.set("status", status);
        return request("GET", `/api/launches?${params}`);
    },
    getLaunch: (id) => request("GET", `/api/launches/${id}`),
    createLaunch: (token, body) => request("POST", "/api/launches", { token, body }),
    updateLaunch: (token, id, body) => request("PUT", `/api/launches/${id}`, { token, body }),
    uploadImage: (token, id, file) => {
        const form = new FormData();
        form.append("image", file);
        return request("POST", `/api/launches/${id}/image`, { token, form });
    },

    getWhitelist: (token, id) => request("GET", `/api/launches/${id}/whitelist`, { token }),
    addWhitelist: (token, id, addresses) =>
        request("POST", `/api/launches/${id}/whitelist`, { token, body: { addresses } }),
    removeWhitelist: (token, id, address) =>
        request("DELETE", `/api/launches/${id}/whitelist/${encodeURIComponent(address)}`, { token }),

    getReferrals: (token, id) => request("GET", `/api/launches/${id}/referrals`, { token }),
    createReferral: (token, id, body) => request("POST", `/api/launches/${id}/referrals`, { token, body }),

    purchase: (token, id, body) => request("POST", `/api/launches/${id}/purchase`, { token, body }),
    getPurchases: (token, id) => request("GET", `/api/launches/${id}/purchases`, { token }),
    getVesting: (token, id, walletAddress) =>
        request("GET", `/api/launches/${id}/vesting?walletAddress=${encodeURIComponent(walletAddress)}`, { token }),
};
