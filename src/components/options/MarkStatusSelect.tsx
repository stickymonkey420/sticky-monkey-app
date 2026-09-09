import type { OpenPosition } from "@/lib/options/types";

type MarkStatusSelectProps = {
  position: OpenPosition;
  onExpired: () => void;
  onAssigned: () => void;
  onBoughtToClose: () => void;
  onRoll: () => void;
  disabled?: boolean;
};

// Per-row "Mark as..." select for the Open Positions table -- ported from
// markSelect()/handleTbodyChange() in the live Webflow page's script
// (project doc `claude/roll-positions-options-script.html`). Only
// rendered for wheel_trades rows (LEAPs have no status/close workflow,
// matching the script's `if (p.source !== "wheel") return "";`).
// "Expired worthless" and the assignment outcome are simple confirm +
// mutate actions handled directly by the caller; "Bought to close" and
// "Roll" open their own modals since they need further numeric input.
// The select always renders at its placeholder value -- selecting an
// option immediately dispatches the corresponding callback and the
// caller decides what (if anything) re-renders, mirroring the script's
// `sel.value = ""` reset after every choice.
export default function MarkStatusSelect({
  position,
  onExpired,
  onAssigned,
  onBoughtToClose,
  onRoll,
  disabled,
}: MarkStatusSelectProps) {
  if (position.source !== "wheel") return null;
  const assignLabel = position.type === "CSP" ? "Assigned" : "Called away";

  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        const value = e.target.value;
        e.currentTarget.value = "";
        if (value === "expired") onExpired();
        else if (value === "assigned") onAssigned();
        else if (value === "closed") onBoughtToClose();
        else if (value === "roll") onRoll();
      }}
      className="w-full rounded-md border border-[#2a2f3f] bg-[#0d0f17] px-2 py-1 text-xs text-text-primary disabled:opacity-50"
    >
      <option value="">Mark as...</option>
      <option value="expired">Expired worthless</option>
      <option value="assigned">{assignLabel}</option>
      <option value="closed">Bought to close</option>
      <option value="roll">Roll to new strike/expiration</option>
    </select>
  );
}
