import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";

export default function Footer() {
    return (
        <footer className="footer">
            <div className="container footer-inner">
                <Link to="/" className="brand">
                    <Logo size={22} />
                    <span className="brand-name">LordLaunch</span>
                </Link>
                <p>Purchases are recorded in the platform database. Always check a project before you buy.</p>
            </div>
        </footer>
    );
}
