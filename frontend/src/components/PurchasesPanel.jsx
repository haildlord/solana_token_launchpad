import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorBox, Spinner } from "./ui.jsx";
import { fmtNumber, shortAddress } from "../utils.js";

export default function PurchasesPanel({ launch, isCreator, refreshKey }) {
    const { token, user } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!token) return;
        setError("");
        try {
            setData(await api.getPurchases(token, launch.id));
        } catch (err) {
            setError(err.message);
        }
    }, [token, launch.id]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    if (!token) return <p className="muted">Log in to see purchases.</p>;
    if (error) return <ErrorBox onRetry={load}>{error}</ErrorBox>;
    if (!data) return <Spinner />;

    return (
        <div className="stack">
            <p className="muted">{isCreator ? "All purchases for your launch." : "Your purchases in this launch."}</p>
            {data.purchases.length === 0 ? (
                <EmptyState title="No purchases yet" />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                {isCreator && <th>User</th>}
                                <th>Wallet</th>
                                <th className="num">Amount</th>
                                <th className="num">Cost (SOL)</th>
                                <th>Transaction</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.purchases.map((p) => (
                                <tr key={p.id}>
                                    {isCreator && <td>{p.userId === user.id ? "You" : `#${p.userId}`}</td>}
                                    <td title={p.walletAddress}>{shortAddress(p.walletAddress)}</td>
                                    <td className="num">{fmtNumber(p.amount)}</td>
                                    <td className="num">{fmtNumber(p.totalCost, 6)}</td>
                                    <td title={p.txSignature}>{shortAddress(p.txSignature)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
