import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import LaunchRow from "../components/LaunchRow.jsx";
import { EmptyState, ErrorBox, Pagination, Spinner } from "../components/ui.jsx";
import { useAuth } from "../auth.jsx";

const LIMIT = 10;
const FILTERS = [
    { value: "", label: "All" },
    { value: "ACTIVE", label: "Live" },
    { value: "UPCOMING", label: "Upcoming" },
    { value: "ENDED", label: "Ended" },
    { value: "SOLD_OUT", label: "Sold out" },
];

// Three numbers for the top of the page. They come from the same list endpoint (limit 1, we only read total).
function useMarketStats() {
    const [stats, setStats] = useState(null);
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            api.listLaunches({ limit: 1 }),
            api.listLaunches({ limit: 1, status: "ACTIVE" }),
            api.listLaunches({ limit: 1, status: "UPCOMING" }),
        ])
            .then(([all, live, upcoming]) => {
                if (!cancelled) setStats({ all: all.total, live: live.total, upcoming: upcoming.total });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);
    return stats;
}

export default function Launches() {
    const { token } = useAuth();
    const [params, setParams] = useSearchParams();
    const status = params.get("status") || "";
    const page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    const stats = useMarketStats();

    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await api.listLaunches({ page, limit: LIMIT, status }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [page, status]);

    useEffect(() => {
        load();
    }, [load]);

    function update(next) {
        const merged = { status, page: 1, ...next };
        const out = {};
        if (merged.status) out.status = merged.status;
        if (merged.page > 1) out.page = merged.page;
        setParams(out);
    }

    const show = (n) => (stats ? n.toLocaleString() : "-");

    return (
        <>
            <section className="hero">
                <div className="container hero-inner">
                    <div className="hero-copy">
                        <span className="eyebrow">Token launches on Solana</span>
                        <h1>Fair, transparent token sales. Run by the book.</h1>
                        <p className="hero-sub">
                            Join early rounds with tiered pricing, redeem referral discounts and follow your vesting schedule, all in one place.
                        </p>
                        <div className="hero-actions">
                            <a href="#launches" className="btn btn-gold">
                                Browse launches
                            </a>
                            <Link to={token ? "/create" : "/register"} className="btn btn-ghost">
                                {token ? "Create a launch" : "Create an account"}
                            </Link>
                        </div>
                    </div>

                    <dl className="hero-stats">
                        <div>
                            <dt>Total launches</dt>
                            <dd>{show(stats?.all ?? 0)}</dd>
                        </div>
                        <div>
                            <dt>Live now</dt>
                            <dd>{show(stats?.live ?? 0)}</dd>
                        </div>
                        <div>
                            <dt>Starting soon</dt>
                            <dd>{show(stats?.upcoming ?? 0)}</dd>
                        </div>
                    </dl>
                </div>
            </section>

            <section className="container section" id="launches">
                <div className="section-head">
                    <h2>Launches</h2>
                    <div className="filters" role="group" aria-label="Filter by status">
                        {FILTERS.map((f) => (
                            <button
                                key={f.value}
                                className={`chip ${status === f.value ? "chip-active" : ""}`}
                                aria-pressed={status === f.value}
                                onClick={() => update({ status: f.value })}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
                {loading && !data && <Spinner label="Loading launches" />}

                {data && (
                    <div className={loading ? "dim" : ""}>
                        {data.launches.length === 0 ? (
                            <EmptyState title="No launches here yet">
                                {status ? "Try another filter." : "Be the first to create one."}
                            </EmptyState>
                        ) : (
                            <div className="table-list">
                                <div className="row row-head" aria-hidden="true">
                                    <span>Project</span>
                                    <span>Status</span>
                                    <span>Price</span>
                                    <span>Sold</span>
                                    <span>Timing</span>
                                </div>
                                {data.launches.map((launch) => (
                                    <LaunchRow key={launch.id} launch={launch} />
                                ))}
                            </div>
                        )}
                        <Pagination page={data.page} total={data.total} limit={data.limit} onChange={(p) => update({ page: p })} />
                    </div>
                )}
            </section>
        </>
    );
}
