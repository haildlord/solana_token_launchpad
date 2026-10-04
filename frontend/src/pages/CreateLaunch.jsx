import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "../toast.jsx";
import { ErrorBox, Field } from "../components/ui.jsx";
import ImagePicker from "../components/ImagePicker.jsx";
import { toLocalInput } from "../utils.js";

const DAY = 24 * 60 * 60 * 1000;

export default function CreateLaunch() {
    const { token } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: "",
        symbol: "",
        description: "",
        totalSupply: "",
        pricePerToken: "",
        maxPerWallet: "",
        startsAt: toLocalInput(Date.now()),
        endsAt: toLocalInput(Date.now() + 8 * DAY),
    });
    const [image, setImage] = useState(null);
    const [useTiers, setUseTiers] = useState(false);
    const [tiers, setTiers] = useState([{ minAmount: "0", maxAmount: "", pricePerToken: "" }]);
    const [useVesting, setUseVesting] = useState(false);
    const [vesting, setVesting] = useState({ cliffDays: "30", vestingDays: "180", tgePercent: "10" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
    const setTier = (i, key) => (e) => setTiers(tiers.map((t, n) => (n === i ? { ...t, [key]: e.target.value } : t)));

    function addTier() {
        const last = tiers[tiers.length - 1];
        setTiers([...tiers, { minAmount: last?.maxAmount || "0", maxAmount: "", pricePerToken: "" }]);
    }

    function buildBody() {
        const num = (v, label) => {
            if (v === "" || Number.isNaN(Number(v))) throw new Error(`${label} must be a number.`);
            return Number(v);
        };

        const body = {
            name: form.name.trim(),
            symbol: form.symbol.trim().toUpperCase(),
            description: form.description.trim(),
            totalSupply: num(form.totalSupply, "Total supply"),
            pricePerToken: num(form.pricePerToken, "Price"),
            maxPerWallet: num(form.maxPerWallet, "Max per user"),
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString(),
        };

        if (!body.name || !body.symbol || !body.description) throw new Error("Name, symbol and description are required.");
        if (body.totalSupply <= 0 || body.pricePerToken <= 0 || body.maxPerWallet <= 0) {
            throw new Error("Supply, price and max per user must be greater than 0.");
        }
        if (new Date(body.endsAt) <= new Date(body.startsAt)) throw new Error("The end date must be after the start date.");

        if (useTiers) {
            body.tiers = tiers.map((t, i) => {
                const tier = {
                    minAmount: num(t.minAmount, `Tier ${i + 1} from`),
                    maxAmount: num(t.maxAmount, `Tier ${i + 1} to`),
                    pricePerToken: num(t.pricePerToken, `Tier ${i + 1} price`),
                };
                if (tier.maxAmount <= tier.minAmount) throw new Error(`Tier ${i + 1}: "to" must be bigger than "from".`);
                return tier;
            });
        }

        if (useVesting) {
            body.vesting = {
                cliffDays: num(vesting.cliffDays, "Cliff days"),
                vestingDays: num(vesting.vestingDays, "Vesting days"),
                tgePercent: num(vesting.tgePercent, "TGE percent"),
            };
            if (body.vesting.tgePercent < 0 || body.vesting.tgePercent > 100) throw new Error("TGE percent must be between 0 and 100.");
        }
        return body;
    }

    async function submit(e) {
        e.preventDefault();
        setError("");

        let body;
        try {
            body = buildBody();
        } catch (err) {
            return setError(err.message);
        }

        setBusy(true);
        try {
            const launch = await api.createLaunch(token, body);
            if (image) {
                try {
                    await api.uploadImage(token, launch.id, image);
                } catch (err) {
                    toast(`Launch created, but the image was not saved: ${err.message}`, "error");
                }
            }
            toast("Launch created");
            navigate(`/launches/${launch.id}`);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="container narrow section">
            <h1>Create a launch</h1>
            <p className="muted">Fill in the details of your token sale. You can add a whitelist and referral codes after it is created.</p>

            <form onSubmit={submit} className="stack-lg">
                {error && <ErrorBox>{error}</ErrorBox>}

                <section className="card form-section">
                    <h2>Token details</h2>
                    <ImagePicker file={image} onChange={setImage} onError={setError} />
                    <div className="form-row">
                        <Field label="Name">
                            <input className="input" value={form.name} onChange={set("name")} placeholder="Moon Token" required />
                        </Field>
                        <Field label="Symbol" hint="Must be unique">
                            <input className="input" value={form.symbol} onChange={set("symbol")} placeholder="MOON" maxLength={12} required />
                        </Field>
                    </div>
                    <Field label="Description">
                        <textarea className="input" rows={4} value={form.description} onChange={set("description")} placeholder="What is this project about?" required />
                    </Field>
                </section>

                <section className="card form-section">
                    <h2>Sale settings</h2>
                    <div className="form-row">
                        <Field label="Total supply">
                            <input className="input" type="number" min="0" step="any" value={form.totalSupply} onChange={set("totalSupply")} placeholder="1000000" required />
                        </Field>
                        <Field label="Price per token (SOL)" hint="Used for any amount beyond the tiers">
                            <input className="input" type="number" min="0" step="any" value={form.pricePerToken} onChange={set("pricePerToken")} placeholder="0.05" required />
                        </Field>
                    </div>
                    <Field label="Max tokens per user" hint="Counted across all wallets of the same user">
                        <input className="input" type="number" min="0" step="any" value={form.maxPerWallet} onChange={set("maxPerWallet")} placeholder="10000" required />
                    </Field>
                    <div className="form-row">
                        <Field label="Starts at">
                            <input className="input" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} required />
                        </Field>
                        <Field label="Ends at">
                            <input className="input" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} required />
                        </Field>
                    </div>
                </section>

                <section className="card form-section">
                    <div className="toggle-row">
                        <div>
                            <h2>Tiered pricing</h2>
                            <p className="muted">Cheaper early tokens. Tiers fill in order, and anything left over uses the price above.</p>
                        </div>
                        <input type="checkbox" className="switch" checked={useTiers} onChange={(e) => setUseTiers(e.target.checked)} aria-label="Use tiered pricing" />
                    </div>
                    {useTiers && (
                        <div className="stack">
                            {tiers.map((tier, i) => (
                                <div className="tier-row" key={i}>
                                    <Field label={i === 0 ? "From" : ""}>
                                        <input className="input" type="number" min="0" step="any" value={tier.minAmount} onChange={setTier(i, "minAmount")} aria-label={`Tier ${i + 1} from`} />
                                    </Field>
                                    <Field label={i === 0 ? "To" : ""}>
                                        <input className="input" type="number" min="0" step="any" value={tier.maxAmount} onChange={setTier(i, "maxAmount")} aria-label={`Tier ${i + 1} to`} />
                                    </Field>
                                    <Field label={i === 0 ? "Price (SOL)" : ""}>
                                        <input className="input" type="number" min="0" step="any" value={tier.pricePerToken} onChange={setTier(i, "pricePerToken")} aria-label={`Tier ${i + 1} price`} />
                                    </Field>
                                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setTiers(tiers.filter((_, n) => n !== i))} disabled={tiers.length === 1}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button type="button" className="btn btn-ghost btn-small align-start" onClick={addTier}>
                                Add tier
                            </button>
                        </div>
                    )}
                </section>

                <section className="card form-section">
                    <div className="toggle-row">
                        <div>
                            <h2>Vesting</h2>
                            <p className="muted">Lock part of what buyers receive and release it over time.</p>
                        </div>
                        <input type="checkbox" className="switch" checked={useVesting} onChange={(e) => setUseVesting(e.target.checked)} aria-label="Use vesting" />
                    </div>
                    {useVesting && (
                        <div className="form-row three">
                            <Field label="Unlocked at TGE (%)">
                                <input className="input" type="number" min="0" max="100" value={vesting.tgePercent} onChange={(e) => setVesting({ ...vesting, tgePercent: e.target.value })} />
                            </Field>
                            <Field label="Cliff (days)">
                                <input className="input" type="number" min="0" value={vesting.cliffDays} onChange={(e) => setVesting({ ...vesting, cliffDays: e.target.value })} />
                            </Field>
                            <Field label="Vesting (days)">
                                <input className="input" type="number" min="0" value={vesting.vestingDays} onChange={(e) => setVesting({ ...vesting, vestingDays: e.target.value })} />
                            </Field>
                        </div>
                    )}
                </section>

                <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={busy}>
                        {busy ? "Creating..." : "Create launch"}
                    </button>
                </div>
            </form>
        </div>
    );
}
