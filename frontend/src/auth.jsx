import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "./api.js";

const AuthContext = createContext(null);
const STORAGE_KEY = "launchpad_session";

function readSession() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }) {
    const [session, setSession] = useState(readSession);

    const save = useCallback((data) => {
        const next = { token: data.token, user: data.user };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // storage can be blocked, the session then only lasts until the page reloads
        }
        setSession(next);
    }, []);

    const login = useCallback(async (email, password) => save(await api.login({ email, password })), [save]);
    const register = useCallback(
        async (name, email, password) => save(await api.register({ name, email, password })),
        [save]
    );
    const logout = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // nothing to clean up
        }
        setSession(null);
    }, []);

    const value = useMemo(
        () => ({ token: session?.token ?? null, user: session?.user ?? null, login, register, logout }),
        [session, login, register, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
