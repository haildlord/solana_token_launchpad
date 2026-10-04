import { useState } from "react";
import { STATUS_LABEL } from "../utils.js";

export function StatusBadge({ status }) {
    return (
        <span className={`status status-${status.toLowerCase()}`}>
            <i aria-hidden="true" />
            {STATUS_LABEL[status] || status}
        </span>
    );
}

export function ProgressBar({ percent, label }) {
    return (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
    );
}

export function Spinner({ label = "Loading" }) {
    return (
        <div className="center-block" role="status">
            <div className="spinner" />
            <span className="muted">{label}...</span>
        </div>
    );
}

export function ErrorBox({ children, onRetry }) {
    return (
        <div className="alert alert-error" role="alert">
            <span>{children}</span>
            {onRetry && (
                <button className="btn btn-small btn-ghost" onClick={onRetry}>
                    Try again
                </button>
            )}
        </div>
    );
}

export function EmptyState({ title, children }) {
    return (
        <div className="empty">
            <strong>{title}</strong>
            {children && <p className="muted">{children}</p>}
        </div>
    );
}

// Shows the uploaded picture. If there is none (or it fails to load) we draw a
// coloured tile with the first letters of the symbol, so cards never look empty.
export function TokenImage({ launch, size = "card" }) {
    const [failed, setFailed] = useState(false);
    const hue = [...launch.symbol].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) * 7 % 360;

    return (
        <div className={`token-image token-image-${size}`}>
            {launch.imageUrl && !failed ? (
                <img src={launch.imageUrl} alt={`${launch.name} logo`} loading="lazy" onError={() => setFailed(true)} />
            ) : (
                <div
                    className="token-fallback"
                    style={{ background: `hsl(${hue} 32% 32%)` }}
                    aria-hidden="true"
                >
                    {launch.symbol.slice(0, 3).toUpperCase()}
                </div>
            )}
        </div>
    );
}

export function Tabs({ tabs, active, onChange }) {
    return (
        <div className="tabs" role="tablist">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active === tab.id}
                    className={`tab ${active === tab.id ? "tab-active" : ""}`}
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

export function Field({ label, hint, children }) {
    return (
        <label className="field">
            <span className="field-label">{label}</span>
            {children}
            {hint && <span className="field-hint">{hint}</span>}
        </label>
    );
}

export function Pagination({ page, total, limit, onChange }) {
    const pages = Math.max(1, Math.ceil(total / limit));
    if (pages <= 1) return null;
    return (
        <nav className="pagination" aria-label="Pages">
            <button className="btn btn-ghost btn-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
                Previous
            </button>
            <span className="muted">
                Page {page} of {pages}
            </span>
            <button className="btn btn-ghost btn-small" disabled={page >= pages} onClick={() => onChange(page + 1)}>
                Next
            </button>
        </nav>
    );
}
