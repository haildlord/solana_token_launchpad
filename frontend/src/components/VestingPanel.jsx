import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ErrorBox, Field, ProgressBar } from "./ui.jsx";
import { fmtDate, fmtNumber } from "../utils.js";

export default function VestingPanel({ launch }) {
    const { token } = useAuth();
    const [wallet, setWallet] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function check(e) {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            setResult(await api.getVesting(token, launch.id, wallet.trim()));
        } catch (err) {
            setResult(null);
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const total = result ? Number(result.totalPurchased) : 0;
    const vestedPercent = total ? Math.min(100, (Number(result.vestedAmount) / total) * 100) : 0;

    return (
        <div className="stack">
            {!token ? (
                <p className="muted">Log in to look up a vesting schedule.</p>
            ) : (
                <form onSubmit={check} className="inline-form">
                    <Field label="Wallet address">
                        <input className="input" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet used for the purchase" required />
                    </Field>
                    <button className="btn btn-primary" disabled={busy}>
                        {busy ? "Checking..." : "Check vesting"}
                    </button>
                </form>
            )}

            {error && <ErrorBox>{error}</ErrorBox>}

            {result && (
                <div className="stack">
                    <div className="stats">
                        <Stat label="Total purchased" value={fmtNumber(result.totalPurchased)} />
                        <Stat label="Unlocked at TGE" value={fmtNumber(result.tgeAmount)} />
                        <Stat label="Claimable now" value={fmtNumber(result.claimableAmount)} highlight />
                        <Stat label="Still locked" value={fmtNumber(result.lockedAmount)} />
                    </div>
                    <div>
                        <ProgressBar percent={vestedPercent} label="Vested" />
                        <div className="progress-row">
                            <span>{vestedPercent.toFixed(1)}% vested</span>
                            <span className="muted">{result.cliffEndsAt ? `Cliff ends ${fmtDate(result.cliffEndsAt)}` : "No vesting schedule, everything is claimable"}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function Stat({ label, value, highlight }) {
    return (
        <div className={`stat ${highlight ? "stat-highlight" : ""}`}>
            <span className="meta-label">{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
