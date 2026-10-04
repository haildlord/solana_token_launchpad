import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const toast = useCallback((message, type = "success") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((list) => [...list, { id, message, type }]);
        setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
    }, []);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="toasts" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast toast-${t.type}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
