import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ErrorBox, ProgressBar, Spinner, StatusBadge, Tabs, TokenImage } from "../components/ui.jsx";
import BuyPanel from "../components/BuyPanel.jsx";
import VestingPanel, { Stat } from "../components/VestingPanel.jsx";
import PurchasesPanel from "../components/PurchasesPanel.jsx";
import ManagePanel from "../components/ManagePanel.jsx";
import { fmtDate, fmtNumber, percentSold, timeNote } from "../utils.js";

export default function LaunchDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const [launch, setLaunch] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState("purchases");
    const [refreshKey, setRefreshKey] = useState(0);

    const load = useCallback(async () => {
        try {
            setLaunch(await api.getLaunch(id));
            setError(null);
        } catch (err) {
            setError(err);
        }
    }, [id]);

    useEffect(() => {
        setLaunch(null);
        load();
    }, [load]);

    function afterChange() {
        load();
        setRefreshKey((k) => k + 1);
    }

    if (error) {
        return (
            <div className="container section stack">
                <Link to="/" className="back-link">
                    Back to launches
                </Link>
                {error.status === 404 || error.status === 400 ? (
                    <div className="center-block">
                        <h1>Launch not found</h1>
                        <p className="muted">This launch does not exist or was removed.</p>
                    </div>
                ) : (
                    <ErrorBox onRetry={load}>{error.message}</ErrorBox>
                )}
            </div>
        );
    }

    if (!launch) return <Spinner label="Loading launch" />;

    const isCreator = !!user && user.id === launch.creatorId;
    const percent = percentSold(launch);
    const tabs = [
        { id: "purchases", label: isCreator ? "Purchases" : "My purchases" },
        { id: "vesting", label: "Vesting" },
        ...(isCreator ? [{ id: "manage", label: "Manage" }] : []),
    ];

    return (
        <div className="container section">
            <Link to="/" className="back-link">
                Back to launches
            </Link>

            <header className="detail-head">
                <TokenImage launch={launch} size="large" />
                <div className="detail-title">
                    <div className="detail-title-row">
                        <h1>{launch.name}</h1>
                        <StatusBadge status={launch.status} />
                    </div>
                    <span className="symbol">${launch.symbol}</span>
                    <p className="detail-desc">{launch.description}</p>
                </div>
            </header>

            <div className="detail-grid">
                <div className="stack-lg">
                    <section className="card stack">
                        <div className="stats">
                            <Stat label="Price" value={`${fmtNumber(launch.pricePerToken)} SOL`} />
                            <Stat label="Total supply" value={fmtNumber(launch.totalSupply, 0)} />
                            <Stat label="Sold" value={fmtNumber(launch.totalPurchased, 0)} />
                            <Stat label="Max per user" value={fmtNumber(launch.maxPerWallet, 0)} />
                        </div>
                        <div>
                            <ProgressBar percent={percent} label="Sold" />
                            <div className="progress-row">
                                <span>{percent.toFixed(1)}% sold</span>
                                <span className="muted">{timeNote(launch)}</span>
                            </div>
                        </div>
                        <dl className="dates">
                            <div>
                                <dt>Starts</dt>
                                <dd>{fmtDate(launch.startsAt)}</dd>
                            </div>
                            <div>
                                <dt>Ends</dt>
                                <dd>{fmtDate(launch.endsAt)}</dd>
                            </div>
                        </dl>
                    </section>

                    {launch.tiers?.length > 0 && (
                        <section className="card stack">
                            <h2>Pricing tiers</h2>
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Tier</th>
                                            <th className="num">From</th>
                                            <th className="num">To</th>
                                            <th className="num">Price (SOL)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {launch.tiers.map((t, i) => (
                                            <tr key={i}>
                                                <td>{i + 1}</td>
                                                <td className="num">{fmtNumber(t.minAmount)}</td>
                                                <td className="num">{fmtNumber(t.maxAmount)}</td>
                                                <td className="num">{fmtNumber(t.pricePerToken)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="muted">Tokens beyond the last tier cost {fmtNumber(launch.pricePerToken)} SOL each.</p>
                        </section>
                    )}

                    {launch.vesting && (
                        <section className="card stack">
                            <h2>Vesting schedule</h2>
                            <div className="stats">
                                <Stat label="Unlocked at TGE" value={`${launch.vesting.tgePercent}%`} />
                                <Stat label="Cliff" value={`${launch.vesting.cliffDays} days`} />
                                <Stat label="Linear vesting" value={`${launch.vesting.vestingDays} days`} />
                            </div>
                        </section>
                    )}

                    <section className="card stack">
                        <Tabs tabs={tabs} active={tab} onChange={setTab} />
                        {tab === "purchases" && <PurchasesPanel launch={launch} isCreator={isCreator} refreshKey={refreshKey} />}
                        {tab === "vesting" && <VestingPanel launch={launch} />}
                        {tab === "manage" && isCreator && <ManagePanel launch={launch} onChanged={afterChange} />}
                    </section>
                </div>

                <BuyPanel launch={launch} onBought={afterChange} />
            </div>
        </div>
    );
}
