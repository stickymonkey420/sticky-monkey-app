import {
  count,
  daysBetween,
  IRS_MILEAGE_RATE,
  is,
  num,
  ratio,
  sum,
  type GigCollection,
  type GigConfig,
  type GigField,
  type RecordData,
} from "../schema";

// Digital & Tech + Freelance & Creative. This is client-service work: each
// workspace tracks the real production pipeline for that trade (month-end
// closes, content calendars, shoots, cuts, assignments) next to the money.
// Income counts once: on an invoice (or payment flag) on the day it was paid,
// never again on the project or engagement it came from.

// ---------- shared helpers ----------

type Pred = (d: RecordData) => boolean;

// Local calendar day (today + offset days) as YYYY-MM-DD.
function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The YYYY-MM-DD part of a date/datetime value, "" when unset.
const dateOf = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");

// Whole days from today until a date (negative = in the past), null when unset.
function daysUntil(v: unknown): number | null {
  const s = dateOf(v);
  if (!s) return null;
  return Math.round((new Date(`${s}T00:00:00`).getTime() - new Date(`${day()}T00:00:00`).getTime()) / 86_400_000);
}

// Date is set and falls on or before today + n days (overdue rows count too).
const dueWithin =
  (key: string, days: number): Pred =>
  (d) => {
    const s = dateOf(d[key]);
    return !!s && s <= day(days);
  };

const inThisMonth =
  (key: string): Pred =>
  (d) => {
    const s = dateOf(d[key]);
    return !!s && s.slice(0, 7) === day().slice(0, 7);
  };

const yes = (v: unknown) => v === true || (typeof v === "string" && ["true", "yes", "y", "1"].includes(v.trim().toLowerCase()));
const not =
  (p: Pred): Pred =>
  (d) =>
    !p(d);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------- invoice + expense ledgers (shared shape, tailored options) ----------

const INVOICE_STATUSES = ["Draft", "Sent", "Overdue", "Paid", "Void"];
const PAYMENT_METHODS = ["ACH / bank transfer", "Card (Stripe, Square)", "PayPal", "Check", "Zelle", "Upwork / Fiverr payout", "Other"];

// Cash basis: an invoice is income on its Paid on date, and only then.
const invoiceIncome = (d: RecordData) => (is("status", "Void")(d) || !dateOf(d.paid_date) ? 0 : num(d.amount));
const invoiceOpen: Pred = (d) => !dateOf(d.paid_date) && is("status", "Sent", "Overdue")(d);
const unpaidTotal = (rows: RecordData[]) => sum(rows.filter(invoiceOpen), "amount");

function invoiceLedger(opts: { link?: { key: string; label: string; ref: string }; kinds: string[]; placeholder: string }): GigCollection {
  const fields: GigField[] = [
    { key: "invoice_no", label: "Invoice #", type: "text", required: true, placeholder: "e.g. 2026-014" },
    { key: "client", label: "Client", type: "client", list: true },
  ];
  if (opts.link) fields.push({ key: opts.link.key, label: opts.link.label, type: "ref", ref: opts.link.ref });
  fields.push(
    { key: "kind", label: "For", type: "select", options: opts.kinds },
    { key: "memo", label: "Description", type: "text", placeholder: opts.placeholder },
    { key: "amount", label: "Amount", type: "money", required: true, list: true },
    { key: "issue_date", label: "Sent", type: "date", list: true },
    { key: "due_date", label: "Due", type: "date" },
    { key: "status", label: "Status", type: "select", options: INVOICE_STATUSES, default: "Sent", list: true },
    { key: "paid_date", label: "Paid on", type: "date", help: "Counts as income on this date (leave blank until the money lands)" },
    { key: "method", label: "Paid via", type: "select", options: PAYMENT_METHODS },
    { key: "fees", label: "Processing / platform fees", type: "money", help: "Stripe, PayPal, Upwork or Fiverr fees taken out of the payment" },
  );
  return {
    key: "invoices",
    label: "Invoices",
    singular: "Invoice",
    description: "Income counts toward taxes on the Paid on date, once.",
    titleField: "invoice_no",
    dateField: "paid_date",
    statusField: "status",
    sort: { field: "issue_date", dir: "desc" },
    fields,
    computed: [
      {
        key: "days_late",
        label: "Days overdue",
        format: "number",
        fn: (d) => {
          if (!invoiceOpen(d)) return null;
          const n = daysUntil(d.due_date);
          return n !== null && n < 0 ? -n : 0;
        },
      },
      {
        key: "days_to_pay",
        label: "Days to pay",
        format: "number",
        fn: (d) => (dateOf(d.paid_date) && dateOf(d.issue_date) ? daysBetween(d.issue_date, d.paid_date) : null),
        list: false,
      },
    ],
    income: invoiceIncome,
    expense: (d) => (dateOf(d.paid_date) ? num(d.fees) : 0),
  };
}

function expenseLedger(categories: string[], placeholder: string): GigCollection {
  return {
    key: "expenses",
    label: "Expenses",
    singular: "Expense",
    titleField: "item",
    dateField: "date",
    sort: { field: "date", dir: "desc" },
    fields: [
      { key: "item", label: "Expense", type: "text", required: true, placeholder },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "category", label: "Category", type: "select", options: categories, list: true },
      { key: "amount", label: "Amount", type: "money", required: true, list: true },
      { key: "receipt", label: "Receipt link", type: "url" },
    ],
    expense: (d) => num(d.amount),
  };
}

// ---------- trade-specific math ----------

// Bookkeeping: what an engagement brings in per month.
const bkMonthly = (d: RecordData) =>
  is("fee_type", "Hourly")(d) ? num(d.hourly_rate) * num(d.est_hours) : is("fee_type", "Fixed project")(d) ? 0 : num(d.fee);
const CLOSE_STEPS = ["bank_rec", "categorized", "questions", "adjustments", "reports_sent"];

// Consulting: pipeline stages.
const OPEN_DEAL = ["Lead", "Discovery", "Proposal sent", "Negotiating"];
const WON_DEAL = ["Won", "In progress", "Completed"];
const weighted = (d: RecordData) => (is("status", ...OPEN_DEAL)(d) ? (num(d.value) * num(d.probability)) / 100 : 0);

// Social media: retainer month billed.
const smBilled = (d: RecordData) => num(d.fee) + num(d.extras);

// VA: billable hours on a task.
const vaBillableHours = (d: RecordData) => (yes(d.billable) ? num(d.minutes) / 60 : 0);

// Graphic design: revision rounds past what the contract includes.
const extraRounds = (d: RecordData) => Math.max(0, num(d.rounds_used) - num(d.rounds_included));
const designBilled = (d: RecordData) => num(d.fee) + extraRounds(d) * num(d.extra_round_fee);

// Photography: money collected on a shoot (retainer + balance), and shoot costs.
const shootCollected = (d: RecordData) =>
  (yes(d.deposit_paid) ? num(d.deposit) : 0) + (yes(d.balance_paid) ? Math.max(0, num(d.total) - (yes(d.deposit_paid) ? num(d.deposit) : 0)) : 0);
const shootCosts = (d: RecordData) => num(d.second_shooter) + num(d.other_costs) + num(d.miles) * IRS_MILEAGE_RATE;
const shootBalance = (d: RecordData) => (is("status", "Inquiry", "Canceled")(d) ? null : Math.max(0, num(d.total) - shootCollected(d)));

// Video: production costs that come out of the fee.
const videoCosts = (d: RecordData) => num(d.crew_cost) + num(d.rental_cost) + num(d.miles) * IRS_MILEAGE_RATE;
const VIDEO_ACTIVE = ["Pre-production", "Shoot", "Edit", "Revisions"];

// Writing: the fee an assignment earns (kill fee if killed).
const writerFee = (d: RecordData) => {
  const base = is("rate_type", "Flat fee")(d)
    ? num(d.rate)
    : is("rate_type", "Hourly")(d)
      ? num(d.rate) * num(d.hours)
      : num(d.rate) * num(d.word_count);
  return is("status", "Killed")(d) ? (base * num(d.kill_fee_pct)) / 100 : base;
};

// Time-tracker exports (Clockify detailed report; Toggl Track detailed report).
const TIME_CSV_HINT =
  "Clockify: Reports → Detailed → Export → CSV. Toggl Track: Reports → Detailed → Export CSV (set your duration format to decimal first so hours import as numbers).";

