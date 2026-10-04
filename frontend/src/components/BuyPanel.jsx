import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "../toast.jsx";
import { ErrorBox, Field } from "./ui.jsx";
import { estimateCost, fmtNumber } from "../utils.js";

const closedMessage = {
    UPCOMING: "This sale has not started yet.",
    ENDED: "This sale has ended.",
    SOLD_OUT: "All tokens have been sold.",
};

export default function BuyPanel({ launch, onBought }) {
    const { token } = useAuth();
    const toast = useToast();
    const location = useLocation();
    const [form, setForm] = useState({ walletAddress: "", amount: "", txSignature: "", referralCode: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    const amount = Number(form.amount);
    const estimate = estimateCost(launch, amount);
    const left = Number(launch.totalSupply) - Number(launch.totalPurchased);

    async function submit(e) {
        e.preventDefault();
        setError("");
        if (!amount || amount <= 0) return setError("Enter how many tokens you want.");

        setBusy(true);
        try {
            const body = {
                walletAddress: form.walletAddress.trim(),
                amount,
                txSignature: form.txSignature.trim(),
            };
            if (form.referralCode.trim()) body.referralCode = form.referralCode.trim();

            const purchase = await api.purchase(token, launch.id, body);
            toast(`Purchase recorded. Total cost ${fmtNumber(purchase.totalCost, 6)} SOL`);
            setForm({ walletAddress: form.walletAddress, amount: "", txSignature: "", referralCode: "" });
            onBought();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <aside className="card buy-panel">
            <h2>Buy tokens</h2>

            {launch.status !== "ACTIVE" ? (
                <div className="alert alert-info">{closedMessage[launch.status]}</div>
            ) : !token ? (
                <>
                    <p className="muted">Log in to take part in this sale.</p>
                    <Link to="/login" state={{ from: location.pathname }} className="btn btn-primary btn-block">
                        Log in to buy
                    </Link>
                </>
            ) : (
                <form onSubmit={submit} className="stack">
                    {error && <ErrorBox>{error}</ErrorBox>}

                    <Field label="Wallet address" hint="The Solana wallet that sent the payment">
                        <input className="input" value={form.walletAddress} onChange={set("walletAddress")} required />
                    </Field>
                    <Field label="Amount" hint={`${fmtNumber(left, 0)} tokens left, up to ${fmtNumber(launch.maxPerWallet, 0)} per user`}>
                        <input className="input" type="number" min="0" step="any" value={form.amount} onChange={set("amount")} required />
                    </Field>
                    <Field label="Transaction signature" hint="From your payment transaction">
                        <input className="input" value={form.txSignature} onChange={set("txSignature")} required />
                    </Field>
                    <Field label="Referral code (optional)">
                        <input className="input" value={form.referralCode} onChange={set("referralCode")} />
                    </Field>

                    <div className="estimate">
                        <span className="muted">Estimated cost</span>
                        <strong>{fmtNumber(estimate, 6)} SOL</strong>
                    </div>
                    {form.referralCode.trim() && <p className="field-hint">The referral discount is applied when you buy.</p>}

                    <button className="btn btn-primary btn-block" disabled={busy}>
                        {busy ? "Recording..." : "Buy tokens"}
                    </button>
                </form>
            )}
        </aside>
    );
}
