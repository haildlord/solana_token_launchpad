import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "../toast.jsx";
import { EmptyState, ErrorBox, Field, Spinner } from "./ui.jsx";
import ImagePicker from "./ImagePicker.jsx";
import { fmtNumber, toLocalInput } from "../utils.js";

// Everything only the creator of the launch can do
export default function ManagePanel({ launch, onChanged }) {
    return (
        <div className="stack-lg">
            <ImageSection launch={launch} onChanged={onChanged} />
            <WhitelistSection launch={launch} />
            <ReferralSection launch={launch} />
            <EditSection launch={launch} onChanged={onChanged} />
        </div>
    );
}

function ImageSection({ launch, onChanged }) {
    const { token } = useAuth();
    const toast = useToast();
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function save() {
        setBusy(true);
        setError("");
        try {
            await api.uploadImage(token, launch.id, file);
            toast("Image updated");
            setFile(null);
            onChanged();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="stack">
            <h3>Token image</h3>
            {error && <ErrorBox>{error}</ErrorBox>}
            <ImagePicker file={file} currentUrl={launch.imageUrl} onChange={setFile} onError={setError} />
            {file && (
                <button className="btn btn-primary btn-small align-start" onClick={save} disabled={busy}>
                    {busy ? "Uploading..." : "Save image"}
                </button>
            )}
        </section>
    );
}

function WhitelistSection({ launch }) {
    const { token } = useAuth();
    const toast = useToast();
    const [list, setList] = useState(null);
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setList((await api.getWhitelist(token, launch.id)).addresses);
        } catch (err) {
            setError(err.message);
        }
    }, [token, launch.id]);

    useEffect(() => {
        load();
    }, [load]);

    async function add(e) {
        e.preventDefault();
        const addresses = text.split(/[\s,]+/).filter(Boolean);
        if (addresses.length === 0) return;
        setBusy(true);
        setError("");
        try {
            const res = await api.addWhitelist(token, launch.id, addresses);
            toast(`${res.added} address${res.added === 1 ? "" : "es"} added`);
            setText("");
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function remove(address) {
        try {
            await api.removeWhitelist(token, launch.id, address);
            setList((current) => current.filter((a) => a !== address));
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <section className="stack">
            <h3>Whitelist</h3>
            <p className="muted">When the list is empty anyone can buy. Once you add an address, only listed wallets can buy.</p>
            {error && <ErrorBox>{error}</ErrorBox>}
            <form onSubmit={add} className="stack">
                <Field label="Add addresses" hint="Separate them with spaces, commas or new lines">
                    <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
                <button className="btn btn-primary btn-small align-start" disabled={busy || !text.trim()}>
                    Add to whitelist
                </button>
            </form>
            {list === null ? (
                <Spinner />
            ) : list.length === 0 ? (
                <EmptyState title="Whitelist is empty" />
            ) : (
                <ul className="list">
                    {list.map((address) => (
                        <li key={address}>
                            <code>{address}</code>
                            <button className="link-button danger" onClick={() => remove(address)}>
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function ReferralSection({ launch }) {
    const { token } = useAuth();
    const toast = useToast();
    const [list, setList] = useState(null);
    const [form, setForm] = useState({ code: "", discountPercent: "10", maxUses: "100" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.getReferrals(token, launch.id);
            setList(Array.isArray(res) ? res : res.referrals);
        } catch (err) {
            setError(err.message);
        }
    }, [token, launch.id]);

    useEffect(() => {
        load();
    }, [load]);

    async function create(e) {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await api.createReferral(token, launch.id, {
                code: form.code.trim(),
                discountPercent: Number(form.discountPercent),
                maxUses: Number(form.maxUses),
            });
            toast("Referral code created");
            setForm({ ...form, code: "" });
            load();
        } catch (err) {
            setError(err.status === 409 ? "That code already exists for this launch." : err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="stack">
            <h3>Referral codes</h3>
            {error && <ErrorBox>{error}</ErrorBox>}
            <form onSubmit={create} className="form-row three align-end">
                <Field label="Code">
                    <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
                </Field>
                <Field label="Discount (%)">
                    <input className="input" type="number" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} required />
                </Field>
                <Field label="Max uses">
                    <input className="input" type="number" min="1" step="1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} required />
                </Field>
                <button className="btn btn-primary btn-small align-start" disabled={busy}>
                    Create code
                </button>
            </form>
            {list === null ? (
                <Spinner />
            ) : list.length === 0 ? (
                <EmptyState title="No referral codes yet" />
            ) : (
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th className="num">Discount</th>
                                <th className="num">Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((r) => (
                                <tr key={r.id}>
                                    <td>
                                        <code>{r.code}</code>
                                    </td>
                                    <td className="num">{fmtNumber(r.discountPercent)}%</td>
                                    <td className="num">
                                        {r.usedCount} / {r.maxUses}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function EditSection({ launch, onChanged }) {
    const { token } = useAuth();
    const toast = useToast();
    const [form, setForm] = useState({
        name: launch.name,
        description: launch.description,
        pricePerToken: String(launch.pricePerToken),
        totalSupply: String(launch.totalSupply),
        maxPerWallet: String(launch.maxPerWallet),
        startsAt: toLocalInput(launch.startsAt),
        endsAt: toLocalInput(launch.endsAt),
    });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function save(e) {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            await api.updateLaunch(token, launch.id, {
                name: form.name.trim(),
                description: form.description.trim(),
                pricePerToken: Number(form.pricePerToken),
                totalSupply: Number(form.totalSupply),
                maxPerWallet: Number(form.maxPerWallet),
                startsAt: new Date(form.startsAt).toISOString(),
                endsAt: new Date(form.endsAt).toISOString(),
            });
            toast("Launch updated");
            onChanged();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="stack">
            <h3>Edit details</h3>
            {error && <ErrorBox>{error}</ErrorBox>}
            <form onSubmit={save} className="stack">
                <Field label="Name">
                    <input className="input" value={form.name} onChange={set("name")} required />
                </Field>
                <Field label="Description">
                    <textarea className="input" rows={3} value={form.description} onChange={set("description")} required />
                </Field>
                <div className="form-row three">
                    <Field label="Price (SOL)">
                        <input className="input" type="number" min="0" step="any" value={form.pricePerToken} onChange={set("pricePerToken")} required />
                    </Field>
                    <Field label="Total supply">
                        <input className="input" type="number" min="0" step="any" value={form.totalSupply} onChange={set("totalSupply")} required />
                    </Field>
                    <Field label="Max per user">
                        <input className="input" type="number" min="0" step="any" value={form.maxPerWallet} onChange={set("maxPerWallet")} required />
                    </Field>
                </div>
                <div className="form-row">
                    <Field label="Starts at">
                        <input className="input" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} required />
                    </Field>
                    <Field label="Ends at">
                        <input className="input" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} required />
                    </Field>
                </div>
                <button className="btn btn-primary btn-small align-start" disabled={busy}>
                    {busy ? "Saving..." : "Save changes"}
                </button>
            </form>
        </section>
    );
}
