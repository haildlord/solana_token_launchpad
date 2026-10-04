import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import { useAuth } from "./auth.jsx";
import Launches from "./pages/Launches.jsx";
import LaunchDetail from "./pages/LaunchDetail.jsx";
import CreateLaunch from "./pages/CreateLaunch.jsx";
import { Login, Register } from "./pages/AuthPages.jsx";
import NotFound from "./pages/NotFound.jsx";

function RequireAuth({ children }) {
    const { token } = useAuth();
    const location = useLocation();
    if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return children;
}

function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
}

export default function App() {
    return (
        <div className="app">
            <ScrollToTop />
            <Navbar />
            <main className="main">
                <Routes>
                    <Route path="/" element={<Launches />} />
                    <Route path="/launches/:id" element={<LaunchDetail />} />
                    <Route path="/create" element={<RequireAuth><CreateLaunch /></RequireAuth>} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
}
