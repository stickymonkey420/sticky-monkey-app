import {
  count,
  daysBetween,
  hoursBetween,
  IRS_MILEAGE_RATE,
  is,
  num,
  ratio,
  sum,
  type GigCollection,
  type GigConfig,
  type RecordData,
} from "../schema";

// Home & Personal Services + Skilled Trades.
//
// Most of these trades keep the generic job board (Lead -> Completed), and
// COMPLETED job amounts are already counted as income by the app. So for
// those trades nothing below counts income: collections hold what the board
// can't (estimates, materials and parts, miles, permits, recurring routes,
// equipment, licenses). Carpenter custom orders, interior design projects
// and studio bookings don't fit the board, so those configs turn it off and
// count income in their own collections instead.

// ---------- shared helpers ----------

// Local YYYY-MM-DD, optionally offset by N days (for "due soon" KPIs).
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const dayOf = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");

// Signed days from today until a date (negative = past).
function daysUntil(v: unknown): number | null {
  const day = dayOf(v);
  if (!day) return null;
  const ms = new Date(day + "T00:00:00").getTime() - new Date(isoDay() + "T00:00:00").getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

// Date is within the next N days, or already past.
const dueWithin = (key: string, days: number) => (d: RecordData) => {
  const v = dayOf(d[key]);
  return v !== "" && v <= isoDay(days);
};

// Date is today or later.
const upcoming = (key: string) => (d: RecordData) => {
  const v = dayOf(d[key]);
  return v !== "" && v >= isoDay();
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

// Recurring visits per month and days between visits, by frequency option.
const VISITS_PER_MONTH: Record<string, number> = {
  Weekly: 52 / 12,
  Biweekly: 26 / 12,
  "Every 10 days": 36.5 / 12,
  "Every 4 weeks": 13 / 12,
  Monthly: 1,
};
const DAYS_BETWEEN_VISITS: Record<string, number> = {
  Weekly: 7,
  Biweekly: 14,
  "Every 10 days": 10,
  "Every 4 weeks": 28,
  Monthly: 365 / 12,
};
const visitsPerMonth = (d: RecordData) => VISITS_PER_MONTH[String(d.frequency ?? "")] ?? 0;

// ---------- mileage (IRS standard rate) ----------

const tripMiles = (d: RecordData) => num(d.miles) * (d.round_trip === true ? 2 : 1);
const tripDeduction = (d: RecordData) => tripMiles(d) * IRS_MILEAGE_RATE + num(d.tolls_parking);

function mileageLog(clientSingular: string, placeholder: string): GigCollection {
  return {
    key: "mileage",
    label: "Mileage",
    singular: "Trip",
    description: "Business miles at the IRS standard rate. If you use the standard rate for a vehicle, don't also deduct its gas or repairs.",
    titleField: "purpose",
    dateField: "date",
    sort: { field: "date", dir: "desc" },
    fields: [
      { key: "purpose", label: "Trip", type: "text", required: true, placeholder },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "client", label: clientSingular, type: "client" },
      { key: "miles", label: "Miles", type: "number", unit: "mi", required: true, list: true },
      { key: "round_trip", label: "Round trip (count the miles twice)", type: "bool", default: false },
      { key: "tolls_parking", label: "Tolls & parking", type: "money", help: "Deductible on top of the mileage rate" },
    ],
    computed: [
      { key: "total_miles", label: "Total miles", format: "number", fn: tripMiles },
      { key: "deduction", label: "Deduction", format: "money", fn: tripDeduction },
    ],
    expense: tripDeduction,
  };
}

// ---------- estimates (handyman, electrician, plumber) ----------

const estLabor = (d: RecordData) => num(d.labor_hours) * num(d.labor_rate);
const estMaterialsBilled = (d: RecordData) => num(d.materials) * (1 + num(d.markup_pct) / 100);
const estimateTotal = (d: RecordData) => estLabor(d) + estMaterialsBilled(d) + num(d.fees) - num(d.discount);
const openQuotes = (rows: RecordData[]) => sum(rows.filter(is("status", "Sent")), estimateTotal);
const wonQuotes = (rows: RecordData[]) => sum(rows.filter(is("status", "Accepted")), estimateTotal);
const winRate = (rows: RecordData[]) =>
  ratio(count(rows, is("status", "Accepted")), count(rows, is("status", "Accepted", "Declined", "Expired")));

function estimatesLog(o: {
  clientSingular: string;
  jobTypes: string[];
  laborRate: number;
  markup: number;
  placeholder: string;
  scopePlaceholder: string;
}): GigCollection {
  return {
    key: "estimates",
    label: "Estimates",
    singular: "Estimate",
    description: "Quotes before the work is won. Nothing here counts as income: when a quote is accepted, add it to the job board.",
    titleField: "title",
    dateField: "sent_date",
    statusField: "status",
    sort: { field: "sent_date", dir: "desc" },
    fields: [
      { key: "title", label: "Job", type: "text", required: true, placeholder: o.placeholder },
      { key: "est_no", label: "Estimate #", type: "text" },
      { key: "client", label: o.clientSingular, type: "client", list: true },
      { key: "address", label: "Job address", type: "text" },
      { key: "job_type", label: "Job type", type: "select", options: o.jobTypes },
      { key: "scope", label: "Line items / scope", type: "textarea", placeholder: o.scopePlaceholder },
      { key: "labor_hours", label: "Labor", type: "number", unit: "hrs" },
      { key: "labor_rate", label: "Labor rate", type: "money", default: o.laborRate },
      { key: "materials", label: "Materials (your cost)", type: "money" },
      { key: "markup_pct", label: "Materials markup", type: "percent", default: o.markup },
      { key: "fees", label: "Permit / disposal / trip fees", type: "money", help: "Passed through at cost" },
      { key: "discount", label: "Discount", type: "money" },
      { key: "deposit_pct", label: "Deposit required", type: "percent", default: 0 },
      {
        key: "pre_1978",
        label: "Home built before 1978",
        type: "bool",
        default: false,
        help: "Disturbing painted surfaces in pre-1978 homes falls under EPA lead-safe (RRP) rules",
      },
      { key: "status", label: "Status", type: "select", options: ["Draft", "Sent", "Accepted", "Declined", "Expired"], default: "Draft" },
      { key: "sent_date", label: "Sent", type: "date" },
      { key: "valid_until", label: "Valid until", type: "date" },
      { key: "follow_up", label: "Follow up on", type: "date" },
    ],
    computed: [
      { key: "labor", label: "Labor", format: "money", fn: estLabor, list: false },
      { key: "materials_billed", label: "Materials billed", format: "money", fn: estMaterialsBilled, list: false },
      { key: "total", label: "Estimate total", format: "money", fn: estimateTotal },
      { key: "deposit", label: "Deposit due", format: "money", fn: (d) => (num(d.deposit_pct) ? (estimateTotal(d) * num(d.deposit_pct)) / 100 : null), list: false },
      { key: "margin", label: "Gross margin", format: "percent", fn: (d) => ratio(estimateTotal(d) - num(d.materials) - num(d.fees), estimateTotal(d)) },
    ],
  };
}

// ---------- job costs (electrician, plumber) ----------

const jobCost = (d: RecordData) => Math.max(0, num(d.amount) - num(d.returned)) + num(d.miles) * IRS_MILEAGE_RATE;

function jobCostsLog(o: { clientSingular: string; suppliers: string[]; placeholder: string }): GigCollection {
  return {
    key: "job_costs",
    label: "Job costs",
    singular: "Job cost",
    description: "Parts, supply-house runs, equipment rentals, disposal and miles, tied to the job they were for.",
    titleField: "item",
    dateField: "date",
    sort: { field: "date", dir: "desc" },
    fields: [
      { key: "item", label: "Item", type: "text", required: true, placeholder: o.placeholder },
      { key: "date", label: "Date", type: "date", required: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        options: ["Parts / materials", "Equipment rental", "Disposal / haul-away", "Subcontractor", "Mileage", "Other"],
        default: "Parts / materials",
      },
      { key: "job", label: "Job", type: "text", placeholder: "e.g. Elm St, service call" },
      { key: "client", label: o.clientSingular, type: "client" },
      { key: "supplier", label: "Supplier", type: "select", options: o.suppliers },
      { key: "amount", label: "Amount", type: "money", list: true },
      { key: "returned", label: "Returned / credited", type: "money", help: "Unused parts returned to the counter" },
      {
        key: "miles",
        label: "Miles driven",
        type: "number",
        unit: "mi",
        help: "Mileage entries: business miles at the IRS standard rate. Don't also deduct fuel for that vehicle.",
      },
      { key: "receipt_url", label: "Receipt photo link", type: "url" },
    ],
    computed: [{ key: "cost", label: "Deductible cost", format: "money", fn: jobCost }],
    expense: jobCost,
  };
}

// ---------- permits & inspections (electrician, plumber) ----------

const PERMIT_CLOSED = is("status", "Passed / finaled", "Expired / void");

function permitsLog(o: { clientSingular: string; permitTypes: string[]; inspectionTypes: string[] }): GigCollection {
  return {
    key: "permits",
    label: "Permits & inspections",
    singular: "Permit",
    titleField: "job",
    dateField: "applied",
    statusField: "status",
    sort: { field: "applied", dir: "desc" },
    fields: [
      { key: "job", label: "Job / address", type: "text", required: true, placeholder: "e.g. 1820 Elm St - panel upgrade" },
      { key: "permit_no", label: "Permit #", type: "text", list: true },
      { key: "client", label: o.clientSingular, type: "client" },
      { key: "jurisdiction", label: "Jurisdiction", type: "text", placeholder: "e.g. City building department" },
      { key: "permit_type", label: "Permit type", type: "select", options: o.permitTypes },
      { key: "applied", label: "Applied", type: "date", required: true },
      { key: "issued", label: "Issued", type: "date" },
      { key: "expires", label: "Permit expires", type: "date" },
      { key: "fee", label: "Permit fee", type: "money", help: "Deductible; usually passed through on the customer's invoice" },
      { key: "inspection_type", label: "Next / last inspection", type: "select", options: o.inspectionTypes },
      { key: "inspection_date", label: "Inspection date", type: "date", list: true },
      { key: "inspector", label: "Inspector", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Applied", "Issued", "Inspection scheduled", "Failed - corrections", "Passed / finaled", "Expired / void"],
        default: "Applied",
      },
      { key: "corrections", label: "Correction notes", type: "textarea" },
    ],
    computed: [{ key: "days_open", label: "Days open", format: "number", fn: (d) => (PERMIT_CLOSED(d) ? null : daysBetween(d.applied, isoDay())) }],
    expense: (d) => num(d.fee),
  };
}

// ---------- callbacks & warranty (electrician, plumber) ----------

function callbacksLog(o: { clientSingular: string; placeholder: string }): GigCollection {
  return {
    key: "callbacks",
    label: "Callbacks & warranty",
    singular: "Callback",
    description: "Return trips on finished work. Billable repeat work goes on the job board instead.",
    titleField: "issue",
    dateField: "date",
    statusField: "status",
    sort: { field: "date", dir: "desc" },
    fields: [
      { key: "issue", label: "Issue", type: "text", required: true, placeholder: o.placeholder },
      { key: "client", label: o.clientSingular, type: "client", list: true },
      { key: "original_job", label: "Original job", type: "text" },
      { key: "completed_on", label: "Original job completed", type: "date" },
      { key: "date", label: "Callback date", type: "date", required: true },
      {
        key: "cause",
        label: "Cause",
        type: "select",
        options: ["Workmanship", "Defective part", "Customer damage / misuse", "Unrelated new issue", "Could not reproduce"],
      },
      { key: "covered", label: "Covered under my warranty (no charge)", type: "bool", default: true },
      { key: "mfr_claim", label: "Manufacturer warranty claim filed", type: "bool", default: false },
      { key: "parts_cost", label: "Parts used", type: "money" },
      { key: "hours", label: "Unpaid time", type: "number", unit: "hrs" },
      { key: "status", label: "Status", type: "select", options: ["Open", "Scheduled", "Resolved"], default: "Open" },
      { key: "notes", label: "Fix / notes", type: "textarea" },
    ],
    computed: [{ key: "days_after", label: "Days after job", format: "number", fn: (d) => (dayOf(d.completed_on) ? daysBetween(d.completed_on, d.date) : null) }],
    expense: (d) => num(d.parts_cost),
  };
}

// ---------- licenses & insurance renewal tracker ----------

function licensesLog(types: string[], placeholder: string): GigCollection {
  return {
    key: "licenses",
    label: "Licenses & insurance",
    singular: "License / policy",
    description: "Renewal dates for licenses, insurance, bonds and certifications, plus continuing-education hours.",
    titleField: "name",
    dateField: "paid_date",
    sort: { field: "expires", dir: "asc" },
    fields: [
      { key: "name", label: "License / policy", type: "text", required: true, placeholder },
      { key: "type", label: "Type", type: "select", options: types },
      { key: "number", label: "License / policy #", type: "text" },
      { key: "issuer", label: "Issued by", type: "text", placeholder: "e.g. State licensing board, insurer" },
      { key: "expires", label: "Expires", type: "date", required: true, list: true },
      { key: "ce_required", label: "CE hours required", type: "number", unit: "hrs" },
      { key: "ce_done", label: "CE hours done", type: "number", unit: "hrs" },
      { key: "cost", label: "Renewal fee / premium", type: "money" },
      { key: "paid_date", label: "Paid on", type: "date" },
      { key: "doc_url", label: "Copy of license / COI", type: "url" },
    ],
    computed: [
      { key: "days_left", label: "Days left", format: "number", fn: (d) => daysUntil(d.expires) },
      {
        key: "ce_left",
        label: "CE hours left",
        format: "number",
        fn: (d) => (num(d.ce_required) ? Math.max(0, num(d.ce_required) - num(d.ce_done)) : null),
      },
    ],
    expense: (d) => num(d.cost),
  };
}

// ---------- per-trade money helpers ----------

// Handyman
const materialCost = (d: RecordData) => Math.max(0, num(d.amount) - num(d.returned));

// Home organizing
const organizeEstimate = (d: RecordData) =>
  num(d.est_hours) * Math.max(1, num(d.team_size)) * num(d.hourly_rate) + num(d.product_budget);
const productNotReturned = (d: RecordData) => !is("status", "Returned")(d);
const productMarkup = (d: RecordData) => (num(d.charged) ? num(d.charged) - num(d.cost) : 0);

// House cleaning
const perClean = (d: RecordData) => num(d.price) + num(d.addon_price);
const homeMonthly = (d: RecordData) => perClean(d) * visitsPerMonth(d);
const payoutTotal = (d: RecordData) => num(d.hours) * num(d.rate) + num(d.bonus) + num(d.payroll_taxes);

// Lawn care
const lawnMonthly = (d: RecordData) => num(d.price) * visitsPerMonth(d);
const seasonVisits = (d: RecordData) => {
  const step = DAYS_BETWEEN_VISITS[String(d.frequency ?? "")];
  const days = daysBetween(d.season_start, d.season_end);
  return step && days ? Math.floor(days / step) + 1 : null;
};

// Auto
const partCost = (d: RecordData) => num(d.cost) + (d.core_returned === true ? 0 : num(d.core_charge));
const packageNet = (d: RecordData) => num(d.price) - num(d.supplies_cost);

// Carpenter
const boardFeet = (d: RecordData) =>
  (num(d.thickness_in) * num(d.width_in) * num(d.length_ft) * Math.max(1, num(d.pieces))) / 12;
const lumberCost = (d: RecordData) => boardFeet(d) * num(d.price_per_bf) + num(d.other_cost);
const orderBalance = (d: RecordData) => (num(d.quote) ? num(d.quote) - num(d.deposit_paid) - num(d.balance_paid) : null);
const ORDER_IN_SHOP = is("status", "Deposit paid", "Building", "Finishing");
const ORDER_OWES = is("status", "Deposit paid", "Building", "Finishing", "Ready", "Delivered");

// Interior design
const designFee = (d: RecordData): number | null => {
  if (is("fee_type", "Hourly")(d)) return num(d.est_hours) * num(d.hourly_rate);
  if (is("fee_type", "Percent of budget")(d)) return (num(d.budget) * num(d.fee_pct)) / 100;
  return num(d.flat_fee) || null;
};
const unitClientPrice = (d: RecordData) => num(d.client_price) || num(d.trade_price) * (1 + num(d.markup_pct) / 100);
const qtyOf = (d: RecordData) => Math.max(1, num(d.qty));
const productLineTotal = (d: RecordData) => qtyOf(d) * unitClientPrice(d);
const productProfit = (d: RecordData) => qtyOf(d) * (unitClientPrice(d) - num(d.trade_price)) - num(d.freight);
const PRODUCT_ORDERED = is("status", "Ordered", "Shipped", "Received", "Installed");
const hoursValue = (d: RecordData) => (d.billable === false ? 0 : num(d.hours) * num(d.rate));

// Photography studio rental
const bookingHours = (d: RecordData) => hoursBetween(d.start, d.end);
const bookingGross = (d: RecordData) => bookingHours(d) * num(d.hourly_rate) + num(d.cleaning_fee) + num(d.extras);
const bookingFee = (d: RecordData) => (bookingGross(d) * num(d.platform_fee_pct)) / 100;
const BOOKED = is("status", "Confirmed", "Completed");
const gearRentalAmount = (d: RecordData) =>
  num(d.rate) * Math.max(1, num(d.qty)) * (is("unit", "Flat")(d) ? 1 : Math.max(1, num(d.units)));

// ---------- configs ----------

export const HOME_TRADES_CONFIGS: GigConfig[] = [
  // ===== Home & Personal Services =====
  {
    categories: ["Handyman Services"],
    tagline: "Estimates that price labor and materials, plus every receipt, tool and mile behind your work orders.",
    usesClients: true,
    clientLabel: "Customers",
    jobsBoard: { label: "Work orders", placeholder: "e.g. Replace kitchen faucet" },
    schedule: { label: "Job schedule" },
    collections: [
      estimatesLog({
        clientSingular: "Customer",
        jobTypes: [
          "Repair",
          "Installation",
          "Assembly / TV mounting",
          "Drywall & patching",
          "Painting",
          "Carpentry & trim",
          "Doors & windows",
          "Fixture swap (like-for-like)",
          "Punch list",
          "Other",
        ],
        laborRate: 75,
        markup: 15,
        placeholder: "e.g. Patch drywall + paint hallway",
        scopePlaceholder: "1x patch 12in hole, hallway\n1x prime and paint hallway walls\n1x haul away debris",
      }),
      {
        key: "materials",
        label: "Materials",
        singular: "Materials purchase",
        description: "Store runs and supplies. Bill materials inside the work order amount; this tab is your cost.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Items", type: "text", required: true, placeholder: "e.g. Faucet, supply lines, plumber's putty" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "store", label: "Store", type: "select", options: ["Home Depot", "Lowe's", "Menards", "Ace Hardware", "Local supplier", "Online", "Other"] },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Lumber & building", "Paint & sundries", "Hardware & fasteners", "Plumbing parts", "Electrical parts", "Fixtures & appliances", "Consumables", "Other"],
          },
          { key: "job", label: "Work order", type: "text", placeholder: "e.g. Kitchen faucet - Oak St" },
          { key: "client", label: "Customer", type: "client" },
          { key: "amount", label: "Amount", type: "money", required: true, list: true },
          { key: "returned", label: "Returned", type: "money", help: "Refund for anything you took back" },
          { key: "receipt_url", label: "Receipt photo link", type: "url" },
        ],
        computed: [{ key: "net", label: "Net cost", format: "money", fn: materialCost }],
        expense: materialCost,
      },
      {
        key: "tools",
        label: "Tools & equipment",
        singular: "Tool",
        description: "Tools and gear you buy for the business, with serial numbers for insurance and theft claims.",
        titleField: "tool",
        dateField: "bought",
        statusField: "status",
        sort: { field: "bought", dir: "desc" },
        fields: [
          { key: "tool", label: "Tool", type: "text", required: true, placeholder: "e.g. 20V drill/driver kit" },
          { key: "bought", label: "Bought", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Power tool", "Hand tool", "Ladder / scaffolding", "Safety gear", "Van / truck equipment", "Software / apps", "Other"],
          },
          { key: "cost", label: "Cost", type: "money", required: true, list: true, help: "Items $2,500 or less can usually be expensed right away; ask a tax pro about bigger ones" },
          { key: "serial", label: "Brand / serial #", type: "text" },
          { key: "warranty_until", label: "Warranty until", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["In use", "In repair", "Loaned out", "Retired / sold"], default: "In use" },
        ],
        expense: (d) => num(d.cost),
      },
      mileageLog("Customer", "e.g. Oak St faucet job + Home Depot run"),
      licensesLog(
        ["Business license", "Contractor / handyman registration", "General liability insurance", "Commercial auto", "EPA RRP certification", "Bond", "Other"],
        "e.g. General liability policy",
      ),
    ],
    kpis: [
      { label: "Open quotes", format: "money", value: (c) => openQuotes(c.all("estimates")), hint: "Sent and waiting on an answer" },
      { label: "Quotes won YTD", format: "money", value: (c) => wonQuotes(c.ytd("estimates")) },
      { label: "Win rate YTD", format: "percent", value: (c) => winRate(c.ytd("estimates")), hint: "Accepted / (accepted + declined + expired)" },
      { label: "Materials YTD", format: "money", value: (c) => sum(c.ytd("materials"), materialCost) },
      { label: "Mileage deduction YTD", format: "money", value: (c) => sum(c.ytd("mileage"), tripDeduction) },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Look up your state's handyman limit: above a set job value, or for trades like electrical, plumbing and HVAC, most states require a contractor's license",
        "Get general liability insurance; many customers and property managers ask for a certificate",
        "Pre-1978 homes: get EPA lead-safe (RRP) certified before work that disturbs painted surfaces",
        "Pull permits where your city requires them (usually structural, electrical, plumbing and gas work)",
        "Put every job in writing: scope, price, payment terms and how change orders are handled",
        "Register your business and get a local business license if your city requires one",
        "Keep material receipts and log miles to every job; both are deductible",
      ],
    },
    integrations: [
      { kind: "link", label: "TaskRabbit", url: "https://www.taskrabbit.com", note: "Get booked for small tasks and assembly" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com", note: "Pay-per-lead jobs; price the lead into your estimate" },
      { kind: "link", label: "Angi", url: "https://www.angi.com" },
      { kind: "link", label: "Jobber", url: "https://getjobber.com", note: "Paid field-service app if you outgrow this" },
    ],
    resources: [
      { label: "EPA lead-safe renovation (RRP) program", url: "https://www.epa.gov/lead/renovation-repair-and-painting-program" },
      { label: "Contractor licensing by state (NASCLA)", url: "https://www.nascla.org" },
      { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
    ],
  },
  {
    categories: ["Home Organizing"],
    tagline: "Assessments and proposals, product purchases with markup, and donation runs for every space you transform.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: { label: "Sessions", placeholder: "e.g. Pantry reset - 4 hrs" },
    schedule: { label: "Appointments" },
    collections: [
      {
        key: "assessments",
        label: "Assessments",
        singular: "Assessment",
        description: "Walkthroughs and proposals. Book accepted work as sessions on the board; nothing here counts as income.",
        titleField: "space",
        dateField: "assessed_on",
        statusField: "status",
        sort: { field: "assessed_on", dir: "desc" },
        fields: [
          { key: "space", label: "Space / project", type: "text", required: true, placeholder: "e.g. Garage + side shed" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "space_type",
            label: "Space type",
            type: "select",
            options: ["Closet", "Pantry", "Kitchen", "Garage", "Home office / paper", "Kids' rooms / playroom", "Whole home", "Move / downsizing", "Digital / photos", "Other"],
          },
          { key: "address", label: "Address", type: "text" },
          { key: "assessed_on", label: "Assessment date", type: "date" },
          {
            key: "clutter_level",
            label: "Clutter level",
            type: "select",
            options: ["Level I", "Level II", "Level III", "Level IV", "Level V"],
            help: "ICD Clutter-Hoarding Scale. Levels IV-V usually need a specialized team.",
          },
          { key: "goals", label: "Client goals & keep / donate rules", type: "textarea", placeholder: "e.g. Park one car inside; keep all holiday decor; donate kids' toys" },
          { key: "est_hours", label: "Estimated hours", type: "number", unit: "hrs" },
          { key: "team_size", label: "Organizers", type: "number", default: 1 },
          { key: "hourly_rate", label: "Rate / organizer hour", type: "money", default: 85 },
          { key: "product_budget", label: "Product budget", type: "money", help: "Bins, shelving, labels" },
          { key: "haul_away", label: "Includes haul-away", type: "bool", default: false },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Assessment", "Proposal sent", "Booked", "In progress", "Maintenance plan", "Done", "Lost"],
            default: "Assessment",
          },
          { key: "photos_url", label: "Before / after photos link", type: "url" },
        ],
        computed: [
          { key: "labor", label: "Labor", format: "money", fn: (d) => num(d.est_hours) * Math.max(1, num(d.team_size)) * num(d.hourly_rate), list: false },
          { key: "estimate", label: "Proposal total", format: "money", fn: organizeEstimate },
        ],
      },
      {
        key: "products",
        label: "Product purchases",
        singular: "Product purchase",
        description: "Containers and systems you buy for clients. Charge them inside the session amount; this tab tracks your cost and markup.",
        titleField: "item",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Items", type: "text", required: true, placeholder: "e.g. 12 clear pantry bins + labels" },
          { key: "assessment", label: "Project", type: "ref", ref: "assessments" },
          { key: "client", label: "Client", type: "client" },
          { key: "date", label: "Bought", type: "date", required: true },
          { key: "store", label: "Store", type: "select", options: ["The Container Store", "IKEA", "Target", "Amazon", "HomeGoods", "Walmart", "Other"] },
          { key: "cost", label: "Your cost", type: "money", required: true, list: true },
          { key: "charged", label: "Charged to client", type: "money", list: true, help: "Include it in the session's amount on the board" },
          { key: "status", label: "Status", type: "select", options: ["Bought", "Installed", "Returned"], default: "Bought" },
          { key: "receipt_url", label: "Receipt photo link", type: "url" },
        ],
        computed: [
          { key: "markup", label: "Markup", format: "money", fn: (d) => (num(d.charged) ? productMarkup(d) : null) },
          { key: "markup_pct", label: "Markup %", format: "percent", fn: (d) => (num(d.charged) ? ratio(productMarkup(d), num(d.cost)) : null) },
        ],
        expense: (d) => (productNotReturned(d) ? num(d.cost) : 0),
      },
      {
        key: "donations",
        label: "Donations & haul-away",
        singular: "Drop-off",
        description: "Where clients' items went. Donation receipts go to the client: the deduction is theirs, not yours.",
        titleField: "load",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "load", label: "Load", type: "text", required: true, placeholder: "e.g. Garage purge - load 1" },
          { key: "assessment", label: "Project", type: "ref", ref: "assessments" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "destination",
            label: "Destination",
            type: "select",
            options: ["Goodwill", "Salvation Army", "Habitat for Humanity ReStore", "Local charity / shelter", "Consignment / resale", "Buy Nothing / free", "Recycling / e-waste", "Shredding", "Dump / transfer station"],
          },
          { key: "bags", label: "Bags / boxes", type: "number", list: true },
          { key: "large_items", label: "Large items", type: "number" },
          { key: "haul_fee", label: "Dump / shred / haul fee", type: "money", help: "What you paid; deductible" },
          { key: "receipt_to_client", label: "Donation receipt given to client", type: "bool", default: false },
        ],
        expense: (d) => num(d.haul_fee),
      },
      mileageLog("Client", "e.g. Session at Hill Rd + donation drop-off"),
    ],
    kpis: [
      { label: "Open proposals", format: "money", value: (c) => sum(c.all("assessments").filter(is("status", "Proposal sent")), organizeEstimate) },
      { label: "Products bought YTD", format: "money", value: (c) => sum(c.ytd("products").filter(productNotReturned), "cost") },
      { label: "Product markup YTD", format: "money", value: (c) => sum(c.ytd("products").filter(productNotReturned), productMarkup), hint: "Charged to clients minus your cost" },
      { label: "Bags & boxes rehomed YTD", format: "number", value: (c) => sum(c.ytd("donations"), "bags") },
      { label: "Mileage deduction YTD", format: "money", value: (c) => sum(c.ytd("mileage"), tripDeduction) },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Register your business and get a local business license if your city requires one",
        "Get general liability insurance (covers damage to a client's home or belongings)",
        "Use a written agreement: hourly rate, minimum session length, cancellation policy, and how product purchases are billed",
        "Agree on keep / donate / toss rules up front, including who decides on sentimental items",
        "Give donation receipts to the client; the deduction is theirs",
        "Know your limits: severe hoarding situations may need a specialized team",
        "Keep product receipts and log miles; both are deductible",
      ],
    },
    integrations: [
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
      { kind: "link", label: "TaskRabbit", url: "https://www.taskrabbit.com" },
      { kind: "link", label: "Angi", url: "https://www.angi.com" },
    ],
    resources: [
      { label: "NAPO (National Association of Productivity & Organizing Professionals)", url: "https://www.napo.net" },
      { label: "Institute for Challenging Disorganization", url: "https://www.challengingdisorganization.org" },
      { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
    ],
  },
  {
    categories: ["House Cleaning Service"],
    tagline: "Every home on your route with entry notes and pricing, plus supplies and team payouts.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: { label: "Cleanings", placeholder: "e.g. Deep clean - 3 bed / 2 bath" },
    schedule: { label: "Cleaning schedule" },
    collections: [
      {
        key: "homes",
        label: "Homes",
        singular: "Home",
        description: "Your recurring book. Each completed cleaning on the board is the income; this tab is the home's profile and pricing.",
        titleField: "address",
        statusField: "status",
        sort: { field: "route_day", dir: "asc" },
        fields: [
          { key: "address", label: "Address", type: "text", required: true, placeholder: "e.g. 412 Maple Ave" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "home_type", label: "Home type", type: "select", options: ["House", "Townhome", "Condo / apartment", "Short-term rental turnover", "Office"] },
          { key: "sq_ft", label: "Size", type: "number", unit: "sq ft" },
          { key: "beds", label: "Bedrooms", type: "number" },
          { key: "baths", label: "Bathrooms", type: "number", help: "Use .5 for half baths" },
          { key: "pets", label: "Pets", type: "text", placeholder: "e.g. 2 cats, dog crated" },
          { key: "entry", label: "Entry", type: "select", options: ["Client home", "Lockbox", "Key on file", "Door / garage code", "Smart lock", "Concierge / front desk"] },
          { key: "entry_notes", label: "Entry & house notes", type: "textarea", placeholder: "Parking, which door, alarm steps, rooms to skip, products to avoid" },
          { key: "frequency", label: "Frequency", type: "select", options: ["Weekly", "Biweekly", "Every 4 weeks", "Monthly", "One-time"], default: "Biweekly" },
          { key: "route_day", label: "Route day", type: "select", options: WEEKDAYS, list: true },
          { key: "price", label: "Price per clean", type: "money", required: true },
          { key: "addons", label: "Add-ons", type: "text", placeholder: "e.g. Inside fridge, inside oven, interior windows, laundry" },
          { key: "addon_price", label: "Add-ons per clean", type: "money" },
          { key: "est_hours", label: "Labor hours per clean", type: "number", unit: "hrs", help: "Total person-hours: 2 cleaners x 1.5 h = 3" },
          { key: "supplies", label: "Supplies", type: "select", options: ["We bring everything", "Client's products", "Client's vacuum only"], default: "We bring everything" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "One-time", "Ended"], default: "Active" },
          { key: "since", label: "Client since", type: "date" },
        ],
        computed: [
          { key: "per_clean", label: "Per clean", format: "money", fn: perClean },
          { key: "monthly", label: "Monthly value", format: "money", fn: (d) => homeMonthly(d) || null },
          { key: "per_hour", label: "$ / labor hour", format: "money", fn: (d) => ratio(perClean(d), num(d.est_hours)) },
        ],
      },
      {
        key: "supplies",
        label: "Supplies",
        singular: "Supply purchase",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Items", type: "text", required: true, placeholder: "e.g. All-purpose cleaner concentrate, microfiber 24-pack" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Cleaning products", "Microfiber & cloths", "Vacuum / equipment", "Paper goods & trash bags", "Gloves & PPE", "Uniforms", "Other"],
          },
          { key: "store", label: "Store", type: "text", placeholder: "e.g. Costco, janitorial supply" },
          { key: "amount", label: "Amount", type: "money", required: true, list: true },
          { key: "receipt_url", label: "Receipt photo link", type: "url" },
        ],
        expense: (d) => num(d.amount),
      },
      {
        key: "payouts",
        label: "Team payouts",
        singular: "Payout",
        description: "What you pay helpers and employees. Each payout is a business expense.",
        titleField: "cleaner",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "cleaner", label: "Cleaner", type: "text", required: true },
          { key: "date", label: "Paid on", type: "date", required: true },
          { key: "home", label: "Home", type: "ref", ref: "homes", help: "Leave blank for a weekly / period payout" },
          { key: "worker_type", label: "Worker type", type: "select", options: ["1099 contractor", "W-2 employee"], default: "1099 contractor" },
          { key: "hours", label: "Hours", type: "number", unit: "hrs" },
          { key: "rate", label: "Hourly rate", type: "money" },
          { key: "bonus", label: "Bonus / tips passed on", type: "money" },
          { key: "payroll_taxes", label: "Employer payroll taxes", type: "money", help: "W-2 only: your share of payroll taxes" },
          { key: "method", label: "Paid via", type: "select", options: ["Payroll / direct deposit", "Zelle", "Venmo", "Cash App", "Check", "Cash"] },
        ],
        computed: [{ key: "total", label: "Total cost", format: "money", fn: payoutTotal }],
        expense: payoutTotal,
      },
      mileageLog("Client", "e.g. Tuesday route (4 homes)"),
    ],
    kpis: [
      {
        label: "Recurring book / month",
        format: "money",
        value: (c) => sum(c.all("homes").filter(is("status", "Active")), homeMonthly),
        hint: "Active homes x price x visits per month. Income is counted from completed cleanings.",
      },
      { label: "Active homes", format: "number", value: (c) => count(c.all("homes"), is("status", "Active")) },
      {
        label: "Avg. $ / labor hour",
        format: "money",
        value: (c) => {
          const rows = c.all("homes").filter(is("status", "Active"));
          return ratio(sum(rows, perClean), sum(rows, "est_hours"));
        },
        hint: "Active homes; aim well above what you pay per hour",
      },
      { label: "Team payouts YTD", format: "money", value: (c) => sum(c.ytd("payouts"), payoutTotal) },
      { label: "Supplies YTD", format: "money", value: (c) => sum(c.ytd("supplies"), "amount") },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get general liability insurance and a janitorial (fidelity) bond; many clients ask for proof",
        "Register your business and get a local business license if your city requires one",
        "Use a service agreement: what's included, add-on prices, cancellation and lockout fees, key and pet policy",
        "Do a walkthrough on the first visit and record entry steps and rooms to skip",
        "Classify helpers carefully: if you control their schedule and methods they may be employees, not 1099 contractors",
        "With employees, set up payroll and carry workers' comp as your state requires",
        "Send a 1099-NEC to each contractor you paid above the IRS reporting threshold",
      ],
    },
    integrations: [
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
      { kind: "link", label: "Angi", url: "https://www.angi.com" },
      { kind: "link", label: "Jobber", url: "https://getjobber.com", note: "Paid scheduling / invoicing if you grow a team" },
      { kind: "link", label: "Housecall Pro", url: "https://www.housecallpro.com" },
    ],
    resources: [
      { label: "ARCSI (residential cleaning association)", url: "https://www.arcsi.org" },
      { label: "IRS: contractor or employee?", url: "https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee" },
      { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
    ],
  },
  {
    categories: ["Interior Design Consulting"],
    tagline: "Projects with your fee structure, product sourcing with trade pricing and markup, and every billable hour.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Consultations & site visits" },
    collections: [
      {
        key: "projects",
        label: "Projects",
        singular: "Project",
        titleField: "name",
        dateField: "start_date",
        statusField: "status",
        sort: { field: "start_date", dir: "desc" },
        fields: [
          { key: "name", label: "Project", type: "text", required: true, placeholder: "e.g. Hernandez living + dining" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "rooms", label: "Rooms", type: "text", placeholder: "e.g. Living room, dining room, entry" },
          {
            key: "service",
            label: "Service",
            type: "select",
            options: ["Consultation only", "E-design", "Full-service design", "Remodel / renovation", "Home staging", "Commercial"],
          },
          { key: "style", label: "Style direction", type: "text", placeholder: "e.g. Warm modern, California casual" },
          { key: "fee_type", label: "Design fee", type: "select", options: ["Flat fee", "Hourly", "Percent of budget"], default: "Flat fee" },
          { key: "flat_fee", label: "Flat fee", type: "money" },
          { key: "hourly_rate", label: "Hourly rate", type: "money", default: 125 },
          { key: "est_hours", label: "Estimated hours", type: "number", unit: "hrs" },
          { key: "fee_pct", label: "Fee % of budget", type: "percent" },
          { key: "budget", label: "Client budget", type: "money", help: "Furnishings or project budget" },
          { key: "start_date", label: "Start", type: "date" },
          { key: "install_date", label: "Install / reveal", type: "date" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Inquiry", "Proposal sent", "Retainer paid", "Concept", "Sourcing", "Ordering", "Install", "Complete", "Lost"],
            default: "Inquiry",
          },
          { key: "board_url", label: "Design board / presentation link", type: "url" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [{ key: "est_fee", label: "Est. design fee", format: "money", fn: designFee }],
      },
      {
        key: "products",
        label: "Product sourcing",
        singular: "Product",
        description: "Items you specify and resell. Ordered items count as product sales (client price) and cost (trade price + freight).",
        titleField: "item",
        dateField: "order_date",
        statusField: "status",
        sort: { field: "order_date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. Performance-velvet sofa, 93 in" },
          { key: "project", label: "Project", type: "ref", ref: "projects", list: true },
          { key: "room", label: "Room", type: "text" },
          { key: "vendor", label: "Vendor", type: "text", placeholder: "e.g. trade showroom or brand" },
          { key: "sku", label: "SKU / finish", type: "text" },
          { key: "qty", label: "Qty", type: "number", default: 1 },
          { key: "trade_price", label: "Trade price (each)", type: "money" },
          { key: "markup_pct", label: "Markup", type: "percent", default: 30 },
          { key: "client_price", label: "Client price (each)", type: "money", help: "Leave blank to use trade price + markup" },
          { key: "freight", label: "Freight / receiving / delivery", type: "money", help: "Your cost to get it in place" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Proposed", "Approved", "Ordered", "Shipped", "Received", "Installed", "Declined", "Returned"],
            default: "Proposed",
          },
          { key: "order_date", label: "Ordered", type: "date" },
          { key: "eta", label: "Expected", type: "date" },
          { key: "link", label: "Product link", type: "url" },
        ],
        computed: [
          { key: "unit_client", label: "Client price", format: "money", fn: unitClientPrice, list: false },
          { key: "line_total", label: "Line total", format: "money", fn: productLineTotal },
          { key: "profit", label: "Your profit", format: "money", fn: productProfit },
          { key: "markup_actual", label: "Markup", format: "percent", fn: (d) => ratio(unitClientPrice(d) - num(d.trade_price), num(d.trade_price)), list: false },
        ],
        income: (d) => (PRODUCT_ORDERED(d) ? productLineTotal(d) : 0),
        expense: (d) => (PRODUCT_ORDERED(d) ? qtyOf(d) * num(d.trade_price) + num(d.freight) : 0),
      },
      {
        key: "hours",
        label: "Hours",
        singular: "Time entry",
        description: "Time log. Billed hours become income when the client pays (log that in Fee payments).",
        titleField: "description",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "description", label: "Work", type: "text", required: true, placeholder: "e.g. Sourcing dining lighting" },
          { key: "project", label: "Project", type: "ref", ref: "projects", list: true },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "task",
            label: "Task",
            type: "select",
            options: ["Consultation", "Measure / site visit", "Space planning", "Concept boards", "Sourcing", "Client meeting", "Ordering & tracking", "Install", "Admin"],
          },
          { key: "hours", label: "Hours", type: "number", unit: "hrs", required: true, list: true },
          { key: "billable", label: "Billable", type: "bool", default: true },
          { key: "rate", label: "Rate", type: "money", default: 125 },
          { key: "billed", label: "Invoiced", type: "bool", default: false },
        ],
        computed: [{ key: "value", label: "Billable value", format: "money", fn: hoursValue }],
      },
      {
        key: "payments",
        label: "Fee payments",
        singular: "Payment",
        description: "Design fees received. Product sales are already counted in Product sourcing, so don't log them here too.",
        titleField: "memo",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "memo", label: "Invoice / memo", type: "text", required: true, placeholder: "e.g. INV-1042 design fee 2 of 3" },
          { key: "project", label: "Project", type: "ref", ref: "projects" },
          { key: "client", label: "Client", type: "client" },
          { key: "date", label: "Received", type: "date", required: true },
          { key: "type", label: "Type", type: "select", options: ["Retainer", "Design fee installment", "Hourly invoice", "Consultation", "Final payment"] },
          { key: "method", label: "Method", type: "select", options: ["Check", "ACH / bank transfer", "Card", "Zelle", "Other"] },
          { key: "amount", label: "Amount", type: "money", required: true, list: true },
          { key: "processing_fee", label: "Card / processing fee", type: "money" },
        ],
        income: (d) => num(d.amount),
        expense: (d) => num(d.processing_fee),
      },
    ],
    kpis: [
      { label: "Fees + product sales YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Product profit YTD", format: "money", value: (c) => sum(c.ytd("products").filter(PRODUCT_ORDERED), productProfit), hint: "Client price minus trade price and freight" },
      {
        label: "Unbilled time",
        format: "money",
        value: (c) => sum(c.all("hours").filter((d) => d.billed !== true), hoursValue),
        hint: "Billable hours not yet invoiced",
      },
      { label: "Active projects", format: "number", value: (c) => count(c.all("projects"), (d) => !is("status", "Inquiry", "Complete", "Lost")(d)) },
      {
        label: "Fees per hour logged YTD",
        format: "money",
        value: (c) => ratio(sum(c.ytd("payments"), "amount"), sum(c.ytd("hours"), "hours")),
        hint: "Your real hourly rate across all projects",
      },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "A few states regulate the title 'interior designer' or code-related work; check yours before using the title",
        "Use a signed letter of agreement: scope, fee structure, product markup, revisions and payment schedule",
        "Collect a retainer before starting design work",
        "Open trade accounts with vendors (most ask for a resale certificate or business license)",
        "If you resell furnishings, get a seller's permit and collect sales tax where required",
        "Collect client payment for product before placing orders",
        "Carry general liability and professional liability (E&O) insurance",
      ],
    },
    integrations: [
      { kind: "link", label: "Houzz Pro", url: "https://www.houzz.com", note: "Portfolio, leads and client boards" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
    ],
    resources: [
      { label: "ASID (American Society of Interior Designers)", url: "https://www.asid.org" },
      { label: "CIDQ (NCIDQ certification)", url: "https://www.cidq.org" },
      { label: "IRS Self-Employed Tax Center", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center" },
    ],
  },
  {
    categories: ["Landscaping / Lawn Care"],
    tagline: "Properties on your routes with per-visit pricing, plus equipment, fuel, materials and miles.",
    usesClients: true,
    clientLabel: "Customers",
    jobsBoard: { label: "Jobs", placeholder: "e.g. Spring cleanup + mulch - Elm St" },
    schedule: { label: "Route schedule" },
    collections: [
      {
        key: "properties",
        label: "Properties",
        singular: "Property",
        description: "Your recurring route. Completed jobs on the board are the income; this tab holds each property's services and pricing.",
        titleField: "address",
        statusField: "status",
        sort: { field: "route_day", dir: "asc" },
        fields: [
          { key: "address", label: "Address", type: "text", required: true, placeholder: "e.g. 88 Elm St" },
          { key: "client", label: "Customer", type: "client", list: true },
          { key: "lot_size", label: "Turf / lot size", type: "number", unit: "sq ft", help: "1 acre = 43,560 sq ft" },
          {
            key: "grass",
            label: "Grass type",
            type: "select",
            options: ["Bermuda", "St. Augustine", "Zoysia", "Centipede", "Kentucky bluegrass", "Tall fescue", "Ryegrass", "Mixed / unknown"],
          },
          { key: "mow", label: "Mow", type: "bool", default: true },
          { key: "edge_trim", label: "Edge & trim", type: "bool", default: true },
          { key: "leaf", label: "Leaf cleanup", type: "bool", default: false },
          { key: "aeration", label: "Aeration", type: "bool", default: false },
          { key: "fert", label: "Fertilizer / weed control", type: "bool", default: false, help: "Applying pesticides for hire usually needs a state applicator license" },
          { key: "other_services", label: "Other services", type: "text", placeholder: "e.g. Hedge trimming, gutter cleaning" },
          { key: "frequency", label: "Frequency", type: "select", options: ["Weekly", "Biweekly", "Every 10 days", "Monthly", "As needed"], default: "Weekly" },
          { key: "route_day", label: "Route day", type: "select", options: WEEKDAYS, list: true },
          { key: "route_stop", label: "Stop # on route", type: "number" },
          { key: "price", label: "Price per visit", type: "money", required: true },
          { key: "minutes", label: "Time on site", type: "number", unit: "min" },
          { key: "season_start", label: "Season starts", type: "date" },
          { key: "season_end", label: "Season ends", type: "date" },
          { key: "access", label: "Gate / access notes", type: "text", placeholder: "e.g. Side gate code, dog in yard Tuesdays" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "Seasonal only", "Lost"], default: "Active" },
        ],
        computed: [
          { key: "monthly", label: "Monthly value", format: "money", fn: (d) => lawnMonthly(d) || null },
          { key: "per_hour", label: "$ / on-site hour", format: "money", fn: (d) => ratio(num(d.price), num(d.minutes) / 60) },
          { key: "season_visits", label: "Visits this season", format: "number", fn: seasonVisits, list: false },
          { key: "season_value", label: "Season value", format: "money", fn: (d) => { const v = seasonVisits(d); return v == null ? null : v * num(d.price); }, list: false },
        ],
      },
      {
        key: "equipment",
        label: "Equipment & fuel",
        singular: "Equipment cost",
        description: "Mowers, handhelds, trailer, repairs and equipment fuel. Truck fuel isn't deductible here if you use the mileage rate.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. 5 gal ethanol-free + 2-cycle oil" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Equipment fuel & oil", "Mower / equipment purchase", "Repairs & service", "Blades, line & filters", "Trailer & accessories", "Safety gear", "Other"],
          },
          { key: "machine", label: "Machine", type: "text", placeholder: "e.g. 52in zero-turn" },
          { key: "amount", label: "Amount", type: "money", required: true, list: true },
          { key: "engine_hours", label: "Engine hours", type: "number", unit: "hrs", help: "At time of service, to plan the next one" },
          { key: "next_service", label: "Next service due", type: "date" },
        ],
        expense: (d) => num(d.amount),
      },
      {
        key: "materials",
        label: "Materials & dump fees",
        singular: "Materials purchase",
        description: "Mulch, seed, fertilizer, plants and green-waste fees. Charge them inside the job amount; this tab is your cost.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. Brown mulch" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "property", label: "Property", type: "ref", ref: "properties" },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Mulch", "Seed / sod", "Fertilizer", "Weed / pest control", "Plants", "Stone / soil", "Dump / green-waste fee", "Other"],
          },
          { key: "qty", label: "Qty", type: "number" },
          { key: "unit", label: "Unit", type: "select", options: ["bags", "cubic yards", "lbs", "flats", "pallets", "loads"] },
          { key: "cost", label: "Cost", type: "money", required: true, list: true },
        ],
        expense: (d) => num(d.cost),
      },
      mileageLog("Customer", "e.g. Thursday route + supply yard"),
    ],
    kpis: [
      {
        label: "Recurring book / month",
        format: "money",
        value: (c) => sum(c.all("properties").filter(is("status", "Active")), lawnMonthly),
        hint: "Active properties x price x visits per month. Income is counted from completed jobs.",
      },
      { label: "Active properties", format: "number", value: (c) => count(c.all("properties"), is("status", "Active")) },
      {
        label: "Avg. $ / on-site hour",
        format: "money",
        value: (c) => {
          const rows = c.all("properties").filter(is("status", "Active"));
          return ratio(sum(rows, "price"), sum(rows, (d) => num(d.minutes) / 60));
        },
        hint: "Before drive time",
      },
      { label: "Equipment & fuel YTD", format: "money", value: (c) => sum(c.ytd("equipment"), "amount") },
      { label: "Materials YTD", format: "money", value: (c) => sum(c.ytd("materials"), "cost") },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get general liability insurance plus commercial auto coverage for your truck and trailer",
        "Applying fertilizer, herbicides or pesticides for hire usually requires a state applicator license; check your state agriculture department",
        "Register your business and get a local business license if your city requires one",
        "Use a seasonal agreement: services, visit frequency, price per visit, and how rain-outs are handled",
        "Group properties by route day to cut drive time and fuel",
        "Call 811 before digging for planting, edging trenches or hardscape",
        "Log equipment service by engine hours to keep mowers running",
      ],
    },
    integrations: [
      { kind: "link", label: "Jobber", url: "https://getjobber.com", note: "Paid routing / invoicing if you outgrow this" },
      { kind: "link", label: "LawnStarter", url: "https://www.lawnstarter.com" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
      { kind: "link", label: "Angi", url: "https://www.angi.com" },
    ],
    resources: [
      { label: "National Association of Landscape Professionals", url: "https://www.landscapeprofessionals.org" },
      { label: "Call 811 before you dig", url: "https://call811.com" },
      { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
    ],
  },

  // ===== Skilled Trades =====
  {
    categories: ["Auto Detailing / Mobile Mechanic"],
    tagline: "Every vehicle's specs and service history, priced packages, parts with core charges, and miles.",
    usesClients: true,
    clientLabel: "Customers",
    jobsBoard: { label: "Service jobs", placeholder: "e.g. Full detail - 2019 Tacoma" },
    schedule: { label: "Appointments" },
    collections: [
      {
        key: "vehicles",
        label: "Vehicles",
        singular: "Vehicle",
        titleField: "vehicle",
        sort: { field: "next_due", dir: "asc" },
        fields: [
          { key: "vehicle", label: "Year / make / model", type: "text", required: true, placeholder: "e.g. 2019 Toyota Tacoma TRD" },
          { key: "client", label: "Owner", type: "client", list: true },
          { key: "vin", label: "VIN", type: "text", help: "17 characters; on the dash or driver door jamb" },
          { key: "plate", label: "Plate", type: "text" },
          { key: "color", label: "Color", type: "text" },
          {
            key: "size",
            label: "Size class",
            type: "select",
            options: ["Coupe / sedan", "Small SUV / crossover", "Midsize SUV / truck", "Full-size truck / 3-row SUV", "Van / minivan", "Motorcycle", "RV / boat"],
          },
          { key: "odometer", label: "Mileage", type: "number", unit: "mi" },
          { key: "last_service", label: "Last service", type: "date" },
          { key: "last_service_type", label: "Last service done", type: "text", placeholder: "e.g. Oil change + rotation, full detail" },
          { key: "next_due", label: "Next service due", type: "date", list: true },
          { key: "next_due_miles", label: "Next service at", type: "number", unit: "mi" },
          { key: "oil_spec", label: "Oil / fluids spec", type: "text", placeholder: "e.g. 0W-20 full synthetic, 6.2 qt" },
          { key: "tire_size", label: "Tire size", type: "text", placeholder: "e.g. 265/70R16" },
          { key: "condition_notes", label: "Condition notes", type: "textarea", placeholder: "Existing scratches, stains, warning lights (photograph before you start)" },
        ],
        computed: [{ key: "miles_to_service", label: "Miles to service", format: "number", fn: (d) => (num(d.next_due_miles) ? num(d.next_due_miles) - num(d.odometer) : null) }],
      },
      {
        key: "packages",
        label: "Service packages",
        singular: "Package",
        description: "Your menu. Price it here so every job on the board pays your target hourly.",
        titleField: "name",
        fields: [
          { key: "name", label: "Package", type: "text", required: true, placeholder: "e.g. Full interior + exterior detail" },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["Detail", "Paint correction / ceramic", "Maintenance", "Diagnostics", "Repair", "Add-on"],
          },
          { key: "price", label: "Price (car / sedan)", type: "money", required: true, list: true },
          { key: "large_upcharge", label: "SUV / truck upcharge", type: "money" },
          { key: "hours", label: "Time", type: "number", unit: "hrs", list: true },
          { key: "supplies_cost", label: "Products / parts per job", type: "money" },
          { key: "includes", label: "What's included", type: "textarea", placeholder: "e.g. Hand wash, clay bar, wax, vacuum, steam seats, windows" },
          { key: "active", label: "Offered", type: "bool", default: true },
        ],
        computed: [
          { key: "large_price", label: "SUV / truck price", format: "money", fn: (d) => num(d.price) + num(d.large_upcharge), list: false },
          { key: "per_hour", label: "$ / hour", format: "money", fn: (d) => ratio(packageNet(d), num(d.hours)) },
          { key: "margin", label: "Margin", format: "percent", fn: (d) => ratio(packageNet(d), num(d.price)) },
        ],
      },
      {
        key: "parts",
        label: "Parts & supplies",
        singular: "Purchase",
        description: "Parts, fluids and detailing chemicals. Bill parts inside the job amount; this tab is your cost.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. Front brake pads + rotors" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "vehicle", label: "Vehicle", type: "ref", ref: "vehicles" },
          { key: "part_no", label: "Part #", type: "text" },
          {
            key: "supplier",
            label: "Supplier",
            type: "select",
            options: ["AutoZone", "O'Reilly", "NAPA", "Advance Auto Parts", "RockAuto", "Dealer", "Detailing supplier", "Other"],
          },
          { key: "type", label: "Type", type: "select", options: ["Parts", "Fluids", "Detailing chemicals", "Pads, towels & brushes", "Tools", "Other"] },
          { key: "cost", label: "Cost", type: "money", required: true, list: true },
          { key: "core_charge", label: "Core charge", type: "money", help: "Refunded when you return the old part" },
          { key: "core_returned", label: "Core returned", type: "bool", default: false },
          { key: "charged", label: "Charged to customer", type: "money", help: "For markup tracking; the payment is counted from the job" },
        ],
        computed: [
          { key: "net_cost", label: "Net cost", format: "money", fn: partCost },
          { key: "markup", label: "Markup", format: "money", fn: (d) => (num(d.charged) ? num(d.charged) - num(d.cost) : null) },
        ],
        expense: partCost,
      },
      mileageLog("Customer", "e.g. Mobile detail at Ridge Rd"),
    ],
    kpis: [
      { label: "Parts & supplies YTD", format: "money", value: (c) => sum(c.ytd("parts"), partCost) },
      { label: "Parts markup YTD", format: "money", value: (c) => sum(c.ytd("parts").filter((d) => num(d.charged) > 0), (d) => num(d.charged) - num(d.cost)) },
      {
        label: "Cores to return",
        format: "money",
        value: (c) => sum(c.all("parts").filter((d) => d.core_returned !== true), "core_charge"),
        hint: "Core charges you can still get back",
      },
      {
        label: "Vehicles due (30 days)",
        format: "number",
        value: (c) => count(c.all("vehicles"), dueWithin("next_due", 30)),
        hint: "Due soon or overdue: reach out to book",
      },
      { label: "Mileage deduction YTD", format: "money", value: (c) => sum(c.ytd("mileage"), tripDeduction) },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get general liability insurance plus garagekeepers coverage for customer vehicles in your care",
        "A/C work: EPA Section 609 certification is required to service motor vehicle A/C refrigerant",
        "Mobile washing: many cities ban wash water going into storm drains; use a containment mat or waterless products",
        "Some states require auto repair businesses, including mobile mechanics, to register; check yours",
        "Recycle used oil, filters, coolant and batteries; most parts stores take oil and batteries",
        "Photograph and note existing damage on the vehicle record before you start",
        "Register your business and get a local business license if your city requires one",
      ],
    },
    integrations: [
      { kind: "link", label: "YourMechanic", url: "https://www.yourmechanic.com", note: "Mobile mechanic jobs" },
      { kind: "link", label: "Housecall Pro", url: "https://www.housecallpro.com" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
    ],
    resources: [
      { label: "EPA Section 609 (motor vehicle A/C)", url: "https://www.epa.gov/mvac" },
      { label: "ASE certification", url: "https://www.ase.com" },
      { label: "International Detailing Association", url: "https://www.theida.com" },
    ],
  },
  {
    categories: ["Carpenter / Woodworker"],
    tagline: "Custom orders from design to delivery with deposits and balances, a board-foot materials list, and your shop costs.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Consults & deliveries" },
    collections: [
      {
        key: "orders",
        label: "Custom orders",
        singular: "Custom order",
        description: "Deposits and balances received count as income.",
        titleField: "piece",
        dateField: "order_date",
        statusField: "status",
        sort: { field: "order_date", dir: "desc" },
        fields: [
          { key: "piece", label: "Piece", type: "text", required: true, placeholder: "e.g. Walnut dining table, 8 ft" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "piece_type",
            label: "Type",
            type: "select",
            options: ["Table", "Cabinet / built-in", "Shelving", "Bed / headboard", "Seating", "Desk", "Cutting board / small goods", "Doors / millwork", "Finish carpentry / install", "Other"],
          },
          {
            key: "species",
            label: "Wood species",
            type: "select",
            options: ["Walnut", "White oak", "Red oak", "Hard maple", "Cherry", "Ash", "Hickory", "Pine", "Poplar", "Plywood / sheet goods", "Reclaimed", "Other"],
          },
          { key: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g. 96 x 40 x 30 in H" },
          {
            key: "finish",
            label: "Finish",
            type: "select",
            options: ["Oil / wax", "Hardwax oil", "Water-based poly", "Oil-based poly", "Lacquer", "Paint", "Unfinished"],
          },
          { key: "order_date", label: "Ordered", type: "date", required: true },
          { key: "due_date", label: "Promised by", type: "date", list: true },
          { key: "quote", label: "Quote", type: "money", list: true },
          { key: "materials_est", label: "Est. materials", type: "money" },
          { key: "hours_est", label: "Est. shop hours", type: "number", unit: "hrs" },
          { key: "deposit_pct", label: "Deposit", type: "percent", default: 50 },
          { key: "deposit_paid", label: "Deposit received", type: "money", help: "Set back to 0 if you refund it" },
          { key: "balance_paid", label: "Balance received", type: "money" },
          { key: "delivery", label: "Delivery", type: "select", options: ["Pickup", "Delivery", "Delivery + install", "Ship"] },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Design", "Quoted", "Deposit paid", "Building", "Finishing", "Ready", "Delivered", "Canceled"],
            default: "Design",
          },
          { key: "drawing_url", label: "Drawings / SketchUp link", type: "url" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          { key: "deposit_due", label: "Deposit due", format: "money", fn: (d) => (num(d.quote) ? (num(d.quote) * num(d.deposit_pct)) / 100 : null), list: false },
          { key: "balance_due", label: "Balance due", format: "money", fn: (d) => (is("status", "Canceled")(d) ? null : orderBalance(d)) },
          { key: "per_hour", label: "Est. $ / shop hour", format: "money", fn: (d) => ratio(num(d.quote) - num(d.materials_est), num(d.hours_est)) },
        ],
        income: (d) => num(d.deposit_paid) + num(d.balance_paid),
      },
      {
        key: "materials",
        label: "Lumber & materials",
        singular: "Material",
        description: "Your bill of materials. Lumber is priced by the board foot; only Bought lines count as expenses.",
        titleField: "item",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. 8/4 walnut FAS, table top" },
          { key: "order", label: "Custom order", type: "ref", ref: "orders", list: true },
          { key: "date", label: "Date", type: "date" },
          { key: "type", label: "Type", type: "select", options: ["Hardwood lumber", "Sheet goods", "Hardware", "Finish & glue", "Abrasives", "Other"], default: "Hardwood lumber" },
          { key: "thickness_in", label: "Thickness", type: "number", unit: "in", help: "Rough thickness: 4/4 = 1, 8/4 = 2" },
          { key: "width_in", label: "Width", type: "number", unit: "in" },
          { key: "length_ft", label: "Length", type: "number", unit: "ft" },
          { key: "pieces", label: "Pieces", type: "number", default: 1 },
          { key: "price_per_bf", label: "Price / board foot", type: "money" },
          { key: "other_cost", label: "Cost (non-lumber)", type: "money", help: "Hardware, sheet goods, finish: enter the total here" },
          { key: "supplier", label: "Supplier", type: "text", placeholder: "e.g. local hardwood dealer" },
          { key: "status", label: "Status", type: "select", options: ["Planned", "Bought"], default: "Bought" },
        ],
        computed: [
          { key: "board_feet", label: "Board feet", format: "number", fn: (d) => boardFeet(d) || null },
          { key: "cost", label: "Cost", format: "money", fn: lumberCost },
        ],
        expense: (d) => (is("status", "Bought")(d) ? lumberCost(d) : 0),
      },
      {
        key: "shop",
        label: "Shop & tools",
        singular: "Shop cost",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. 3 HP cabinet saw" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Stationary machine", "Power tool", "Hand tool", "Dust collection", "Blades & bits", "Clamps & jigs", "Sharpening / maintenance", "Shop rent", "Utilities", "Insurance", "Other"],
          },
          { key: "amount", label: "Amount", type: "money", required: true, list: true, help: "Large machines may need to be depreciated; ask a tax pro" },
          { key: "business_pct", label: "Business use", type: "percent", default: 100, help: "Home garage shop or tool also used personally? Enter the business share" },
          { key: "serial", label: "Serial #", type: "text" },
        ],
        computed: [{ key: "deductible", label: "Deductible", format: "money", fn: (d) => (num(d.amount) * num(d.business_pct)) / 100 }],
        expense: (d) => (num(d.amount) * num(d.business_pct)) / 100,
      },
      mileageLog("Client", "e.g. Lumber run + table delivery"),
    ],
    kpis: [
      { label: "Collected YTD", format: "money", value: (c) => c.incomeYtd, hint: "Deposits and balances received" },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      { label: "In the shop", format: "number", value: (c) => count(c.all("orders"), ORDER_IN_SHOP), hint: "Deposit paid, building or finishing" },
      {
        label: "Balances outstanding",
        format: "money",
        value: (c) => sum(c.all("orders").filter(ORDER_OWES), (d) => Math.max(0, orderBalance(d) ?? 0)),
      },
      { label: "Board feet bought YTD", format: "number", value: (c) => sum(c.ytd("materials").filter(is("status", "Bought")), boardFeet) },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Take a deposit (often 30-50%) before buying lumber for custom work",
        "Get client sign-off on drawings, dimensions, species and finish before the first cut",
        "Built-ins and installs: check whether your state requires a contractor's license above a job-value limit",
        "Carry general liability insurance that includes products-completed operations coverage",
        "Collect sales tax on furniture sales where your state requires it",
        "Price lumber by the board foot with a waste allowance (often 20-30% for hardwood)",
        "Keep receipts for tools; big machines may need to be depreciated over several years",
      ],
    },
    integrations: [
      { kind: "link", label: "Houzz Pro", url: "https://www.houzz.com", note: "Portfolio and remodel leads" },
      { kind: "link", label: "Etsy", url: "https://www.etsy.com", note: "For smaller pieces and made-to-order goods" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
    ],
    resources: [
      { label: "The Wood Database (species, hardness, movement)", url: "https://www.wood-database.com" },
      { label: "Contractor licensing by state (NASCLA)", url: "https://www.nascla.org" },
      { label: "IRS Self-Employed Tax Center", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center" },
    ],
  },
  {
    categories: ["Electrician (Independent)"],
    tagline: "Estimates, permits and inspections, job costs, callbacks and every license renewal behind your service calls.",
    usesClients: true,
    clientLabel: "Customers",
    jobsBoard: { label: "Service calls", placeholder: "e.g. 200A panel upgrade" },
    schedule: { label: "Job schedule" },
    collections: [
      estimatesLog({
        clientSingular: "Customer",
        jobTypes: [
          "Service call / troubleshooting",
          "Panel upgrade / service change",
          "EV charger",
          "New circuit / outlets",
          "Lighting & fixtures",
          "Ceiling fan",
          "Rewire",
          "Generator / transfer switch",
          "Smoke / CO detectors",
          "Low voltage / data",
          "Commercial",
          "Other",
        ],
        laborRate: 110,
        markup: 20,
        placeholder: "e.g. Level 2 EV charger, garage",
        scopePlaceholder: "1x 60A 2-pole breaker\n1x 6 AWG run, 35 ft, to garage\n1x hardwired Level 2 charger install\nPermit + inspection",
      }),
      jobCostsLog({
        clientSingular: "Customer",
        suppliers: ["Electrical supply house", "Graybar", "CED", "Home Depot", "Lowe's", "Online", "Other"],
        placeholder: "e.g. 200A panel, breakers, SER cable",
      }),
      permitsLog({
        clientSingular: "Customer",
        permitTypes: ["Electrical", "Electrical - service change", "EV charger", "Solar / battery", "Generator", "Low voltage", "Building (combo)"],
        inspectionTypes: ["Underground / trench", "Rough-in", "Service release", "Cover / insulation", "Final"],
      }),
      callbacksLog({ clientSingular: "Customer", placeholder: "e.g. GFCI tripping after install" }),
      licensesLog(
        [
          "State electrical license",
          "Electrical contractor license",
          "City / county business license",
          "General liability insurance",
          "Workers' comp",
          "Commercial auto",
          "Surety / license bond",
          "Certification",
          "Other",
        ],
        "e.g. Master electrician license",
      ),
    ],
    kpis: [
      { label: "Open quotes", format: "money", value: (c) => openQuotes(c.all("estimates")), hint: "Sent and waiting on an answer" },
      { label: "Win rate YTD", format: "percent", value: (c) => winRate(c.ytd("estimates")), hint: "Accepted / (accepted + declined + expired)" },
      { label: "Open permits", format: "number", value: (c) => count(c.all("permits"), (d) => !PERMIT_CLOSED(d)), hint: "Not finaled yet" },
      { label: "Open callbacks", format: "number", value: (c) => count(c.all("callbacks"), is("status", "Open", "Scheduled")) },
      {
        label: "Renewals due (60 days)",
        format: "number",
        value: (c) => count(c.all("licenses"), dueWithin("expires", 60)),
        hint: "Licenses, insurance and bonds expiring soon or already expired",
      },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Hold the license your state requires (journeyman, master or electrical contractor); some cities license separately",
        "Pull permits for panel, service, new-circuit and EV charger work where required, and track inspections here",
        "Know which NEC edition your jurisdiction has adopted; it varies by state and city",
        "Carry general liability insurance; add workers' comp with employees and a bond if your state requires one",
        "Pre-1978 homes: EPA lead-safe (RRP) rules apply when your work disturbs painted surfaces",
        "Track CE hours for license renewal in Licenses & insurance",
        "Put every job in writing: scope, price and warranty terms",
      ],
    },
    integrations: [
      { kind: "link", label: "Housecall Pro", url: "https://www.housecallpro.com" },
      { kind: "link", label: "Jobber", url: "https://getjobber.com" },
      { kind: "link", label: "Angi", url: "https://www.angi.com" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
    ],
    resources: [
      { label: "NFPA 70: National Electrical Code", url: "https://www.nfpa.org" },
      { label: "EPA lead-safe renovation (RRP) program", url: "https://www.epa.gov/lead/renovation-repair-and-painting-program" },
      { label: "Contractor licensing by state (NASCLA)", url: "https://www.nascla.org" },
    ],
  },
  {
    categories: ["Photography Studio Rental"],
    tagline: "Bookings with platform fees and net payout per hour, gear rentals, and what the studio costs to run.",
    usesClients: true,
    clientLabel: "Renters",
    jobsBoard: false,
    schedule: { label: "Studio calendar" },
    collections: [
      {
        key: "bookings",
        label: "Bookings",
        singular: "Booking",
        description: "Confirmed and completed bookings count as income; the platform's host fee counts as an expense.",
        titleField: "shoot",
        dateField: "start",
        statusField: "status",
        sort: { field: "start", dir: "desc" },
        fields: [
          { key: "shoot", label: "Booking", type: "text", required: true, placeholder: "e.g. Product shoot - skincare brand" },
          { key: "client", label: "Renter", type: "client", list: true },
          { key: "platform", label: "Booked via", type: "select", options: ["Direct", "Peerspace", "Giggster", "Other platform"], default: "Direct" },
          { key: "booking_ref", label: "Platform booking ID", type: "text" },
          {
            key: "use",
            label: "Use",
            type: "select",
            options: ["Photo", "Video", "Podcast / audio", "Content creation", "Workshop / class", "Event", "Other"],
          },
          { key: "start", label: "Start", type: "datetime", required: true },
          { key: "end", label: "End", type: "datetime", required: true },
          { key: "hourly_rate", label: "Hourly rate", type: "money", required: true },
          { key: "cleaning_fee", label: "Cleaning fee", type: "money" },
          { key: "extras", label: "Overtime / extras", type: "money", help: "Overtime, early access, add-ons not logged as gear rentals" },
          {
            key: "platform_fee_pct",
            label: "Platform host fee",
            type: "percent",
            default: 0,
            help: "Peerspace and Giggster keep a host fee from each booking; copy it from your payout statement. 0 for direct bookings.",
          },
          { key: "headcount", label: "People on set", type: "number" },
          { key: "deposit", label: "Security deposit held", type: "money", help: "Refundable, not income" },
          { key: "deposit_kept", label: "Deposit kept for damage", type: "money" },
          { key: "cancel_fee", label: "Cancellation fee kept", type: "money", help: "Counts as income when the booking is canceled" },
          { key: "coi", label: "Certificate of insurance received", type: "bool", default: false },
          { key: "status", label: "Status", type: "select", options: ["Inquiry", "Hold", "Confirmed", "Completed", "Canceled"], default: "Inquiry" },
          { key: "notes", label: "Notes", type: "textarea", placeholder: "Setup needs, power draw, load-in, damage notes" },
        ],
        computed: [
          { key: "hours", label: "Hours", format: "hours", fn: bookingHours },
          { key: "gross", label: "Gross", format: "money", fn: bookingGross },
          { key: "platform_fee", label: "Platform fee", format: "money", fn: bookingFee, list: false },
          { key: "payout", label: "Payout", format: "money", fn: (d) => bookingGross(d) - bookingFee(d) },
        ],
        income: (d) => (BOOKED(d) ? bookingGross(d) + num(d.deposit_kept) : is("status", "Canceled")(d) ? num(d.cancel_fee) : 0),
        expense: (d) => (BOOKED(d) ? bookingFee(d) : is("status", "Canceled")(d) ? (num(d.cancel_fee) * num(d.platform_fee_pct)) / 100 : 0),
      },
      {
        key: "gear_rentals",
        label: "Gear rentals",
        singular: "Gear rental",
        description: "Lighting and equipment rented to a booking and billed separately from the space.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Gear", type: "text", required: true, placeholder: "e.g. Strobe kit x2 + 5 ft octabox" },
          { key: "gear", label: "From inventory", type: "ref", ref: "gear" },
          { key: "booking", label: "Booking", type: "ref", ref: "bookings", list: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "qty", label: "Qty", type: "number", default: 1 },
          { key: "rate", label: "Rate", type: "money", required: true },
          { key: "unit", label: "Charged", type: "select", options: ["Per hour", "Per day", "Flat"], default: "Flat" },
          { key: "units", label: "Hours / days", type: "number", default: 1 },
          { key: "platform_fee_pct", label: "Platform fee", type: "percent", default: 0, help: "If billed through the booking platform" },
        ],
        computed: [{ key: "amount", label: "Amount", format: "money", fn: gearRentalAmount }],
        income: gearRentalAmount,
        expense: (d) => (gearRentalAmount(d) * num(d.platform_fee_pct)) / 100,
      },
      {
        key: "gear",
        label: "Gear inventory",
        singular: "Gear item",
        titleField: "item",
        dateField: "purchased",
        statusField: "condition",
        sort: { field: "purchased", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. 600Ws strobe" },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Strobe / flash", "Continuous light", "Modifiers", "Stands & grip", "Backdrops & paper", "Camera / lens", "Audio", "Furniture & props", "Other"],
          },
          { key: "purchased", label: "Purchased", type: "date" },
          { key: "cost", label: "Cost", type: "money", list: true, help: "Big-ticket gear may need to be depreciated; ask a tax pro" },
          { key: "rental_rate", label: "Typical rental rate", type: "money" },
          { key: "serial", label: "Serial #", type: "text" },
          { key: "condition", label: "Condition", type: "select", options: ["Good", "Needs repair", "Out of service", "Sold"], default: "Good" },
        ],
        computed: [{ key: "payback", label: "Rentals to pay off", format: "number", fn: (d) => ratio(num(d.cost), num(d.rental_rate)) }],
        expense: (d) => num(d.cost),
      },
      {
        key: "expenses",
        label: "Studio expenses",
        singular: "Expense",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Expense", type: "text", required: true, placeholder: "e.g. October rent, seamless paper restock" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Rent / lease", "Utilities", "Insurance", "Cleaning service", "Backdrops & paper", "Props & furniture", "Internet", "Repairs", "Listing / software", "Other"],
          },
          { key: "amount", label: "Amount", type: "money", required: true, list: true },
          { key: "business_pct", label: "Business use", type: "percent", default: 100, help: "Home studio? Enter the share of the cost used for the business" },
        ],
        computed: [{ key: "deductible", label: "Deductible", format: "money", fn: (d) => (num(d.amount) * num(d.business_pct)) / 100 }],
        expense: (d) => (num(d.amount) * num(d.business_pct)) / 100,
      },
    ],
    kpis: [
      { label: "Rental income YTD", format: "money", value: (c) => c.incomeYtd, hint: "Bookings, gear rentals and kept fees" },
      { label: "Net YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      { label: "Booked hours this month", format: "hours", value: (c) => sum(c.month("bookings").filter(BOOKED), bookingHours) },
      {
        label: "Avg. payout / hour YTD",
        format: "money",
        value: (c) => {
          const rows = c.ytd("bookings").filter(BOOKED);
          return ratio(sum(rows, (d) => bookingGross(d) - bookingFee(d)), sum(rows, bookingHours));
        },
        hint: "After platform fees",
      },
      { label: "Upcoming bookings", format: "number", value: (c) => count(c.all("bookings"), (d) => BOOKED(d) && upcoming("start")(d)) },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Confirm your zoning, lease and any HOA rules allow renting the space commercially",
        "Carry general liability insurance for the studio and ask productions for a certificate of insurance",
        "Write house rules: max headcount, noise, power limits, cleaning fee, overtime rate and damage deposit",
        "Check whether your city requires a business license for the space",
        "Photograph the studio before and after every booking to support damage claims",
        "Enter each platform's host fee so payouts here match your bank deposits",
        "Ask a tax pro whether local taxes apply to space rentals in your area",
      ],
    },
    integrations: [
      { kind: "link", label: "Peerspace", url: "https://www.peerspace.com", note: "List your studio for hourly bookings" },
      { kind: "link", label: "Giggster", url: "https://giggster.com", note: "Film, photo and video location bookings" },
    ],
    resources: [
      { label: "IRS home office deduction", url: "https://www.irs.gov/businesses/small-businesses-self-employed/home-office-deduction" },
      { label: "SBA: licenses and permits", url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits" },
      { label: "IRS Self-Employed Tax Center", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center" },
    ],
  },
  {
    categories: ["Plumber (Independent)"],
    tagline: "Estimates, permits and inspections, job costs, callbacks and every license renewal behind your service calls.",
    usesClients: true,
    clientLabel: "Customers",
    jobsBoard: { label: "Service calls", placeholder: "e.g. Replace 50-gal water heater" },
    schedule: { label: "Job schedule" },
    collections: [
      estimatesLog({
        clientSingular: "Customer",
        jobTypes: [
          "Service call / leak",
          "Drain cleaning",
          "Water heater",
          "Tankless water heater",
          "Fixture install",
          "Repipe",
          "Sewer line",
          "Gas line",
          "Water line / main",
          "Backflow test",
          "Remodel rough-in",
          "Other",
        ],
        laborRate: 115,
        markup: 20,
        placeholder: "e.g. Replace 50-gal gas water heater",
        scopePlaceholder: "1x 50-gal gas water heater\n1x expansion tank + new flex connectors\nHaul away old tank\nPermit + inspection",
      }),
      jobCostsLog({
        clientSingular: "Customer",
        suppliers: ["Plumbing supply house", "Ferguson", "Home Depot", "Lowe's", "Online", "Other"],
        placeholder: "e.g. Water heater, expansion tank, fittings",
      }),
      permitsLog({
        clientSingular: "Customer",
        permitTypes: ["Plumbing", "Water heater", "Gas", "Sewer / side sewer", "Water service", "Backflow", "Building (combo)"],
        inspectionTypes: ["Underground", "Rough-in", "Pressure test", "Gas pressure test", "Final"],
      }),
      callbacksLog({ clientSingular: "Customer", placeholder: "e.g. Drip at new shower valve" }),
      licensesLog(
        [
          "State plumbing license",
          "Gas fitter license",
          "Backflow tester certification",
          "Plumbing contractor license",
          "City / county business license",
          "General liability insurance",
          "Workers' comp",
          "Commercial auto",
          "Surety / license bond",
          "Other",
        ],
        "e.g. Journeyman plumber license",
      ),
    ],
    kpis: [
      { label: "Open quotes", format: "money", value: (c) => openQuotes(c.all("estimates")), hint: "Sent and waiting on an answer" },
      { label: "Win rate YTD", format: "percent", value: (c) => winRate(c.ytd("estimates")), hint: "Accepted / (accepted + declined + expired)" },
      { label: "Open permits", format: "number", value: (c) => count(c.all("permits"), (d) => !PERMIT_CLOSED(d)), hint: "Not finaled yet" },
      { label: "Open callbacks", format: "number", value: (c) => count(c.all("callbacks"), is("status", "Open", "Scheduled")) },
      {
        label: "Renewals due (60 days)",
        format: "number",
        value: (c) => count(c.all("licenses"), dueWithin("expires", 60)),
        hint: "Licenses, certifications, insurance and bonds expiring soon or already expired",
      },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Hold the license your state requires (journeyman, master or plumbing contractor); some areas license at the city or county level",
        "Pull permits where required, commonly for water heaters, repipes, sewer and gas work, and track inspections here",
        "Gas piping and backflow testing often need their own license or certification; check your jurisdiction",
        "Carry general liability insurance; add workers' comp with employees and a bond if your state requires one",
        "Use lead-free pipe, fittings, fixtures and solder on drinking water lines (federal Safe Drinking Water Act)",
        "Pre-1978 homes: EPA lead-safe (RRP) rules apply when your work disturbs painted surfaces",
        "Track CE hours for license renewal in Licenses & insurance",
      ],
    },
    integrations: [
      { kind: "link", label: "Housecall Pro", url: "https://www.housecallpro.com" },
      { kind: "link", label: "Jobber", url: "https://getjobber.com" },
      { kind: "link", label: "Angi", url: "https://www.angi.com" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com" },
    ],
    resources: [
      { label: "IAPMO (Uniform Plumbing Code)", url: "https://www.iapmo.org" },
      { label: "ICC (International Plumbing Code)", url: "https://www.iccsafe.org" },
      { label: "EPA lead-safe renovation (RRP) program", url: "https://www.epa.gov/lead/renovation-repair-and-painting-program" },
    ],
  },
];
