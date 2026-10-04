import { Link } from "react-router-dom";
import { ProgressBar, StatusBadge, TokenImage } from "./ui.jsx";
import { fmtNumber, percentSold, timeNote } from "../utils.js";

// One line of the launch table. On small screens the cells wrap into a card.
export default function LaunchRow({ launch }) {
    const percent = percentSold(launch);
    return (
        <Link to={`/launches/${launch.id}`} className="row">
            <div className="row-project">
                <TokenImage launch={launch} />
                <div className="row-name">
                    <strong>{launch.name}</strong>
                    <span className="symbol">${launch.symbol}</span>
                </div>
            </div>
            <div className="row-cell" data-label="Status">
                <StatusBadge status={launch.status} />
            </div>
            <div className="row-cell" data-label="Price">
                <strong className="mono">{fmtNumber(launch.pricePerToken)} SOL</strong>
            </div>
            <div className="row-cell row-progress" data-label="Sold">
                <ProgressBar percent={percent} label={`${launch.name} sold`} />
                <span className="mono small">
                    {percent.toFixed(1)}% of {fmtNumber(launch.totalSupply, 0)}
                </span>
            </div>
            <div className="row-cell row-time" data-label="Timing">
                <span>{timeNote(launch)}</span>
            </div>
        </Link>
    );
}