export const DIGITAL_CREATIVE_CONFIGS: GigConfig[] = [
  // ======================= Bookkeeping / Accounting =======================
  {
    categories: ["Bookkeeping / Accounting Services"],
    tagline: "Client engagements, a month-end close tracker for every client, filing deadlines and invoices.",
    usesClients: true,
    clientLabel: "Bookkeeping clients",
    jobsBoard: false,
    schedule: { label: "Client calls & reviews" },
    collections: [
      {
        key: "engagements",
        label: "Engagements",
        singular: "Engagement",
        description: "One per client service: what you do, in which software, and for how much.",
        titleField: "name",
        statusField: "status",
        fields: [
          { key: "name", label: "Engagement", type: "text", required: true, placeholder: "e.g. Rivera Plumbing - monthly books" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "service",
            label: "Service",
            type: "select",
            options: ["Monthly bookkeeping", "Catch-up / cleanup", "Payroll", "Sales tax filing", "1099 prep", "Year-end package for CPA", "Fractional CFO / advisory", "Other"],
            default: "Monthly bookkeeping",
            list: true,
          },
          {
            key: "software",
            label: "Software",
            type: "select",
            options: ["QuickBooks Online", "QuickBooks Desktop", "Xero", "Wave", "FreshBooks", "Zoho Books", "Sage", "Spreadsheets", "Other"],
            default: "QuickBooks Online",
            list: true,
          },
          { key: "entity_type", label: "Entity type", type: "select", options: ["Sole proprietor", "Single-member LLC", "Multi-member LLC", "S corp", "C corp", "Partnership", "Nonprofit", "Other"] },
          { key: "fiscal_year_end", label: "Fiscal year end", type: "select", options: MONTHS, default: "December" },
          { key: "basis", label: "Accounting basis", type: "select", options: ["Cash", "Accrual", "Modified cash"], default: "Cash" },
          { key: "fee_type", label: "Fee type", type: "select", options: ["Monthly retainer", "Hourly", "Fixed project"], default: "Monthly retainer" },
          { key: "fee", label: "Fee", type: "money", list: true, help: "Monthly fee for a retainer, total price for a fixed project" },
          { key: "hourly_rate", label: "Hourly rate", type: "money", help: "Hourly engagements only" },
          { key: "est_hours", label: "Est. hours", type: "number", unit: "h", help: "Per month (retainer / hourly) or total (fixed project)" },
          { key: "txn_volume", label: "Transactions / month", type: "number", help: "Bank + card transactions; the usual way to price monthly work" },
          { key: "accounts", label: "Accounts to reconcile", type: "number", help: "Bank, credit card, loan and merchant accounts" },
          { key: "payroll", label: "Payroll provider", type: "select", options: ["None", "Gusto", "ADP", "QuickBooks Payroll", "Paychex", "Other"], default: "None" },
          { key: "sales_tax", label: "Sales tax filing", type: "select", options: ["None", "Monthly", "Quarterly", "Annual"], default: "None" },
          { key: "start_date", label: "Start date", type: "date" },
          { key: "engagement_letter", label: "Engagement letter signed", type: "bool" },
          { key: "access", label: "Accountant access set up", type: "bool", help: "Your own accountant user on their file, never the client's login" },
          { key: "status", label: "Status", type: "select", options: ["Proposal", "Onboarding", "Active", "Paused", "Ended"], default: "Onboarding" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          {
            key: "eff_rate",
            label: "Effective $/hr",
            format: "money",
            fn: (d) => (is("fee_type", "Hourly")(d) ? num(d.hourly_rate) || null : ratio(num(d.fee), num(d.est_hours))),
          },
          { key: "annual_value", label: "Annual value", format: "money", fn: (d) => (is("fee_type", "Fixed project")(d) ? num(d.fee) : bkMonthly(d) * 12) },
          {
            key: "per_txn",
            label: "Fee / transaction",
            format: "money",
            fn: (d) => (is("fee_type", "Hourly", "Fixed project")(d) ? null : ratio(num(d.fee), num(d.txn_volume))),
            list: false,
          },
        ],
      },
      {
        key: "closes",
        label: "Monthly close",
        singular: "Month-end close",
        description: "One row per client per month. Tick each step as it's done.",
        titleField: "period",
        dateField: "close_by",
        statusField: "status",
        sort: { field: "close_by", dir: "desc" },
        fields: [
          { key: "period", label: "Month", type: "text", required: true, placeholder: "e.g. Sep 2026" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "engagement", label: "Engagement", type: "ref", ref: "engagements" },
          { key: "close_by", label: "Close by", type: "date", list: true, help: "Your target date, often 10-15 days after month end" },
          { key: "bank_rec", label: "Bank & card accounts reconciled", type: "bool", list: true },
          { key: "categorized", label: "Transactions categorized", type: "bool", list: true },
          { key: "questions", label: "Client questions / missing receipts resolved", type: "bool" },
          { key: "adjustments", label: "Adjusting entries posted", type: "bool", help: "Accruals, depreciation, payroll liabilities, loan interest" },
          { key: "reports_sent", label: "Reports sent (P&L, balance sheet)", type: "bool", list: true },
          { key: "hours", label: "Hours spent", type: "number", unit: "h" },
          { key: "status", label: "Status", type: "select", options: ["Not started", "Waiting on client", "In progress", "In review", "Closed"], default: "Not started" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          { key: "progress", label: "Checklist done", format: "percent", fn: (d) => CLOSE_STEPS.filter((k) => yes(d[k])).length / CLOSE_STEPS.length },
          { key: "days_left", label: "Days to target", format: "number", fn: (d) => (is("status", "Closed")(d) ? null : daysUntil(d.close_by)) },
        ],
      },
      {
        key: "deadlines",
        label: "Deadlines",
        singular: "Deadline",
        description: "Filings you or your clients owe. Add each client's at onboarding.",
        titleField: "filing",
        dateField: "due_date",
        statusField: "status",
        sort: { field: "due_date", dir: "asc" },
        fields: [
          { key: "filing", label: "Filing", type: "text", required: true, placeholder: "e.g. Q3 sales tax return" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: [
              "1099-NEC / 1096",
              "W-2 / W-3",
              "Form 941 (quarterly payroll)",
              "Form 940 (FUTA)",
              "Sales tax return",
              "Quarterly estimated tax",
              "Business tax return (to CPA)",
              "State annual report / franchise tax",
              "Business license renewal",
              "Other",
            ],
            help: "1099-NEC and W-2: Jan 31. Form 941: last day of the month after each quarter. Estimated tax: Apr 15, Jun 15, Sep 15, Jan 15.",
          },
          { key: "due_date", label: "Due", type: "date", required: true, list: true },
          { key: "period", label: "Period covered", type: "text", placeholder: "e.g. Q3 2026, tax year 2026" },
          { key: "who_files", label: "Who files", type: "select", options: ["Me", "Client", "CPA", "Payroll provider"], default: "Me" },
          { key: "status", label: "Status", type: "select", options: ["Not started", "Waiting on client", "Prepared", "Filed", "Extended", "Not required"], default: "Not started" },
          { key: "confirmation", label: "Confirmation #", type: "text" },
        ],
        computed: [{ key: "days_left", label: "Days left", format: "number", fn: (d) => (is("status", "Filed", "Not required")(d) ? null : daysUntil(d.due_date)) }],
      },
      invoiceLedger({
        link: { key: "engagement", label: "Engagement", ref: "engagements" },
        kinds: ["Monthly bookkeeping", "Catch-up / cleanup", "Payroll", "Hourly work", "Year-end / 1099 prep", "Advisory", "Other"],
        placeholder: "e.g. September bookkeeping",
      }),
      expenseLedger(
        ["Software / apps", "Professional liability (E&O) insurance", "Certification / CPE courses", "Memberships", "Subcontractors", "Home office / internet", "Marketing", "Other"],
        "e.g. ProAdvisor course, E&O policy, Dext plan",
      ),
    ],
    kpis: [
      { label: "Collected YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Monthly recurring", format: "money", value: (c) => sum(c.all("engagements").filter(is("status", "Active")), bkMonthly), hint: "Active retainers + hourly estimates" },
      { label: "Open closes", format: "number", value: (c) => count(c.all("closes"), not(is("status", "Closed"))), hint: "Months not yet closed, all clients" },
      {
        label: "Filings due in 30 days",
        format: "number",
        value: (c) => count(c.all("deadlines"), (d) => !is("status", "Filed", "Not required")(d) && dueWithin("due_date", 30)(d)),
        hint: "Includes anything overdue",
      },
      { label: "Unpaid invoices", format: "money", value: (c) => unpaidTotal(c.all("invoices")) },
    ],
    checklist: {
      label: "Practice checklist",
      items: [
        "Sign an engagement letter with every client: scope, monthly fee, close date, and what costs extra (cleanup, payroll, tax prep)",
        "Use your own free accountant login (QuickBooks Online Accountant, Xero partner) on each client file, never the client's password",
        "Add every client's filing dates to Deadlines at onboarding: 1099s, payroll returns, sales tax, annual reports",
        "Protect client data: 2FA everywhere, a secure document portal instead of email attachments, and a written information security plan",
        "Get a PTIN from the IRS before you prepare, or help prepare, any federal tax return for pay",
        "Carry professional liability (E&O) insurance; one missed filing can cost a client penalties",
        "Collect W-9s from subcontractors, file 1099-NEC by January 31, and pay your own quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "QuickBooks Online Accountant", url: "https://quickbooks.intuit.com/accountants/", note: "Free hub for all your client files plus ProAdvisor training" },
      { kind: "link", label: "Xero", url: "https://www.xero.com/us/", note: "Client file access through the Xero partner program" },
      { kind: "link", label: "Gusto", url: "https://gusto.com", note: "Payroll and contractor payments for clients" },
      { kind: "link", label: "Dext", url: "https://dext.com", note: "Receipt and bill capture so clients stop emailing photos" },
    ],
    resources: [
      { label: "IRS tax calendar for businesses (Pub 509)", url: "https://www.irs.gov/publications/p509" },
      { label: "IRS: About Form 1099-NEC", url: "https://www.irs.gov/forms-pubs/about-form-1099-nec" },
      { label: "IRS: PTIN requirements", url: "https://www.irs.gov/tax-professionals/ptin-requirements-for-tax-return-preparers" },
      { label: "AIPB (Certified Bookkeeper credential)", url: "https://www.aipb.org" },
    ],
  },

  // ======================= Consulting =======================
  {
    categories: ["Consulting (General Business)"],
    tagline: "Proposals to signed engagements, billable time, deliverables, and what each engagement really paid per hour.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Meetings & workshops" },
    collections: [
      {
        key: "engagements",
        label: "Engagements",
        singular: "Engagement",
        description: "Your pipeline: every proposal from first call to won or lost.",
        titleField: "name",
        statusField: "status",
        sort: { field: "proposal_date", dir: "desc" },
        fields: [
          { key: "name", label: "Engagement", type: "text", required: true, placeholder: "e.g. Ops assessment - Harbor Dental" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "source", label: "Lead source", type: "select", options: ["Referral", "Past client", "LinkedIn", "Website", "Upwork", "Speaking / event", "Cold outreach", "Other"] },
          { key: "scope", label: "Scope", type: "textarea", help: "Outcomes, deliverables, and what is out of scope" },
          { key: "fee_type", label: "Fee type", type: "select", options: ["Fixed fee", "Hourly", "Monthly retainer", "Day rate", "Value / success fee"], default: "Fixed fee", list: true },
          { key: "value", label: "Contract value", type: "money", list: true, help: "Total fee (retainers: monthly fee x months)" },
          { key: "rate", label: "Hourly / day rate", type: "money" },
          { key: "est_hours", label: "Estimated hours", type: "number", unit: "h" },
          { key: "probability", label: "Win probability", type: "percent", default: 50 },
          { key: "deposit_pct", label: "Upfront deposit", type: "percent", help: "Share of the fee due before kickoff" },
          { key: "proposal_date", label: "Proposal sent", type: "date" },
          { key: "start_date", label: "Start", type: "date" },
          { key: "end_date", label: "End", type: "date" },
          { key: "contract_signed", label: "Contract / SOW signed", type: "bool" },
          { key: "status", label: "Status", type: "select", options: [...OPEN_DEAL, ...WON_DEAL, "Lost", "On hold"], default: "Lead" },
          { key: "lost_reason", label: "Lost because", type: "select", options: ["Price", "Timing", "Went with a competitor", "Did it in-house", "No decision", "Other"] },
        ],
        computed: [
          { key: "weighted", label: "Weighted value", format: "money", fn: (d) => (is("status", ...OPEN_DEAL)(d) ? weighted(d) : null) },
          { key: "planned_rate", label: "Planned $/hr", format: "money", fn: (d) => ratio(num(d.value), num(d.est_hours)) },
        ],
      },
      {
        key: "time",
        label: "Time log",
        singular: "Time entry",
        description: "Log every hour, billable or not, even on fixed-fee work.",
        titleField: "task",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "task", label: "Work done", type: "text", required: true, placeholder: "e.g. Stakeholder interviews (3)" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "engagement", label: "Engagement", type: "ref", ref: "engagements", list: true },
          { key: "hours", label: "Hours", type: "number", unit: "h", required: true, list: true },
          { key: "rate", label: "Rate", type: "money", help: "Your hourly rate for this work" },
          { key: "billable", label: "Billable", type: "bool", default: true, list: true },
          { key: "category", label: "Type", type: "select", options: ["Client meeting", "Research / analysis", "Workshop / facilitation", "Deliverable prep", "Implementation", "Travel", "Sales / admin"] },
          { key: "invoiced", label: "Invoiced", type: "bool" },
        ],
        computed: [{ key: "amount", label: "Billable amount", format: "money", fn: (d) => (yes(d.billable) ? num(d.hours) * num(d.rate) : 0) }],
        csvImport: {
          hint: TIME_CSV_HINT,
          guess: {
            task: ["description", "task"],
            date: ["start date"],
            hours: ["duration (decimal)", "duration (h)", "duration", "hours"],
            rate: ["billable rate (usd)", "rate"],
            billable: ["billable"],
          },
        },
      },
      {
        key: "deliverables",
        label: "Deliverables",
        singular: "Deliverable",
        titleField: "name",
        dateField: "due_date",
        statusField: "status",
        sort: { field: "due_date", dir: "asc" },
        fields: [
          { key: "name", label: "Deliverable", type: "text", required: true, placeholder: "e.g. Current-state process map" },
          { key: "engagement", label: "Engagement", type: "ref", ref: "engagements", list: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["Report / assessment", "Presentation", "Workshop", "Process map / SOPs", "Financial model", "Implementation", "Training", "Other"],
          },
          { key: "due_date", label: "Due", type: "date", list: true },
          { key: "status", label: "Status", type: "select", options: ["Not started", "In progress", "Client review", "Revisions", "Accepted"], default: "Not started" },
          { key: "milestone_fee", label: "Milestone payment", type: "money", help: "If sign-off triggers an invoice, bill it in Invoices" },
          { key: "signed_off", label: "Client sign-off", type: "date" },
          { key: "link", label: "File link", type: "url" },
        ],
        computed: [{ key: "days_left", label: "Days left", format: "number", fn: (d) => (is("status", "Accepted")(d) ? null : daysUntil(d.due_date)) }],
      },
      invoiceLedger({
        link: { key: "engagement", label: "Engagement", ref: "engagements" },
        kinds: ["Deposit", "Milestone", "Hourly time", "Monthly retainer", "Expenses reimbursed", "Other"],
        placeholder: "e.g. Phase 1 milestone",
      }),
      expenseLedger(
        ["Travel", "Software / subscriptions", "Professional liability insurance", "Subcontractors", "Business meals (log the deductible 50%)", "Home office / internet", "Marketing", "Other"],
        "e.g. flight to client site, Miro plan",
      ),
    ],
    kpis: [
      { label: "Collected YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Weighted pipeline", format: "money", value: (c) => sum(c.all("engagements"), weighted), hint: "Open proposals x win probability" },
      {
        label: "Win rate",
        format: "percent",
        value: (c) => ratio(count(c.all("engagements"), is("status", ...WON_DEAL)), count(c.all("engagements"), is("status", ...WON_DEAL, "Lost"))),
        hint: "Won / (won + lost)",
      },
      {
        label: "Unbilled time",
        format: "money",
        value: (c) => sum(c.all("time").filter((d) => yes(d.billable) && !yes(d.invoiced)), (d) => num(d.hours) * num(d.rate)),
        hint: "Billable hours not yet invoiced",
      },
      { label: "Effective $/hr YTD", format: "money", value: (c) => ratio(c.incomeYtd, sum(c.ytd("time"), "hours")), hint: "Collected / every hour logged" },
    ],
    checklist: {
      label: "Consulting checklist",
      items: [
        "Put every engagement on a signed contract or SOW: outcomes, deliverables, fee, payment terms, and how change requests are priced",
        "Take a deposit before kickoff on fixed-fee work (25-50% is common)",
        "Log every hour, even on fixed-fee work, so Effective $/hr shows what each engagement really paid",
        "Invoice on milestones or monthly; don't let unbilled time pile up",
        "Give clients a W-9 when asked; they file a 1099-NEC if they pay you above the IRS threshold",
        "Consider professional liability (E&O) insurance; many corporate clients require it in the contract",
        "Pay quarterly estimated taxes (Form 1040-ES): April 15, June 15, September 15 and January 15",
      ],
    },
    integrations: [
      { kind: "link", label: "Toggl Track", url: "https://toggl.com/track/", note: "Free time tracking; export a detailed CSV into the Time log" },
      { kind: "link", label: "Clockify", url: "https://clockify.me", note: "Free time tracking with CSV export" },
      { kind: "link", label: "Calendly", url: "https://calendly.com", note: "Let prospects book discovery calls" },
      { kind: "link", label: "Bonsai", url: "https://www.hellobonsai.com", note: "Proposal, contract and invoice templates" },
      { kind: "link", label: "Upwork", url: "https://www.upwork.com" },
    ],
    resources: [
      { label: "IRS Self-Employed Individuals Tax Center", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center" },
      { label: "IMC USA (Certified Management Consultant)", url: "https://www.imcusa.org" },
      { label: "SBA business guide", url: "https://www.sba.gov/business-guide" },
    ],
  },

  // ======================= Social Media Manager =======================
  {
    categories: ["Social Media Manager"],
    tagline: "Client accounts per platform, a content calendar from draft to posted, and monthly retainers with reports.",
    usesClients: true,
    clientLabel: "Brands",
    jobsBoard: false,
    schedule: { label: "Content shoots & client calls" },
    collections: [
      {
        key: "accounts",
        label: "Accounts",
        singular: "Account",
        description: "One row per client profile you manage, with follower growth since you took over.",
        titleField: "handle",
        statusField: "status",
        fields: [
          { key: "handle", label: "Handle", type: "text", required: true, placeholder: "@brightsidebakery" },
          { key: "client", label: "Brand", type: "client", list: true },
          {
            key: "platform",
            label: "Platform",
            type: "select",
            options: ["Instagram", "TikTok", "Facebook", "LinkedIn", "YouTube", "X (Twitter)", "Pinterest", "Threads", "Google Business Profile"],
            list: true,
          },
          { key: "start_date", label: "Managing since", type: "date" },
          { key: "start_followers", label: "Followers at start", type: "number" },
          { key: "followers", label: "Followers now", type: "number", list: true },
          { key: "posts_per_week", label: "Posts / week (contracted)", type: "number" },
          { key: "goal", label: "Goal", type: "text", placeholder: "e.g. 10k followers, 20 DMs/leads a month" },
          {
            key: "access",
            label: "Access method",
            type: "select",
            options: ["Business Suite / platform team role", "Collaborator invite", "Password manager (shared vault)", "Scheduler connection only"],
            help: "Prefer team roles over shared passwords",
          },
          { key: "profile_url", label: "Profile link", type: "url" },
          { key: "status", label: "Status", type: "select", options: ["Onboarding", "Active", "Paused", "Offboarded"], default: "Onboarding" },
        ],
        computed: [
          { key: "growth", label: "Follower growth", format: "number", fn: (d) => (d.followers == null || d.followers === "" ? null : num(d.followers) - num(d.start_followers)) },
          { key: "growth_pct", label: "Growth", format: "percent", fn: (d) => ratio(num(d.followers) - num(d.start_followers), num(d.start_followers)) },
        ],
      },
      {
        key: "posts",
        label: "Content calendar",
        singular: "Post",
        titleField: "title",
        dateField: "post_date",
        statusField: "status",
        sort: { field: "post_date", dir: "desc" },
        fields: [
          { key: "title", label: "Post", type: "text", required: true, placeholder: "e.g. Fall menu launch reel" },
          { key: "account", label: "Account", type: "ref", ref: "accounts", list: true },
          { key: "post_date", label: "Publish at", type: "datetime", list: true },
          {
            key: "format",
            label: "Format",
            type: "select",
            options: ["Reel / short video", "Carousel", "Single image", "Story", "Text post", "Long-form video", "Live", "UGC / creator post"],
            list: true,
          },
          { key: "pillar", label: "Content pillar", type: "text", placeholder: "e.g. education, behind the scenes, promo" },
          { key: "caption", label: "Caption", type: "textarea" },
          { key: "asset_link", label: "Assets (Drive / Canva)", type: "url" },
          { key: "status", label: "Status", type: "select", options: ["Idea", "Draft", "Client review", "Approved", "Scheduled", "Posted", "Skipped"], default: "Idea" },
          { key: "live_link", label: "Live post link", type: "url" },
          { key: "reach", label: "Reach", type: "number" },
          { key: "engagements", label: "Engagements", type: "number", help: "Likes + comments + shares + saves" },
        ],
        computed: [{ key: "eng_rate", label: "Engagement rate", format: "percent", fn: (d) => ratio(num(d.engagements), num(d.reach)) }],
      },
      {
        key: "retainers",
        label: "Monthly retainers",
        singular: "Retainer month",
        description: "One row per brand per month: what you billed, what you delivered, and the report.",
        titleField: "period",
        dateField: "paid_date",
        statusField: "status",
        sort: { field: "billed_date", dir: "desc" },
        fields: [
          { key: "period", label: "Month", type: "text", required: true, placeholder: "e.g. Oct 2026" },
          { key: "client", label: "Brand", type: "client", list: true },
          { key: "package", label: "Package", type: "select", options: ["Content only", "Content + community", "Full management", "Ads management", "Strategy / audit", "Custom"] },
          { key: "fee", label: "Retainer fee", type: "money", required: true, list: true },
          { key: "extras", label: "Add-ons billed", type: "money", help: "Extra posts, shoot days, ad management fee" },
          { key: "ad_spend", label: "Client ad spend managed", type: "money", help: "Paid by the client directly; for the report only, not your income" },
          { key: "posts_contracted", label: "Posts contracted", type: "number" },
          { key: "posts_delivered", label: "Posts delivered", type: "number" },
          { key: "report_sent", label: "Monthly report sent", type: "bool", list: true },
          { key: "report_link", label: "Report link", type: "url" },
          { key: "billed_date", label: "Invoiced on", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Upcoming", "Invoiced", "Paid", "Overdue", "Waived"], default: "Upcoming" },
          { key: "paid_date", label: "Paid on", type: "date", help: "Counts as income on this date" },
          { key: "fees", label: "Payment fees", type: "money" },
        ],
        computed: [
          { key: "billed", label: "Billed", format: "money", fn: smBilled },
          { key: "delivery", label: "Delivered vs contracted", format: "percent", fn: (d) => ratio(num(d.posts_delivered), num(d.posts_contracted)) },
        ],
        income: (d) => (is("status", "Waived")(d) || !dateOf(d.paid_date) ? 0 : smBilled(d)),
        expense: (d) => (dateOf(d.paid_date) ? num(d.fees) : 0),
      },
      expenseLedger(
        ["Scheduling tool", "Design tools (Canva, Adobe)", "Phone / camera / lighting", "Stock / music licenses", "Courses / certification", "Ads for my own business", "Other"],
        "e.g. Later plan, Canva Pro, ring light",
      ),
    ],
    kpis: [
      { label: "Retainers collected YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Billed this month", format: "money", value: (c) => sum(c.all("retainers").filter((d) => inThisMonth("billed_date")(d) && !is("status", "Waived")(d)), smBilled) },
      {
        label: "Posts due in 7 days",
        format: "number",
        value: (c) => count(c.all("posts"), (d) => !is("status", "Posted", "Skipped")(d) && dueWithin("post_date", 7)(d)),
        hint: "Not posted yet, includes overdue",
      },
      { label: "Awaiting client approval", format: "number", value: (c) => count(c.all("posts"), is("status", "Client review")) },
      {
        label: "Engagement rate this month",
        format: "percent",
        value: (c) => {
          const posted = c.month("posts").filter(is("status", "Posted"));
          return ratio(sum(posted, "engagements"), sum(posted, "reach"));
        },
        hint: "Engagements / reach on posted content",
      },
    ],
    checklist: {
      label: "Client checklist",
      items: [
        "Sign a contract per brand: platforms, posts per month, approval turnaround, revision limits, and who pays ad spend",
        "Get access through Meta Business Suite or platform team roles instead of shared passwords; use a password manager when you must share",
        "Use licensed music only: business accounts are limited to commercial-use sound libraries",
        "Get written client approval before anything posts (the Client review status)",
        "Bill retainers at the start of the month and send a report with growth, reach and top posts at the end",
        "Make sure paid partnerships and influencer posts carry clear disclosures (#ad, paid partnership label)",
        "Set aside money for quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "Meta Business Suite", url: "https://business.facebook.com", note: "Schedule and get team access to Facebook and Instagram" },
      { kind: "link", label: "Later", url: "https://later.com", note: "Visual scheduler with a free plan" },
      { kind: "link", label: "Buffer", url: "https://buffer.com", note: "Free plan covers a few channels" },
      { kind: "link", label: "Canva", url: "https://www.canva.com" },
    ],
    resources: [
      { label: "FTC: Disclosures 101 for social media influencers", url: "https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers" },
      { label: "Meta Blueprint (free training)", url: "https://www.facebook.com/business/learn" },
    ],
  },

  // ======================= Virtual Assistant =======================
  {
    categories: ["Virtual Assistant"],
    tagline: "Retainer clients, a task log by the minute, and hours used against what each client bought.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Client check-ins" },
    collections: [
      {
        key: "retainers",
        label: "Retainers",
        singular: "Retainer",
        description: "What each client buys per month. Hours used come from the Task log.",
        titleField: "name",
        statusField: "status",
        fields: [
          { key: "name", label: "Retainer", type: "text", required: true, placeholder: "e.g. Dana Lee - 20 hrs/month" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "plan", label: "Plan", type: "select", options: ["Monthly hour block", "Pay as you go", "Project", "Day rate"], default: "Monthly hour block" },
          { key: "hours_bought", label: "Hours / month bought", type: "number", unit: "h", list: true },
          { key: "monthly_fee", label: "Monthly fee", type: "money", list: true },
          { key: "overage_rate", label: "Overage rate / hr", type: "money" },
          { key: "rollover", label: "Unused hours", type: "select", options: ["Don't roll over", "Roll over 1 month", "Roll over until used"], default: "Don't roll over" },
          { key: "billing_day", label: "Billing day of month", type: "number" },
          { key: "tools", label: "Client tools", type: "text", placeholder: "e.g. Gmail, Asana, Calendly, QuickBooks", help: "Never store passwords here; use a password manager" },
          { key: "start_date", label: "Start date", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Trial", "Active", "Paused", "Ended"], default: "Active" },
        ],
        computed: [{ key: "rate", label: "Effective rate", format: "money", fn: (d) => ratio(num(d.monthly_fee), num(d.hours_bought)) }],
      },
      {
        key: "tasks",
        label: "Task log",
        singular: "Task",
        description: "Log every task, even five-minute ones. Set Client so retainer usage adds up.",
        titleField: "task",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "task", label: "Task", type: "text", required: true, placeholder: "e.g. Inbox cleanup, booked 3 podcast guests" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "retainer", label: "Retainer", type: "ref", ref: "retainers" },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Email / inbox", "Calendar / scheduling", "Research", "Data entry", "Social media", "Customer support", "Invoicing / bookkeeping", "Travel booking", "Project management", "Other"],
            list: true,
          },
          { key: "minutes", label: "Time", type: "number", unit: "min", required: true, list: true },
          { key: "billable", label: "Billable", type: "bool", default: true, list: true },
        ],
        computed: [{ key: "hours", label: "Hours", format: "hours", fn: (d) => num(d.minutes) / 60 }],
      },
      invoiceLedger({
        link: { key: "retainer", label: "Retainer", ref: "retainers" },
        kinds: ["Monthly retainer", "Overage hours", "Pay-as-you-go hours", "Project", "Other"],
        placeholder: "e.g. November retainer, 20 hrs",
      }),
      expenseLedger(
        ["Software / subscriptions", "Password manager", "Internet / phone", "Computer / equipment", "Training / certification", "Platform fees", "Other"],
        "e.g. Google Workspace, Bitwarden, headset",
      ),
    ],
    kpis: [
      { label: "Collected YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Monthly recurring", format: "money", value: (c) => sum(c.all("retainers").filter(is("status", "Active")), "monthly_fee"), hint: "Active retainers" },
      {
        label: "Retainer hours used",
        format: "percent",
        value: (c) => ratio(sum(c.month("tasks"), vaBillableHours), sum(c.all("retainers").filter(is("status", "Active", "Trial")), "hours_bought")),
        hint: "Billable hours this month / hours bought",
      },
      {
        label: "Clients over their hours",
        format: "number",
        value: (c) => {
          const tasks = c.month("tasks");
          return count(c.all("retainers"), (r) => {
            if (!is("status", "Active", "Trial")(r) || !r.client || !num(r.hours_bought)) return false;
            const used = sum(tasks.filter((t) => String(t.client ?? "") === String(r.client)), vaBillableHours);
            return used > num(r.hours_bought);
          });
        },
        hint: "This month; bill overage or check rollover",
      },
      { label: "Effective $/hr YTD", format: "money", value: (c) => ratio(c.incomeYtd, sum(c.ytd("tasks"), "minutes") / 60), hint: "Collected / all time logged" },
    ],
    checklist: {
      label: "VA checklist",
      items: [
        "Sign a VA agreement with every client: hours included, response times, confidentiality, rollover and overage rate",
        "Bill retainers in advance at the start of each month",
        "Use delegated access (Gmail delegation, shared calendars, team seats) and a password manager with shared vaults; never keep client passwords in notes or email",
        "Log every task, even five-minute ones, so retainer usage is accurate",
        "Send each client an hours-used report before the retainer renews",
        "Fill out W-9s for US clients, expect 1099-NEC or 1099-K forms, and pay quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "Toggl Track", url: "https://toggl.com/track/", note: "Free timer for logging tasks as you work" },
      { kind: "link", label: "Bitwarden", url: "https://bitwarden.com", note: "Password manager with shared vaults for client logins" },
      { kind: "link", label: "Calendly", url: "https://calendly.com" },
      { kind: "link", label: "Upwork", url: "https://www.upwork.com" },
    ],
    resources: [
      { label: "IRS Self-Employed Individuals Tax Center", url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center" },
      { label: "IRS: Estimated taxes", url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes" },
      { label: "Freelancers Union", url: "https://www.freelancersunion.org" },
    ],
  },

  // ======================= Freelance Graphic Designer =======================
  {
    categories: ["Freelance Graphic Designer"],
    tagline: "Projects from brief to delivery with revision rounds tracked, invoices, and the fonts, stock and software licenses behind them.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Client calls & presentations" },
    collections: [
      {
        key: "projects",
        label: "Projects",
        singular: "Project",
        titleField: "name",
        statusField: "status",
        sort: { field: "due_date", dir: "asc" },
        fields: [
          { key: "name", label: "Project", type: "text", required: true, placeholder: "e.g. Brightside Bakery brand identity" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["Logo", "Brand identity", "Packaging", "Web / UI design", "Social graphics", "Print (flyers, menus, signage)", "Illustration", "Pitch deck", "Book / editorial", "Merch / apparel", "Other"],
            list: true,
          },
          { key: "fee", label: "Project fee", type: "money", list: true },
          { key: "deposit_pct", label: "Deposit", type: "percent", default: 50 },
          { key: "rounds_included", label: "Revision rounds included", type: "number", default: 2 },
          { key: "rounds_used", label: "Revision rounds used", type: "number", default: 0 },
          { key: "extra_round_fee", label: "Fee per extra round", type: "money" },
          { key: "hours", label: "Hours spent", type: "number", unit: "h" },
          { key: "start_date", label: "Brief received", type: "date" },
          { key: "due_date", label: "Due", type: "date", list: true },
          { key: "status", label: "Status", type: "select", options: ["Proposal", "Brief", "Concepts", "Revisions", "Final files", "Delivered", "On hold", "Canceled"], default: "Brief" },
          { key: "contract_signed", label: "Contract signed", type: "bool" },
          {
            key: "rights",
            label: "Usage rights",
            type: "select",
            options: ["Copyright transfers on final payment", "Exclusive license", "Non-exclusive license", "Limited use (see contract)"],
            default: "Copyright transfers on final payment",
          },
          { key: "deliverable_link", label: "Final files link", type: "url" },
          { key: "portfolio_ok", label: "OK to show in portfolio", type: "bool" },
        ],
        computed: [
          { key: "deposit_due", label: "Deposit amount", format: "money", fn: (d) => (num(d.fee) * num(d.deposit_pct)) / 100, list: false },
          { key: "extra_fees", label: "Extra-round fees", format: "money", fn: (d) => extraRounds(d) * num(d.extra_round_fee) },
          { key: "eff_rate", label: "Effective $/hr", format: "money", fn: (d) => ratio(designBilled(d), num(d.hours)) },
        ],
      },
      invoiceLedger({
        link: { key: "project", label: "Project", ref: "projects" },
        kinds: ["Deposit", "Milestone", "Final payment", "Extra revisions", "Rush fee", "Other"],
        placeholder: "e.g. 50% deposit - brand identity",
      }),
      {
        key: "assets",
        label: "Assets & licenses",
        singular: "License / asset",
        description: "Fonts, stock, mockups and software. Keep the license so you can prove the client's use is covered.",
        titleField: "name",
        dateField: "purchased",
        sort: { field: "purchased", dir: "desc" },
        fields: [
          { key: "name", label: "Asset", type: "text", required: true, placeholder: "e.g. Adobe Creative Cloud, Gilroy font family" },
          {
            key: "kind",
            label: "Kind",
            type: "select",
            options: ["Software subscription", "Font", "Stock photo / vector", "Mockup / template", "Plugin", "Hardware", "Other"],
            list: true,
          },
          { key: "vendor", label: "Vendor", type: "text", placeholder: "e.g. Adobe, MyFonts, Envato, Creative Market" },
          {
            key: "license_type",
            label: "License",
            type: "select",
            options: ["Subscription", "Desktop font", "Web font", "App / digital ads font", "Standard stock", "Extended stock (merch, resale)", "Perpetual / one-time", "Other"],
          },
          { key: "seats", label: "Seats / devices", type: "number" },
          { key: "project", label: "Bought for project", type: "ref", ref: "projects" },
          { key: "purchased", label: "Purchased", type: "date", required: true },
          { key: "cost", label: "Cost", type: "money", required: true, list: true, help: "One row per charge, or one row for an annual plan" },
          { key: "renews", label: "Renews / expires", type: "date" },
          { key: "license_link", label: "License / receipt", type: "url" },
        ],
        expense: (d) => num(d.cost),
      },
    ],
    kpis: [
      { label: "Paid YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Active projects", format: "number", value: (c) => count(c.all("projects"), is("status", "Brief", "Concepts", "Revisions", "Final files")) },
      { label: "Unpaid invoices", format: "money", value: (c) => unpaidTotal(c.all("invoices")) },
      {
        label: "Over revision limit",
        format: "number",
        value: (c) => count(c.all("projects"), (d) => extraRounds(d) > 0 && !is("status", "Canceled")(d)),
        hint: "Bill extra rounds per your contract",
      },
      {
        label: "Effective $/hr (delivered)",
        format: "money",
        value: (c) => {
          const done = c.all("projects").filter((d) => is("status", "Delivered")(d) && num(d.hours) > 0);
          return ratio(sum(done, designBilled), sum(done, "hours"));
        },
        hint: "Fee + extra rounds / hours on delivered projects",
      },
    ],
    checklist: {
      label: "Studio checklist",
      items: [
        "Use a contract for every project: scope, revision rounds, timeline, kill fee, and when rights transfer (usually on final payment)",
        "Take a deposit (commonly 50%) before starting concepts",
        "Keep a license record for every font, stock image and mockup, and check it covers the client's use (web, app, print run, merch)",
        "Release final files (vector, PNG, PDF, brand guide) after the final payment clears",
        "Back up working files in two places, such as an external drive plus cloud storage",
        "Give clients a W-9; expect 1099-NEC forms from clients and 1099-K forms from platforms like Upwork or Fiverr",
        "Set aside money for quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "Adobe Creative Cloud", url: "https://www.adobe.com/creativecloud.html" },
      { kind: "link", label: "Figma", url: "https://www.figma.com", note: "Free starter plan for UI and presentation work" },
      { kind: "link", label: "Behance", url: "https://www.behance.net", note: "Portfolio that clients search" },
      { kind: "link", label: "Upwork", url: "https://www.upwork.com" },
      { kind: "link", label: "Fiverr", url: "https://www.fiverr.com" },
    ],
    resources: [
      { label: "Graphic Artists Guild (pricing & ethical guidelines)", url: "https://graphicartistsguild.org" },
      { label: "AIGA (design business resources and contracts)", url: "https://www.aiga.org" },
      { label: "U.S. Copyright Office: Works made for hire (Circular 30)", url: "https://www.copyright.gov/circs/circ30.pdf" },
    ],
  },

  // ======================= Freelance Photographer =======================
  {
    categories: ["Freelance Photographer"],
    tagline: "Shoots from inquiry to gallery delivery, retainers and balances, your packages, and the gear you can write off.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Shoots & consultations" },
    collections: [
      {
        key: "shoots",
        label: "Shoots",
        singular: "Shoot",
        description: "Retainer and balance count as income in the shoot date's year once marked paid.",
        titleField: "name",
        dateField: "shoot_date",
        statusField: "status",
        sort: { field: "shoot_date", dir: "desc" },
        fields: [
          { key: "name", label: "Shoot", type: "text", required: true, placeholder: "e.g. Garcia wedding, Hollow Coffee product shoot" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["Wedding", "Engagement", "Portrait / headshots", "Family / newborn", "Event", "Product", "Real estate", "Brand / commercial", "Sports", "Other"],
            list: true,
          },
          { key: "shoot_date", label: "Shoot date", type: "date", required: true, list: true },
          { key: "location", label: "Location", type: "text" },
          { key: "package", label: "Package", type: "ref", ref: "packages" },
          { key: "hours", label: "Coverage hours", type: "number", unit: "h" },
          { key: "edit_hours", label: "Culling / editing hours", type: "number", unit: "h" },
          { key: "total", label: "Total price", type: "money", list: true },
          { key: "deposit", label: "Retainer", type: "money", help: "Usually non-refundable; holds the date" },
          { key: "deposit_paid", label: "Retainer paid", type: "bool", help: "If a shoot is canceled and you refund the retainer, uncheck this" },
          { key: "balance_paid", label: "Balance paid", type: "bool" },
          { key: "contract_signed", label: "Contract signed", type: "bool" },
          { key: "usage", label: "Image license", type: "select", options: ["Personal use", "Commercial license", "Editorial", "Limited (see contract)"], default: "Personal use" },
          { key: "model_release", label: "Model / property release", type: "bool" },
          { key: "second_shooter", label: "Second shooter / assistant paid", type: "money", help: "Contractor cost; collect a W-9" },
          { key: "other_costs", label: "Other shoot costs", type: "money", help: "Rentals, permits, props, prints, album" },
          { key: "miles", label: "Miles driven (round trip)", type: "number", unit: "mi" },
          { key: "status", label: "Status", type: "select", options: ["Inquiry", "Booked", "Shot", "Editing", "Delivered", "Canceled"], default: "Inquiry" },
          { key: "delivery_due", label: "Gallery due", type: "date" },
          { key: "gallery_link", label: "Gallery link", type: "url" },
        ],
        computed: [
          { key: "balance_due", label: "Balance due", format: "money", fn: shootBalance },
          { key: "per_hour", label: "Effective $/hr", format: "money", fn: (d) => ratio(num(d.total) - shootCosts(d), num(d.hours) + num(d.edit_hours)) },
        ],
        income: shootCollected,
        expense: shootCosts,
      },
      {
        key: "packages",
        label: "Packages",
        singular: "Package",
        titleField: "name",
        fields: [
          { key: "name", label: "Package", type: "text", required: true, placeholder: "e.g. Wedding - 8 hr Collection" },
          { key: "type", label: "Shoot type", type: "select", options: ["Wedding", "Engagement", "Portrait / headshots", "Family / newborn", "Event", "Product", "Real estate", "Brand / commercial", "Other"] },
          { key: "price", label: "Price", type: "money", required: true, list: true },
          { key: "hours", label: "Coverage", type: "number", unit: "h", list: true },
          { key: "images", label: "Edited images", type: "number" },
          { key: "turnaround_days", label: "Delivery time", type: "number", unit: "days" },
          { key: "deposit_pct", label: "Retainer", type: "percent", default: 30 },
          { key: "includes", label: "Includes", type: "textarea", placeholder: "Second shooter, engagement session, online gallery, print release, album" },
          { key: "active", label: "Offered now", type: "bool", default: true },
        ],
        computed: [
          { key: "per_hour", label: "Price / coverage hour", format: "money", fn: (d) => ratio(num(d.price), num(d.hours)) },
          { key: "per_image", label: "Price / image", format: "money", fn: (d) => ratio(num(d.price), num(d.images)) },
        ],
      },
      {
        key: "gear",
        label: "Gear",
        singular: "Gear item",
        description: "Equipment is usually deductible in the year bought (Section 179 / bonus depreciation); confirm with your tax preparer.",
        titleField: "item",
        dateField: "purchased",
        statusField: "status",
        sort: { field: "purchased", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. Sony A7 IV body" },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: ["Camera body", "Lens", "Lighting / flash", "Drone", "Computer / storage", "Bag / tripod / support", "Other"],
            list: true,
          },
          { key: "purchased", label: "Purchased", type: "date", required: true },
          { key: "cost", label: "Cost", type: "money", required: true, list: true },
          { key: "condition", label: "Bought", type: "select", options: ["New", "Used"], default: "New" },
          { key: "serial", label: "Serial #", type: "text", help: "For insurance claims and theft reports" },
          { key: "insured", label: "On insurance schedule", type: "bool" },
          { key: "status", label: "Status", type: "select", options: ["In use", "Backup", "In repair", "Sold"], default: "In use", help: "Selling gear you wrote off is usually taxable; tell your tax preparer" },
        ],
        expense: (d) => num(d.cost),
      },
      expenseLedger(
        ["Software (Lightroom, gallery host)", "Insurance", "Marketing / ads", "Website / domain", "Workshops / education", "Repairs / cleaning", "Memberships", "Other"],
        "e.g. Pixieset plan, PPA membership, sensor cleaning",
      ),
    ],
    kpis: [
      { label: "Collected YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After second shooters, mileage, gear and expenses" },
      { label: "Upcoming shoots", format: "number", value: (c) => count(c.all("shoots"), (d) => is("status", "Booked")(d) && dateOf(d.shoot_date) >= day()) },
      { label: "Galleries to deliver", format: "number", value: (c) => count(c.all("shoots"), is("status", "Shot", "Editing")), hint: "Shot but not delivered yet" },
      { label: "Balances outstanding", format: "money", value: (c) => sum(c.all("shoots"), (d) => shootBalance(d) ?? 0) },
    ],
    checklist: {
      label: "Shoot checklist",
      items: [
        "Use a contract for every shoot: deliverables, gallery turnaround, image license (personal vs commercial), and cancellation / reschedule terms",
        "Take a retainer to hold the date and collect the balance before or on shoot day",
        "Get model releases (and property releases) for any image used commercially or in ads",
        "Back up every card right away: 3 copies, 2 kinds of media, 1 off-site",
        "Insure your gear and carry liability insurance; many venues ask for a certificate of insurance",
        "Log gear purchases with serial numbers; they are usually deductible the year you buy them",
        "Collect W-9s from second shooters (1099-NEC above the IRS threshold) and pay quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "Pixieset", url: "https://pixieset.com", note: "Client galleries with a free tier" },
      { kind: "link", label: "ShootProof", url: "https://www.shootproof.com", note: "Galleries, contracts and invoices" },
      { kind: "link", label: "HoneyBook", url: "https://www.honeybook.com", note: "Booking, contracts and payments" },
    ],
    resources: [
      { label: "Professional Photographers of America (PPA)", url: "https://www.ppa.com" },
      { label: "ASMP (business and licensing resources)", url: "https://www.asmp.org" },
      { label: "IRS Publication 946: How to depreciate property", url: "https://www.irs.gov/publications/p946" },
      { label: "U.S. Copyright Office", url: "https://www.copyright.gov" },
    ],
  },

  // ======================= Freelance Videographer / Editor =======================
  {
    categories: ["Freelance Videographer / Editor"],
    tagline: "Productions from pre-pro through edit and revisions, deliverable specs per cut, music licenses, and your real rate after crew.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Shoot days & client reviews" },
    collections: [
      {
        key: "projects",
        label: "Projects",
        singular: "Project",
        description: "Crew, rentals and mileage count as expenses on the start date. Bill the fee in Invoices.",
        titleField: "name",
        dateField: "start_date",
        statusField: "status",
        sort: { field: "start_date", dir: "desc" },
        fields: [
          { key: "name", label: "Project", type: "text", required: true, placeholder: "e.g. Northwind brand film" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["Brand / commercial", "Wedding film", "Event", "Music video", "Corporate / training", "Social content", "Documentary", "Real estate", "Edit only", "Other"],
            list: true,
          },
          { key: "pricing", label: "Pricing", type: "select", options: ["Flat project fee", "Day rate", "Hourly edit"], default: "Flat project fee" },
          { key: "fee", label: "Project fee", type: "money", list: true, help: "Total agreed (day rate x days, or hours x rate)" },
          { key: "start_date", label: "Start / first shoot day", type: "date", required: true },
          { key: "shoot_days", label: "Shoot days", type: "number", unit: "days" },
          { key: "shoot_hours", label: "Shoot hours (total)", type: "number", unit: "h" },
          { key: "edit_hours", label: "Edit hours", type: "number", unit: "h" },
          { key: "revisions_included", label: "Revision rounds included", type: "number", default: 2 },
          { key: "revisions_used", label: "Revision rounds used", type: "number", default: 0 },
          { key: "crew_cost", label: "Crew paid", type: "money", help: "Second shooter, sound, gaffer (collect W-9s)" },
          { key: "rental_cost", label: "Gear / location rentals", type: "money" },
          { key: "miles", label: "Miles driven", type: "number", unit: "mi" },
          { key: "raw_footage", label: "Raw footage", type: "select", options: ["Not included", "Included", "Extra fee"], default: "Not included" },
          { key: "contract_signed", label: "Contract signed", type: "bool" },
          { key: "status", label: "Stage", type: "select", options: ["Inquiry", ...VIDEO_ACTIVE, "Delivered", "Canceled"], default: "Inquiry" },
          { key: "due_date", label: "Final delivery due", type: "date", list: true },
          { key: "review_link", label: "Review link (Frame.io etc.)", type: "url" },
          { key: "archived", label: "Project archived (drive + cloud)", type: "bool" },
        ],
        computed: [
          { key: "net", label: "Net after crew & rentals", format: "money", fn: (d) => num(d.fee) - videoCosts(d) },
          { key: "eff_rate", label: "Effective $/hr", format: "money", fn: (d) => ratio(num(d.fee) - videoCosts(d), num(d.shoot_hours) + num(d.edit_hours)) },
          { key: "extra_revisions", label: "Extra revision rounds", format: "number", fn: (d) => Math.max(0, num(d.revisions_used) - num(d.revisions_included)), list: false },
        ],
        expense: videoCosts,
      },
      {
        key: "deliverables",
        label: "Deliverables",
        singular: "Deliverable",
        description: "One row per cut, with the exact specs the client needs.",
        titleField: "name",
        dateField: "due_date",
        statusField: "status",
        sort: { field: "due_date", dir: "asc" },
        fields: [
          { key: "name", label: "Cut", type: "text", required: true, placeholder: "e.g. 60s hero cut, 15s vertical cutdown" },
          { key: "project", label: "Project", type: "ref", ref: "projects", list: true },
          { key: "aspect", label: "Aspect ratio", type: "select", options: ["16:9", "9:16", "1:1", "4:5", "2.39:1", "4:3"], default: "16:9", list: true },
          { key: "length_sec", label: "Length", type: "number", unit: "sec", list: true },
          { key: "resolution", label: "Resolution", type: "select", options: ["1080p", "4K UHD", "DCI 4K", "720p"], default: "1080p" },
          { key: "frame_rate", label: "Frame rate", type: "select", options: ["23.976", "24", "25", "29.97", "30", "50", "59.94", "60"], default: "23.976" },
          { key: "codec", label: "Delivery format", type: "select", options: ["H.264 MP4", "H.265 / HEVC", "ProRes 422", "ProRes 422 HQ", "ProRes 4444", "DNxHR"], default: "H.264 MP4" },
          { key: "captions", label: "Captions / SRT", type: "bool" },
          { key: "music", label: "Music track", type: "ref", ref: "licenses", help: "Link the license that covers this cut" },
          { key: "version", label: "Current version", type: "number", placeholder: "e.g. 3" },
          { key: "status", label: "Status", type: "select", options: ["Not started", "Rough cut", "Fine cut", "Client review", "Revisions", "Approved", "Delivered"], default: "Not started" },
          { key: "due_date", label: "Due", type: "date" },
          { key: "link", label: "Delivery link", type: "url" },
        ],
      },
      invoiceLedger({
        link: { key: "project", label: "Project", ref: "projects" },
        kinds: ["Deposit", "Shoot day(s)", "Final payment", "Extra revisions", "Raw footage", "Kill fee", "Other"],
        placeholder: "e.g. 50% deposit - brand film",
      }),
      {
        key: "licenses",
        label: "Music, licenses & gear",
        singular: "Purchase",
        description: "Keep license IDs: platforms ask for them when content gets flagged.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Item", type: "text", required: true, placeholder: "e.g. Artlist annual, Sony FX3, single-track license" },
          {
            key: "kind",
            label: "Kind",
            type: "select",
            options: ["Music license / subscription", "Stock footage", "Software (NLE, plugins, LUTs)", "Camera / lens", "Audio gear", "Lighting / grip", "Storage / drives", "Other"],
            list: true,
          },
          { key: "vendor", label: "Vendor", type: "text", placeholder: "e.g. Artlist, Musicbed, Epidemic Sound, B&H" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "cost", label: "Cost", type: "money", required: true, list: true },
          { key: "license_scope", label: "License covers", type: "select", options: ["Online / social", "Paid ads", "Broadcast / TV", "Film festival", "All media", "Not a license"] },
          { key: "license_id", label: "License / certificate #", type: "text" },
          { key: "project", label: "Project", type: "ref", ref: "projects" },
          { key: "expires", label: "Expires / renews", type: "date" },
          { key: "serial", label: "Serial # (gear)", type: "text" },
        ],
        expense: (d) => num(d.cost),
      },
    ],
    kpis: [
      { label: "Paid YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After crew, rentals, mileage, licenses and gear" },
      { label: "In production", format: "number", value: (c) => count(c.all("projects"), is("status", ...VIDEO_ACTIVE)) },
      {
        label: "Cuts due in 14 days",
        format: "number",
        value: (c) => count(c.all("deliverables"), (d) => !is("status", "Approved", "Delivered")(d) && dueWithin("due_date", 14)(d)),
        hint: "Includes overdue",
      },
      { label: "Unpaid invoices", format: "money", value: (c) => unpaidTotal(c.all("invoices")) },
    ],
    checklist: {
      label: "Production checklist",
      items: [
        "Use a contract for every project: deliverables, revision rounds, delivery dates, raw footage policy, usage, and kill fee",
        "Take a deposit (often 50%) to hold shoot dates",
        "License every music track and stock clip for the client's actual use; paid ads and broadcast often need a higher tier",
        "Get talent and location releases for commercial work, and an FAA Part 107 certificate before flying a drone for pay",
        "Offload every card to two drives before formatting, and keep one copy off-site",
        "Insure your gear and carry liability insurance; many locations ask for a certificate of insurance",
        "Collect W-9s from crew (1099-NEC above the IRS threshold) and pay quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "Frame.io", url: "https://frame.io", note: "Client review with frame-accurate comments" },
      { kind: "link", label: "Artlist", url: "https://artlist.io", note: "Music and SFX subscription license" },
      { kind: "link", label: "Musicbed", url: "https://www.musicbed.com" },
      { kind: "link", label: "Epidemic Sound", url: "https://www.epidemicsound.com" },
      { kind: "link", label: "DaVinci Resolve", url: "https://www.blackmagicdesign.com/products/davinciresolve", note: "Free editor and color grading" },
    ],
    resources: [
      { label: "FAA: Commercial drone operators (Part 107)", url: "https://www.faa.gov/uas/commercial_operators" },
      { label: "U.S. Copyright Office", url: "https://www.copyright.gov" },
      { label: "IRS Publication 946: How to depreciate property", url: "https://www.irs.gov/publications/p946" },
    ],
  },

  // ======================= Freelance Writer =======================
  {
    categories: ["Freelance Writer"],
    tagline: "Assignments from pitch to paid with your real $/word and $/hour, plus a pitch tracker with follow-ups.",
    usesClients: true,
    clientLabel: "Editors & clients",
    jobsBoard: false,
    schedule: { label: "Interviews & editor calls" },
    collections: [
      {
        key: "assignments",
        label: "Assignments",
        singular: "Assignment",
        description: "Income counts on the Paid on date (kill fee only if killed).",
        titleField: "title",
        dateField: "paid_date",
        statusField: "status",
        sort: { field: "due_date", dir: "desc" },
        fields: [
          { key: "title", label: "Working title", type: "text", required: true },
          { key: "client", label: "Publication / client", type: "client", list: true },
          { key: "editor", label: "Editor", type: "text" },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["Feature", "Reported / news", "Essay / op-ed", "Blog / SEO content", "Copywriting", "Ghostwriting", "Newsletter", "White paper / case study", "Technical writing", "Grant writing", "Other"],
          },
          { key: "word_count", label: "Word count", type: "number", unit: "words", list: true },
          { key: "rate_type", label: "Rate type", type: "select", options: ["Per word", "Flat fee", "Hourly"], default: "Per word" },
          { key: "rate", label: "Rate", type: "money", help: "Per word (e.g. 0.50), the flat fee, or your hourly rate" },
          { key: "hours", label: "Hours (research, interviews, writing, edits)", type: "number", unit: "h" },
          { key: "kill_fee_pct", label: "Kill fee", type: "percent", default: 25 },
          { key: "pay_terms", label: "Paid", type: "select", options: ["On acceptance", "On publication", "Net 30", "Net 60", "Upfront deposit"], default: "On acceptance" },
          {
            key: "rights",
            label: "Rights sold",
            type: "select",
            options: ["First North American serial", "All rights", "Work for hire", "Exclusive for a period", "Non-exclusive / reprint", "Ghostwritten (no byline)"],
          },
          { key: "due_date", label: "Due", type: "date", list: true },
          { key: "status", label: "Status", type: "select", options: ["Pitched", "Assigned", "Drafted", "Submitted", "Edited", "Published", "Invoiced", "Paid", "Killed"], default: "Assigned" },
          { key: "published_url", label: "Published link", type: "url" },
          { key: "invoiced_date", label: "Invoiced on", type: "date" },
          { key: "paid_date", label: "Paid on", type: "date", help: "Counts as income on this date" },
        ],
        computed: [
          { key: "fee", label: "Fee", format: "money", fn: writerFee },
          { key: "per_word", label: "$ / word", format: "money", fn: (d) => ratio(writerFee(d), num(d.word_count)) },
          { key: "per_hour", label: "$ / hour", format: "money", fn: (d) => ratio(writerFee(d), num(d.hours)) },
          {
            key: "days_to_pay",
            label: "Days to pay",
            format: "number",
            fn: (d) => (dateOf(d.paid_date) && dateOf(d.invoiced_date) ? daysBetween(d.invoiced_date, d.paid_date) : null),
            list: false,
          },
        ],
        income: (d) => (dateOf(d.paid_date) ? writerFee(d) : 0),
      },
      {
        key: "pitches",
        label: "Pitches",
        singular: "Pitch",
        description: "One row per outlet you pitch. Follow up after 1-2 weeks, then pitch elsewhere.",
        titleField: "idea",
        dateField: "sent_date",
        statusField: "status",
        sort: { field: "sent_date", dir: "desc" },
        fields: [
          { key: "idea", label: "Pitch", type: "text", required: true, placeholder: "e.g. Why small towns are betting on e-bikes" },
          { key: "outlet", label: "Outlet", type: "text", required: true, list: true, placeholder: "e.g. Wired, a trade magazine, a brand blog" },
          { key: "editor", label: "Editor", type: "text" },
          { key: "editor_contact", label: "Editor email", type: "text" },
          { key: "sent_date", label: "Sent", type: "date", list: true },
          { key: "follow_up", label: "Follow up on", type: "date", list: true, help: "Usually 1-2 weeks after sending" },
          { key: "status", label: "Status", type: "select", options: ["Drafting", "Sent", "Followed up", "Accepted", "Rejected", "No response", "Pitched elsewhere"], default: "Drafting" },
          { key: "offered_rate", label: "Rate offered", type: "money" },
          { key: "assignment", label: "Became assignment", type: "ref", ref: "assignments" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          {
            key: "days_waiting",
            label: "Days waiting",
            format: "number",
            fn: (d) => {
              if (!is("status", "Sent", "Followed up")(d)) return null;
              const n = daysUntil(d.sent_date);
              return n === null ? null : Math.max(0, -n);
            },
          },
        ],
      },
      expenseLedger(
        ["Software (writing, grammar, transcription)", "Research / subscriptions", "Books", "Travel for reporting", "Professional dues", "Submission / contest fees", "Home office / internet", "Other"],
        "e.g. Otter.ai plan, newspaper subscription",
      ),
    ],
    kpis: [
      { label: "Paid YTD", format: "money", value: (c) => c.incomeYtd },
      {
        label: "Owed to you",
        format: "money",
        value: (c) => sum(c.all("assignments").filter((d) => !dateOf(d.paid_date) && is("status", "Published", "Invoiced", "Killed")(d)), writerFee),
        hint: "Published, invoiced or killed, not paid yet",
      },
      {
        label: "Avg. $/word YTD",
        format: "money",
        value: (c) => {
          const rows = c.ytd("assignments").filter((d) => num(d.word_count) > 0);
          return ratio(sum(rows, writerFee), sum(rows, "word_count"));
        },
        hint: "Paid work this year",
      },
      {
        label: "Pitch acceptance",
        format: "percent",
        value: (c) => ratio(count(c.all("pitches"), is("status", "Accepted")), count(c.all("pitches"), not(is("status", "Drafting")))),
        hint: "Accepted / pitches sent",
      },
      {
        label: "Follow-ups due",
        format: "number",
        value: (c) => count(c.all("pitches"), (d) => is("status", "Sent", "Followed up")(d) && dueWithin("follow_up", 0)(d)),
      },
    ],
    checklist: {
      label: "Writer checklist",
      items: [
        "Get every assignment in writing: word count, rate, deadline, rights, kill fee, and when you're paid (on acceptance vs on publication)",
        "Know which rights you're selling (first serial, all rights, work for hire) before you sign",
        "Invoice the day a piece is accepted and follow up on anything unpaid after 30 days",
        "Follow up on pitches after 1-2 weeks, then pitch the idea to the next outlet",
        "Save PDFs of published clips and back up drafts and interview recordings; links break and pieces get taken down",
        "Fill out W-9s for clients, expect 1099-NEC forms, and pay quarterly estimated taxes (Form 1040-ES)",
      ],
    },
    integrations: [
      { kind: "link", label: "Contently", url: "https://contently.com", note: "Brand content talent network" },
      { kind: "link", label: "Muck Rack", url: "https://muckrack.com", note: "Free journalist portfolio and editor lookups" },
      { kind: "link", label: "Upwork", url: "https://www.upwork.com" },
    ],
    resources: [
      { label: "The Authors Guild", url: "https://www.authorsguild.org" },
      { label: "ASJA (American Society of Journalists and Authors)", url: "https://www.asja.org" },
      { label: "Editorial Freelancers Association (rate chart)", url: "https://www.the-efa.org" },
      { label: "Freelancers Union", url: "https://www.freelancersunion.org" },
    ],
  },
];
