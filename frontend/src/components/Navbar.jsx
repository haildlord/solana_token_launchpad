import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import Logo from "./Logo.jsx";

export default function Navbar() {
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const close = () => setOpen(false);

    function handleLogout() {
        logout();
        close();
        navigate("/");
    }

    return (
        <header className="navbar">
            <div className="container navbar-inner">
                <Link to="/" className="brand" onClick={close}>
                    <Logo />
                    <span className="brand-name">LordLaunch</span>
                </Link>

                <button
                    className="nav-toggle"
                    aria-label="Toggle menu"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                >
                    <span />
                    <span />
                    <span />
                </button>

                <nav className={`nav ${open ? "nav-open" : ""}`}>
                    <div className="nav-links">
                        <NavLink to="/" end onClick={close}>
                            Launches
                        </NavLink>
                        <NavLink to="/create" onClick={close}>
                            Create launch
                        </NavLink>
                    </div>

                    <div className="nav-actions">
                        {user ? (
                            <>
                                <span className="user-chip" title={user.email}>
                                    <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                                    {user.name}
                                </span>
                                <button className="btn btn-ghost btn-small" onClick={handleLogout}>
                                    Log out
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="btn btn-ghost btn-small" onClick={close}>
                                    Log in
                                </Link>
                                <Link to="/register" className="btn btn-primary btn-small" onClick={close}>
                                    Sign up
                                </Link>
                            </>
                        )}
                    </div>
                </nav>
            </div>
        </header>
    );
}
