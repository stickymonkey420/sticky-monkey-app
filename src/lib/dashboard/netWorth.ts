import type {
  ManualAccount,
  NetWorthBucketName,
  NetWorthSummary,
} from "@/lib/types/dashboard";

// Ported 1:1 from the live Webflow Dashboard page's Net Worth + Asset
// Allocation widget (head-code script, "nw-*" elements). Same bucket names,
// same account-name -> bucket mapping, same fallback-by-category rules.

// Exact hex values sampled (getComputedStyle) from the live Webflow
// Dashboard's Asset Allocation donut + legend dots -- these must match the
// live site pixel-for-pixel, not just be "close" colors from the app's own
// palette.
export const CATEGORY_COLORS: Record<NetWorthBucketName, string> = {
  Equities: "#219653",
  "Personal Vault": "#f2c14e",
  "IRA Traditional": "#2d9cdb",
  "IRA Roth": "#e67e22",
  "Self-Directed IRA": "#eb5757",
  "401(k)": "#9b51e0",
  Crypto: "#f472b6",
  "Cash & Bank": "#3ddc97",
};

// account_name (case-insensitive, trimmed) -> bucket name
const NAME_TO_BUCKET: Record<string, NetWorthBucketName> = {
  "sofi self-directed": "Equities",
  "robinhood individual": "Equities",
  "home safe": "Personal Vault",
  "robinhood traditional ira": "IRA Traditional",
  "robinhood roth ira": "IRA Roth",
  "sdira traditional": "Self-Directed IRA",
  crypto: "Crypto",
};

function bucketByType(a: ManualAccount, nameKey: string): NetWorthBucketName | null {
  const sub = (a.account_subtype || "").toLowerCase();
  const ret = (a.retirement_type || "").toLowerCase();
  if (a.category === "precious_metal") return "Personal Vault";
  if (a.category === "brokerage_account") {
    return sub.includes("crypto") || nameKey.includes("crypto") ? "Crypto" : "Equities";
  }
  if (a.category === "retirement_account") {
    if (ret === "self_directed_ira" || nameKey.includes("sdira") || nameKey.includes("self-directed ira")) return "Self-Directed IRA";
    if (ret === "roth" || sub === "roth" || nameKey.includes("roth")) return "IRA Roth";
    if (ret === "401k" || sub === "401k" || sub === "403b" || nameKey.includes("401")) return "401(k)";
    return "IRA Traditional";
  }
  return null;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "$0";
  return "$" + Math.round(Number(n)).toLocaleString("en-US");
}

export function summarizeNetWorth(accounts: ManualAccount[]): NetWorthSummary {
  const buckets: Record<NetWorthBucketName, number> = {
    Equities: 0,
    "Personal Vault": 0,
    "IRA Traditional": 0,
    "IRA Roth": 0,
    "Self-Directed IRA": 0,
    "401(k)": 0,
    Crypto: 0,
    "Cash & Bank": 0,
  };
  let liabilities = 0;

  (accounts || []).forEach((a) => {
    const bal = Number(a.balance) || 0;
    const nameKey = (a.account_name || "").trim().toLowerCase();
    const bucket = NAME_TO_BUCKET[nameKey];
    if (bucket) {
      buckets[bucket] += bal;
    } else if (a.category === "bank_account" || a.category === "business_account") {
      buckets["Cash & Bank"] += bal;
    } else if (a.category === "credit_card") {
      liabilities += bal;
    } else {
      // Any other asset account is bucketed by its type instead of being
      // silently dropped (previously only the exact names above counted, so
      // e.g. a "Joint Brokerage" or "401(k)" never reached Asset Allocation).
      const fallback = bucketByType(a, nameKey);
      if (fallback) buckets[fallback] += bal;
    }
  });

  const categories = (Object.keys(buckets) as NetWorthBucketName[])
    .map((name) => ({ name, value: buckets[name] }))
    .filter((c) => c.value > 0);

  const totalAssets = (Object.keys(buckets) as NetWorthBucketName[]).reduce(
    (sum, k) => sum + buckets[k],
    0
  );
  const totalLiabilities = liabilities;
  const netWorth = totalAssets - totalLiabilities;

  return { categories, totalAssets, totalLiabilities, netWorth };
}
