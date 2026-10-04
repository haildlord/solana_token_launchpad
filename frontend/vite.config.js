import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend runs on port 3000. The proxy lets the frontend call /api and /uploads
// on its own address, so there is no CORS setup needed while developing.
const backend = process.env.VITE_BACKEND_URL || "http://localhost:3000";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api": backend,
            "/uploads": backend,
        },
    },
});
