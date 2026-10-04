import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { ErrorBox, Field } from "../components/ui.jsx";

function AuthForm({ mode }) {
    const isRegister = mode === "register";
    const { token, login, register } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const goBackTo = location.state?.from || "/";

    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    // already logged in, nothing to do here
    if (token && !busy) return <Navigate to={goBackTo} replace />;

    async function submit(e) {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            if (isRegister) await register(form.name.trim(), form.email.trim(), form.password);
            else await login(form.email.trim(), form.password);
            navigate(goBackTo, { replace: true });
        } catch (err) {
            // the backend says "Invalid Credentials" for wrong logins
            setError(err.status === 401 ? "Email or password is not correct." : err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="container auth-wrap">
            <form className="card auth-card" onSubmit={submit}>
                <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
                <p className="muted">
                    {isRegister ? "Sign up to buy tokens and run your own launches." : "Log in to continue."}
                </p>

                {error && <ErrorBox>{error}</ErrorBox>}

                {isRegister && (
                    <Field label="Name">
                        <input className="input" value={form.name} onChange={set("name")} autoComplete="name" required />
                    </Field>
                )}
                <Field label="Email">
                    <input className="input" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
                </Field>
                <Field label="Password">
                    <input
                        className="input"
                        type="password"
                        value={form.password}
                        onChange={set("password")}
                        autoComplete={isRegister ? "new-password" : "current-password"}
                        required
                    />
                </Field>

                <button className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? "Please wait..." : isRegister ? "Sign up" : "Log in"}
                </button>

                <p className="muted center">
                    {isRegister ? (
                        <>
                            Already have an account? <Link to="/login" state={location.state}>Log in</Link>
                        </>
                    ) : (
                        <>
                            New here? <Link to="/register" state={location.state}>Create an account</Link>
                        </>
                    )}
                </p>
            </form>
        </div>
    );
}

export const Login = () => <AuthForm mode="login" />;
export const Register = () => <AuthForm mode="register" />;
