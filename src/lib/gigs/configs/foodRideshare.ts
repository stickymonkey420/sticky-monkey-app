import {
  count,
  hoursBetween,
  IRS_MILEAGE_RATE,
  is,
  num,
  ratio,
  sum,
  type GigCollection,
  type GigComputed,
  type GigConfig,
  type GigField,
  type GigKpi,
  type RecordData,
} from "../schema";

// Hospitality & Food + Rideshare & Delivery.
//
// Driving gigs are built around a shift log: time online, what the app paid
// (base pay, promotions and tips kept separate) and business miles. "Net $/hr"
// subtracts the IRS standard mileage rate, the honest cost of running the car
// (gas, wear, depreciation). Taxes use the standard mileage method:
//   income  = pay + promotions + tips
//   expense = miles x IRS rate + tolls + parking (+ app service fees when fares
//             are entered gross, as on the Uber/Lyft tax summary)
// Gas, repairs and insurance go in Vehicle costs for history and comparison
// only; they are never deducted on top of the mileage rate.
//
// Food gigs are built around the booking or service day with costing next to
// it (food cost %, cost per unit, quotes). Ingredient purchases are deducted
// once, where they're bought; per-order / per-event food costs are estimates
// for pricing and never hit Taxes. Grocery reimbursements (personal chef) are
// counted both ways: the reimbursement is income and the groceries are an
// expense.

// ---------- shared helpers ----------

const RATE = `${(IRS_MILEAGE_RATE * 100).toFixed(1)}¢/mi`;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isoDay = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

// Whole days from today until a date or datetime (negative once it has passed).
function daysUntil(v: unknown): number | null {
  const day = isoDay(v);
  if (!day) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(day + "T00:00:00").getTime() - today.getTime()) / 86_400_000);
}

// Expiring within N days, or already expired.
const expiresWithin = (key: string, days: number) => (d: RecordData) => {
  const left = daysUntil(d[key]);
  return left != null && left <= days;
};

// Coming up in the next N days (today included).
const dueWithin = (key: string, days: number) => (d: RecordData) => {
  const left = daysUntil(d[key]);
  return left != null && left >= 0 && left <= days;
};

const weekdayOf = (key: string) => (d: RecordData) => {
  const day = isoDay(d[key]);
  return day ? WEEKDAYS[new Date(day + "T00:00:00").getDay()] : "";
};

// The group (weekday, app, station, spot...) with the best value per hour.
function bestBy(
  rows: RecordData[],
  group: (d: RecordData) => string,
  value: (d: RecordData) => number,
  hours: (d: RecordData) => number,
): string | null {
  const totals = new Map<string, { v: number; h: number }>();
  for (const r of rows) {
    const g = group(r).trim();
    const h = hours(r);
    if (!g || !h) continue;
    const t = totals.get(g) ?? { v: 0, h: 0 };
    t.v += value(r);
    t.h += h;
    totals.set(g, t);
  }
  let best: string | null = null;
  let bestRate = -Infinity;
  for (const [g, t] of totals) {
    const rate = t.v / t.h;
    if (rate > bestRate) {
      best = g;
      bestRate = rate;
    }
  }
  return best == null ? null : `${best} (${bestRate < 0 ? "-" : ""}$${Math.abs(bestRate).toFixed(2)}/hr)`;
}

// Business share of a whole-percent field; blank means 100%.
const share = (v: unknown) => (v === undefined || v === null || v === "" ? 1 : num(v) / 100);

const NOTES_FIELD: GigField = { key: "notes", label: "Notes", type: "textarea" };
const RECEIPT_FIELD: GigField = { key: "receipt", label: "Receipt link", type: "url" };

function expensesCollection(opts: {
  placeholder: string;
  categories: string[];
  description?: string;
  categoryHelp?: string;
}): GigCollection {
  return {
    key: "expenses",
    label: "Expenses",
    singular: "Expense",
    titleField: "item",
    dateField: "date",
    sort: { field: "date", dir: "desc" },
    description: opts.description,
    fields: [
      { key: "item", label: "Expense", type: "text", required: true, placeholder: opts.placeholder },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "category", label: "Category", type: "select", options: [...opts.categories, "Other"], list: true, help: opts.categoryHelp },
      { key: "amount", label: "Amount", type: "money", required: true, list: true },
      {
        key: "business_pct",
        label: "Business use",
        type: "percent",
        default: 100,
        help: "For things you also use personally (phone, data plan, loan interest): the share used for work, e.g. 60",
      },
      RECEIPT_FIELD,
    ],
    computed: [{ key: "deductible", label: "Deductible", format: "money", fn: (d) => num(d.amount) * share(d.business_pct) }],
    expense: (d) => num(d.amount) * share(d.business_pct),
  };
}

// ---------- shared: driving ----------

const mileCost = (d: RecordData) => num(d.miles) * IRS_MILEAGE_RATE;
const onlineHours = (d: RecordData) => num(d.online_hours) || hoursBetween(d.start, d.end);
const earned = (d: RecordData) => num(d.pay) + num(d.promotions) + num(d.tips);
const driveCosts = (d: RecordData) => mileCost(d) + num(d.tolls) + num(d.parking) + num(d.service_fees);
const driveNet = (d: RecordData) => earned(d) - driveCosts(d);

const MILES_FIELD: GigField = {
  key: "miles",
  label: "Business miles",
  type: "number",
  unit: "mi",
  list: true,
  help: "Every mile driven for work: to pickups, with the order or rider, and between jobs. App-reported miles usually undercount, so use a tracker or your odometer.",
};
const TOLLS_FIELD: GigField = {
  key: "tolls",
  label: "Tolls",
  type: "money",
  help: "Log tolls even when the app paid you back (the payback is already in your pay)",
};
const PARKING_FIELD: GigField = { key: "parking", label: "Parking", type: "money", help: "Business parking fees only; tickets and fines aren't deductible" };
const VEHICLE_FIELD: GigField = { key: "vehicle", label: "Vehicle", type: "ref", ref: "vehicles" };
const IMPORT_ID_FIELD: GigField = {
  key: "external_ref",
  label: "Import ID",
  type: "text",
  help: "Filled in by CSV import so re-importing the same file doesn't duplicate rows",
};

const timeFields = (startLabel: string, endLabel: string, hoursLabel: string): GigField[] => [
  { key: "start", label: startLabel, type: "datetime" },
  { key: "end", label: endLabel, type: "datetime" },
  { key: "online_hours", label: hoursLabel, type: "number", unit: "h", list: true, help: "Leave blank to use the start and end times" },
];

const shiftComputed = (unitKey: string, unitLabel: string): GigComputed[] => [
  { key: "earned", label: "Earned", format: "money", fn: earned },
  { key: "per_hour", label: "$ / hr", format: "money", fn: (d) => ratio(earned(d), onlineHours(d)) },
  { key: "net_per_hour", label: "Net $ / hr", format: "money", fn: (d) => ratio(driveNet(d), onlineHours(d)) },
  { key: "per_mile", label: "$ / mile", format: "money", fn: (d) => ratio(earned(d), num(d.miles)) },
  { key: "per_unit", label: `$ / ${unitLabel}`, format: "money", fn: (d) => ratio(earned(d), num(d[unitKey])), list: false },
  { key: "tips_share", label: "Tips share", format: "percent", fn: (d) => ratio(num(d.tips), earned(d)), list: false },
  { key: "hours", label: "Hours online", format: "hours", fn: (d) => onlineHours(d) || null, list: false },
];

const netPerHour = (rows: RecordData[]) => ratio(sum(rows, driveNet), sum(rows, onlineHours));

const SHIFT_CSV_GUESS: Record<string, string[]> = {
  date: ["date", "date/time", "trip date", "shift date", "start date", "day"],
  start: ["start time", "started at", "shift start", "start"],
  end: ["end time", "ended at", "shift end", "end"],
  online_hours: ["hours", "online hours", "hours worked", "total hours"],
  pay: ["fare", "fares", "base fare", "base pay", "net fare", "pay", "payout"],
  promotions: ["promotion", "promotions", "incentives", "bonus", "bonuses", "surge", "quest", "boost", "peak pay"],
  tips: ["tip", "tips", "customer tips"],
  miles: ["miles", "business miles", "total miles", "mileage", "distance", "distance (mi)"],
  tolls: ["toll", "tolls"],
  parking: ["parking"],
  external_ref: ["trip id", "trip uuid", "shift id", "id"],
};

const VEHICLES: GigCollection = {
  key: "vehicles",
  label: "Vehicles",
  singular: "Vehicle",
  titleField: "name",
  statusField: "status",
  description:
    "Odometer readings for the year, coverage and renewal dates. Schedule C asks for your total miles and when the vehicle was first used for business, so record both readings every year.",
  fields: [
    { key: "name", label: "Vehicle", type: "text", required: true, placeholder: "e.g. 2021 Toyota Camry Hybrid" },
    { key: "plate", label: "Plate", type: "text" },
    { key: "in_service", label: "First used for business", type: "date" },
    { key: "odo_start", label: "Odometer Jan 1", type: "number", unit: "mi", list: true, help: "Or the reading on the day you started driving for work this year" },
    { key: "odo_end", label: "Odometer Dec 31", type: "number", unit: "mi", list: true, help: "Update it as you go; the final reading on Dec 31 (or when you stop)" },
    {
      key: "coverage",
      label: "Coverage while working",
      type: "select",
      options: ["Rideshare endorsement", "Delivery endorsement", "Commercial auto policy", "Personal policy only", "Not sure"],
      default: "Not sure",
      list: true,
      help: "Personal auto policies often exclude driving for pay, and app-provided insurance has gaps (e.g. while you wait for a request). Ask your insurer.",
    },
    { key: "insurer", label: "Insurance company", type: "text" },
    { key: "renewal", label: "Policy renewal", type: "date" },
    { key: "registration_due", label: "Registration due", type: "date" },
    { key: "inspection_due", label: "Inspection due", type: "date", help: "Rideshare apps require a yearly vehicle inspection in many states" },
    { key: "status", label: "Status", type: "select", options: ["In service", "Sold / retired"], default: "In service" },
    NOTES_FIELD,
  ],
  computed: [
    {
      key: "total_miles",
      label: "Total miles this year",
      format: "number",
      fn: (d) => (num(d.odo_start) > 0 && num(d.odo_end) > num(d.odo_start) ? num(d.odo_end) - num(d.odo_start) : null),
    },
  ],
};

const VEHICLE_COSTS: GigCollection = {
  key: "car_costs",
  label: "Vehicle costs",
  singular: "Vehicle cost",
  titleField: "item",
  dateField: "date",
  sort: { field: "date", dir: "desc" },
  description: `Gas, maintenance, repairs, insurance. With the standard mileage rate (${RATE}) these are already covered, so they are not deducted again. Log them for your maintenance history and to compare with the actual-expense method.`,
  fields: [
    { key: "item", label: "What", type: "text", required: true, placeholder: "e.g. Oil change, 2 front tires, 6-month premium" },
    { key: "date", label: "Date", type: "date", required: true },
    VEHICLE_FIELD,
    {
      key: "category",
      label: "Category",
      type: "select",
      options: ["Gas / charging", "Oil change / service", "Tires", "Repairs", "Insurance", "Registration / inspection", "Lease / loan payment", "Other"],
      list: true,
    },
    { key: "amount", label: "Amount", type: "money", required: true, list: true },
    { key: "odometer", label: "Odometer", type: "number", unit: "mi" },
    { key: "next_due", label: "Next service due at", type: "number", unit: "mi" },
    { key: "vendor", label: "Shop / station", type: "text" },
    RECEIPT_FIELD,
  ],
};

const DRIVER_EXPENSE_HELP =
  "Gas, repairs and insurance go in Vehicle costs (covered by the mileage rate). Car washes are a gray area with the standard rate; ask a tax pro. Car loan interest: enter the business share.";

const driverExpenses = (categories: string[]) =>
  expensesCollection({
    placeholder: "e.g. Phone plan, phone mount, insulated bags",
    categories: [...categories, "Car loan interest"],
    description: "Business costs you can deduct on top of the mileage rate.",
    categoryHelp: DRIVER_EXPENSE_HELP,
  });

const MILEAGE_TRACKERS: NonNullable<GigConfig["integrations"]> = [
  { kind: "link", label: "Gridwise", url: "https://gridwise.io", note: "Free app: tracks miles automatically, pulls earnings from your gig apps, exports CSV" },
  { kind: "link", label: "Stride", url: "https://www.stridehealth.com", note: "Free mileage and expense tracker; exports a mileage log" },
];

const DRIVING_RESOURCES: NonNullable<GigConfig["resources"]> = [
  { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
  { label: "IRS Gig Economy Tax Center", url: "https://www.irs.gov/businesses/gig-economy-tax-center" },
  { label: "IRS Publication 463 (car expenses, commuting rules)", url: "https://www.irs.gov/publications/p463" },
  { label: "IRS estimated taxes", url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes" },
];

const milesYtdKpi = (collection: string): GigKpi => ({
  label: "Business miles YTD",
  format: "number",
  value: (c) => sum(c.ytd(collection), "miles"),
});

const mileageDeductionKpi = (collection: string): GigKpi => ({
  label: "Mileage deduction YTD",
  format: "money",
  value: (c) => sum(c.ytd(collection), mileCost),
  hint: `Business miles x ${RATE}. Gas and repairs are not deducted on top.`,
});

// ---------- Rideshare & Delivery ----------

const RIDESHARE: GigConfig = {
  categories: ["Uber / Lyft Driver"],
  tagline: "Shift log with real $/hr after the cost of your car, plus miles, vehicle and expense records for tax time.",
  usesClients: false,
  jobsBoard: false,
  schedule: false,
  collections: [
    {
      key: "shifts",
      label: "Shifts",
      singular: "Shift",
      titleField: "date",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      description: `One row per driving session. Net $/hr subtracts the IRS mileage rate (${RATE}), tolls and parking: what you really made per hour.`,
      fields: [
        { key: "date", label: "Date", type: "date", required: true },
        { key: "platform", label: "App", type: "select", options: ["Uber", "Lyft", "Uber + Lyft", "Other"], default: "Uber", list: true },
        ...timeFields("Went online", "Went offline", "Online hours"),
        { key: "active_hours", label: "Engaged hours", type: "number", unit: "h", help: "Time driving to pickups and on trips, from the app's earnings details" },
        { key: "trips", label: "Trips", type: "number", list: true },
        { key: "pay", label: "Fares (your earnings)", type: "money", help: "What the app paid you for trips, before promotions and tips" },
        { key: "promotions", label: "Surge / Quests / bonuses", type: "money", help: "Uber Quests and Boost, Lyft Streaks and ride challenges, referral bonuses" },
        { key: "tips", label: "Tips", type: "money" },
        {
          key: "service_fees",
          label: "Service fees (gross fares only)",
          type: "money",
          help: "Only if you entered gross rider fares (as on your annual tax summary): enter the app's service and booking fees here so they're deducted. Leave blank if Fares is your payout.",
        },
        MILES_FIELD,
        TOLLS_FIELD,
        PARKING_FIELD,
        { key: "area", label: "Area / zone", type: "text", placeholder: "e.g. Airport queue, downtown bar close" },
        VEHICLE_FIELD,
        NOTES_FIELD,
        IMPORT_ID_FIELD,
      ],
      computed: [
        ...shiftComputed("trips", "trip"),
        { key: "engaged", label: "Engaged %", format: "percent", fn: (d) => ratio(num(d.active_hours), onlineHours(d)), list: false },
      ],
      income: earned,
      expense: driveCosts,
      csvImport: {
        hint: "Uber: drivers.uber.com, Earnings, Statements (download CSV). Lyft: driver dashboard, Earnings, statements. Or export your shifts from Gridwise. Trip-level files import one row per trip; add your miles if the file has none.",
        guess: { ...SHIFT_CSV_GUESS, platform: ["platform", "service", "app", "company"], trips: ["trips", "rides", "trip count", "number of trips"] },
        idField: "external_ref",
      },
    },
    VEHICLES,
    VEHICLE_COSTS,
    driverExpenses([
      "Phone & data plan",
      "Phone mount / chargers / cables",
      "Rider amenities (water, mints, chargers)",
      "Dash cam",
      "Car wash / interior cleaning",
      "Tracking app subscription",
      "Airport permit / city license",
    ]),
  ],
  kpis: [
    { label: "Net $/hr this month", format: "money", value: (c) => netPerHour(c.month("shifts")), hint: `Earnings minus ${RATE}, tolls and parking, per online hour` },
    { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd, hint: "Fares, promotions and tips" },
    milesYtdKpi("shifts"),
    mileageDeductionKpi("shifts"),
    { label: "Best day of week", format: "text", value: (c) => bestBy(c.ytd("shifts"), weekdayOf("date"), driveNet, onlineHours), hint: "Highest net $/hr this year" },
  ],
  checklist: {
    label: "Driver checklist",
    items: [
      "Call your insurer before your first trip: add a rideshare endorsement or commercial policy (personal policies often exclude driving for pay)",
      "Write down your odometer on January 1 (or your first day) and December 31, and add the vehicle under Vehicles",
      "Track every business mile from your first trip of the year; an app like Gridwise or Stride does it automatically",
      "Use the standard mileage rate: it replaces gas, repairs and insurance, so don't also deduct gas",
      "Set aside part of every payout and pay quarterly estimated taxes (April, June, September, January)",
      "Uber and Lyft send an annual tax summary and a 1099-K and/or 1099-NEC when you pass the reporting thresholds; report all income even without a form",
      "Keep your vehicle inspection and documents current in the driver app",
    ],
  },
  integrations: [
    { kind: "link", label: "Uber driver dashboard", url: "https://drivers.uber.com", note: "Weekly statements (CSV) and your annual tax summary" },
    { kind: "link", label: "Lyft Driver", url: "https://www.lyft.com/driver", note: "Weekly statements and tax documents" },
    ...MILEAGE_TRACKERS,
  ],
  resources: DRIVING_RESOURCES,
};

const FOOD_DELIVERY: GigConfig = {
  categories: ["DoorDash / Uber Eats / Grubhub"],
  tagline: "Dash log across every app: real $/hr and $/mile after car costs, tips share, and which app pays best.",
  usesClients: false,
  jobsBoard: false,
  schedule: { label: "Planned dashes" },
  collections: [
    {
      key: "shifts",
      label: "Dashes",
      singular: "Dash",
      titleField: "date",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      description: `One row per app per session. Multi-apping? Log a row for each app (split hours and miles roughly) to see which one pays best. Net $/hr subtracts ${RATE}, tolls and parking.`,
      fields: [
        { key: "date", label: "Date", type: "date", required: true },
        {
          key: "platform",
          label: "App",
          type: "select",
          options: ["DoorDash", "Uber Eats", "Grubhub", "Spark Driver", "Instacart", "Shipt", "Gopuff", "Other"],
          default: "DoorDash",
          list: true,
        },
        ...timeFields("Started", "Ended", "Dash / online hours"),
        { key: "active_hours", label: "Active hours", type: "number", unit: "h", help: "Time from accepting an order to drop-off (DoorDash shows this as active time)" },
        { key: "orders", label: "Deliveries", type: "number", list: true },
        { key: "declined", label: "Offers declined", type: "number", help: "For your acceptance rate" },
        { key: "pay", label: "Base pay", type: "money", help: "App pay before tips and promotions" },
        { key: "promotions", label: "Peak pay / challenges / promos", type: "money" },
        { key: "tips", label: "Customer tips", type: "money" },
        MILES_FIELD,
        TOLLS_FIELD,
        PARKING_FIELD,
        { key: "zone", label: "Zone", type: "text", placeholder: "e.g. Downtown, Northside" },
        VEHICLE_FIELD,
        NOTES_FIELD,
        IMPORT_ID_FIELD,
      ],
      computed: [
        ...shiftComputed("orders", "delivery"),
        { key: "active_rate", label: "$ / active hr", format: "money", fn: (d) => ratio(earned(d), num(d.active_hours)), list: false },
        {
          key: "acceptance",
          label: "Acceptance rate",
          format: "percent",
          fn: (d) => (num(d.declined) || num(d.orders) ? ratio(num(d.orders), num(d.orders) + num(d.declined)) : null),
          list: false,
        },
      ],
      income: earned,
      expense: driveCosts,
      csvImport: {
        hint: "Export your shifts from Gridwise (it pulls DoorDash, Uber Eats and Grubhub earnings) or a mileage log from Stride. Import one or the other for the same days, not both.",
        guess: { ...SHIFT_CSV_GUESS, platform: ["platform", "service", "app", "company", "gig"], orders: ["deliveries", "orders", "order count", "trips"] },
        idField: "external_ref",
      },
    },
    VEHICLES,
    VEHICLE_COSTS,
    driverExpenses([
      "Phone & data plan",
      "Insulated / hot bags",
      "Phone mount / chargers",
      "Car wash / interior cleaning",
      "Tracking app subscription",
      "Bike / e-bike gear",
    ]),
  ],
  kpis: [
    { label: "Net $/hr this month", format: "money", value: (c) => netPerHour(c.month("shifts")), hint: `Pay, promos and tips minus ${RATE}, tolls and parking, per online hour` },
    { label: "$/mile this month", format: "money", value: (c) => ratio(sum(c.month("shifts"), earned), sum(c.month("shifts"), "miles")), hint: "Total earned per business mile" },
    { label: "Tips share YTD", format: "percent", value: (c) => ratio(sum(c.ytd("shifts"), "tips"), sum(c.ytd("shifts"), earned)) },
    mileageDeductionKpi("shifts"),
    { label: "Best app", format: "text", value: (c) => bestBy(c.ytd("shifts"), (d) => String(d.platform ?? ""), driveNet, onlineHours), hint: "Highest net $/hr this year" },
  ],
  checklist: {
    label: "Dasher checklist",
    items: [
      "Tell your insurer you deliver; many personal policies exclude it, so ask about a delivery endorsement",
      "Write down your odometer on January 1 (or your first dash) and December 31",
      "Track every business mile from your first delivery; app-reported miles only count part of your driving",
      "Use the standard mileage rate: it replaces gas, repairs and insurance, so don't also deduct gas",
      "Keep receipts for hot bags, phone mounts and your phone plan (business share)",
      "Each app sends its own 1099 when you pass its reporting threshold; report all income even without a form",
      "Pay quarterly estimated taxes (April, June, September, January)",
    ],
  },
  integrations: [
    { kind: "link", label: "DoorDash Dasher", url: "https://dasher.doordash.com" },
    { kind: "link", label: "Uber driver dashboard (Uber Eats)", url: "https://drivers.uber.com" },
    { kind: "link", label: "Grubhub for Drivers", url: "https://driver.grubhub.com" },
    ...MILEAGE_TRACKERS,
  ],
  resources: DRIVING_RESOURCES,
};

const INSTACART: GigConfig = {
  categories: ["Instacart Shopper"],
  tagline: "Batch-by-batch pay, $/item and $/mile, plus shopping days for your real hourly rate and mileage deduction.",
  usesClients: false,
  jobsBoard: false,
  schedule: false,
  collections: [
    {
      key: "batches",
      label: "Batches",
      singular: "Batch",
      titleField: "store",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      description: "Every batch you take, to learn which stores, sizes and batch types are worth accepting. Deductible miles go in Shopping days.",
      fields: [
        { key: "store", label: "Store", type: "text", required: true, placeholder: "e.g. Costco, Safeway on Main" },
        { key: "date", label: "Date", type: "date", required: true },
        {
          key: "batch_type",
          label: "Batch type",
          type: "select",
          options: ["Full service (shop & deliver)", "Shop only", "Delivery only"],
          default: "Full service (shop & deliver)",
          list: true,
        },
        { key: "orders", label: "Orders in batch", type: "number", default: 1, help: "2 or 3 for doubles and triples" },
        { key: "items", label: "Items", type: "number", list: true },
        { key: "units", label: "Units", type: "number", help: "Total units if the offer showed them (6 yogurts = 6 units)" },
        { key: "heavy", label: "Heavy order", type: "bool", help: "Cases of water, pet food, etc." },
        { key: "start", label: "Accepted", type: "datetime" },
        { key: "end", label: "Delivered", type: "datetime" },
        { key: "pay", label: "Batch pay", type: "money", list: true, help: "Instacart's pay for the batch, including heavy pay and boosts" },
        { key: "promotions", label: "Quests / bonuses", type: "money" },
        { key: "tips", label: "Tip (final)", type: "money", list: true, help: "Customers can change tips after delivery; update this once it settles" },
        { key: "offer_miles", label: "Offer distance", type: "number", unit: "mi", help: "Distance on the offer, for $/mile only. Deductible miles go in Shopping days." },
        {
          key: "issue",
          label: "Issues",
          type: "select",
          options: ["None", "Lots of replacements / refunds", "Long checkout", "Customer unreachable", "Hard drop-off", "Tip lowered"],
          default: "None",
        },
        NOTES_FIELD,
      ],
      computed: [
        { key: "earned", label: "Earned", format: "money", fn: earned },
        { key: "active_rate", label: "$ / active hr", format: "money", fn: (d) => ratio(earned(d), hoursBetween(d.start, d.end)) },
        { key: "per_mile", label: "$ / offer mile", format: "money", fn: (d) => ratio(earned(d), num(d.offer_miles)) },
        { key: "per_item", label: "$ / item", format: "money", fn: (d) => ratio(earned(d), num(d.items)), list: false },
        { key: "tips_share", label: "Tips share", format: "percent", fn: (d) => ratio(num(d.tips), earned(d)), list: false },
      ],
      income: earned,
    },
    {
      key: "days",
      label: "Shopping days",
      singular: "Shopping day",
      titleField: "date",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      description: `Your time online and business miles for the day. Hours here give your real $/hr (waiting time included); miles here are your mileage deduction at ${RATE}.`,
      fields: [
        { key: "date", label: "Date", type: "date", required: true },
        ...timeFields("Went online", "Went offline", "Online hours"),
        MILES_FIELD,
        TOLLS_FIELD,
        PARKING_FIELD,
        { key: "zone", label: "Zone / stores", type: "text" },
        VEHICLE_FIELD,
        NOTES_FIELD,
        IMPORT_ID_FIELD,
      ],
      computed: [
        { key: "hours", label: "Hours online", format: "hours", fn: (d) => onlineHours(d) || null },
        { key: "mileage", label: "Mileage deduction", format: "money", fn: mileCost },
      ],
      expense: driveCosts,
      csvImport: {
        hint: "Export a mileage log from Stride or Gridwise (CSV). Rows can be per trip or per day; miles add up either way.",
        guess: {
          date: SHIFT_CSV_GUESS.date,
          start: SHIFT_CSV_GUESS.start,
          end: SHIFT_CSV_GUESS.end,
          online_hours: SHIFT_CSV_GUESS.online_hours,
          miles: SHIFT_CSV_GUESS.miles,
          tolls: SHIFT_CSV_GUESS.tolls,
          parking: SHIFT_CSV_GUESS.parking,
          external_ref: ["trip id", "shift id", "id"],
        },
        idField: "external_ref",
      },
    },
    VEHICLES,
    VEHICLE_COSTS,
    driverExpenses(["Phone & data plan", "Insulated bags / coolers", "Folding cart / dolly", "Phone mount / chargers", "Car wash / interior cleaning", "Tracking app subscription"]),
  ],
  kpis: [
    { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd, hint: "Batch pay, bonuses and tips" },
    {
      label: "Net $/hr this month",
      format: "money",
      value: (c) => ratio(sum(c.month("batches"), earned) - sum(c.month("days"), driveCosts), sum(c.month("days"), onlineHours)),
      hint: `Batch earnings minus ${RATE}, tolls and parking, per online hour logged in Shopping days`,
    },
    { label: "Avg. per batch this month", format: "money", value: (c) => ratio(sum(c.month("batches"), earned), count(c.month("batches"))) },
    { label: "Tips share YTD", format: "percent", value: (c) => ratio(sum(c.ytd("batches"), "tips"), sum(c.ytd("batches"), earned)) },
    mileageDeductionKpi("days"),
  ],
  checklist: {
    label: "Shopper checklist",
    items: [
      "This workspace is for full-service (independent contractor, 1099) shopping; in-store shopper pay on a W-2 doesn't belong here",
      "Tell your insurer you deliver; many personal policies exclude it, so ask about a delivery endorsement",
      "Track every business mile from your first batch of the year and write down your odometer on January 1 and December 31",
      "Use the standard mileage rate: it replaces gas, repairs and insurance, so don't also deduct gas",
      "Keep insulated bags in the car for cold items and keep the receipts",
      "Instacart sends a 1099 when you pass the reporting threshold; report all income even without a form",
      "Pay quarterly estimated taxes (April, June, September, January)",
    ],
  },
  integrations: [{ kind: "link", label: "Instacart Shopper", url: "https://shoppers.instacart.com" }, ...MILEAGE_TRACKERS],
  resources: DRIVING_RESOURCES,
};

const flexHours = (d: RecordData) => hoursBetween(d.block_start, d.finished) || num(d.block_hours);
const flexEarned = (d: RecordData) => (is("status", "Completed")(d) ? earned(d) : 0);

const AMAZON_FLEX: GigConfig = {
  categories: ["Amazon Flex Driver"],
  tagline: "Block log by station: offered vs. real $/hr after miles, packages per block, and your mileage deduction.",
  usesClients: false,
  jobsBoard: false,
  schedule: { label: "Reserved blocks" },
  collections: [
    {
      key: "blocks",
      label: "Blocks",
      singular: "Block",
      titleField: "station",
      dateField: "block_start",
      statusField: "status",
      sort: { field: "block_start", dir: "desc" },
      description: `Flex pays per block, not per hour: finishing early raises your real $/hr, long routes and returns lower it. Net $/hr subtracts ${RATE}, tolls and parking.`,
      fields: [
        { key: "station", label: "Station / store", type: "text", required: true, placeholder: "e.g. DLV3, Whole Foods on 5th" },
        { key: "block_start", label: "Block start", type: "datetime", required: true },
        { key: "block_hours", label: "Block length", type: "number", unit: "h", default: 3.5, list: true, help: "Scheduled length, usually 3 to 4.5 hours" },
        {
          key: "block_type",
          label: "Block type",
          type: "select",
          options: ["Logistics (Amazon.com)", "Amazon Fresh", "Whole Foods", "Instant offer", "Other"],
          default: "Logistics (Amazon.com)",
        },
        { key: "status", label: "Status", type: "select", options: ["Reserved", "Completed", "Released", "Forfeited"], default: "Reserved", list: true },
        { key: "pay", label: "Block pay", type: "money", list: true, help: "The offered pay, including any surge" },
        { key: "tips", label: "Tips", type: "money", help: "Fresh and Whole Foods blocks can include customer tips" },
        { key: "promotions", label: "Adjustments / extra pay", type: "money", help: "Extra pay Amazon added after the block" },
        { key: "finished", label: "Finished at", type: "datetime", help: "Last drop or return to station" },
        { key: "stops", label: "Stops", type: "number" },
        { key: "packages", label: "Packages", type: "number" },
        { key: "returns", label: "Packages returned", type: "number" },
        {
          ...MILES_FIELD,
          help: "Station to your route, the route, and back. The drive from home to the station may count as commuting unless your home is your main place of business.",
        },
        TOLLS_FIELD,
        PARKING_FIELD,
        VEHICLE_FIELD,
        NOTES_FIELD,
      ],
      computed: [
        { key: "earned", label: "Earned", format: "money", fn: (d) => (is("status", "Completed")(d) ? earned(d) : null) },
        { key: "offer_rate", label: "Offered $/hr", format: "money", fn: (d) => ratio(num(d.pay), num(d.block_hours)) },
        { key: "real_rate", label: "Real $/hr", format: "money", fn: (d) => (is("status", "Completed")(d) ? ratio(earned(d), flexHours(d)) : null) },
        { key: "net_rate", label: "Net $/hr", format: "money", fn: (d) => (is("status", "Completed")(d) ? ratio(driveNet(d), flexHours(d)) : null) },
        { key: "actual_hours", label: "Actual hours", format: "hours", fn: (d) => hoursBetween(d.block_start, d.finished) || null, list: false },
        { key: "per_stop", label: "$ / stop", format: "money", fn: (d) => ratio(flexEarned(d), num(d.stops)), list: false },
      ],
      income: flexEarned,
      expense: (d) => (is("status", "Reserved")(d) ? 0 : driveCosts(d)),
    },
    VEHICLES,
    VEHICLE_COSTS,
    driverExpenses(["Phone & data plan", "Phone mount / chargers", "Hand truck / dolly", "Safety vest / gloves", "Car wash / interior cleaning", "Tracking app subscription"]),
  ],
  kpis: [
    { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd, hint: "Completed blocks: pay, adjustments and tips" },
    { label: "Blocks this month", format: "number", value: (c) => count(c.month("blocks"), is("status", "Completed")) },
    {
      label: "Real $/hr this month",
      format: "money",
      value: (c) => {
        const done = c.month("blocks").filter(is("status", "Completed"));
        return ratio(sum(done, earned), sum(done, flexHours));
      },
      hint: "Per hour actually worked (block start to finish)",
    },
    {
      label: "Best station",
      format: "text",
      value: (c) => bestBy(c.ytd("blocks").filter(is("status", "Completed")), (d) => String(d.station ?? ""), driveNet, flexHours),
      hint: "Highest net $/hr this year",
    },
    mileageDeductionKpi("blocks"),
  ],
  checklist: {
    label: "Flex checklist",
    items: [
      "Check your own auto policy: app-provided coverage only applies during blocks, so ask your insurer about a delivery endorsement",
      "Write down your odometer on January 1 (or your first block) and December 31",
      "Track every business mile from your first block of the year, including the route and the drive back to the station",
      "Use the standard mileage rate: it replaces gas, repairs and insurance, so don't also deduct gas",
      "Compare stations by Real $/hr, not offered pay: long routes and returns quietly cut your rate",
      "Amazon sends a 1099 when you pass the reporting threshold; report all income even without a form",
      "Pay quarterly estimated taxes (April, June, September, January)",
    ],
  },
  integrations: [{ kind: "link", label: "Amazon Flex", url: "https://flex.amazon.com" }, ...MILEAGE_TRACKERS],
  resources: DRIVING_RESOURCES,
};

const courierCharge = (d: RecordData) => num(d.fee) + num(d.rush_fee) + num(d.extras);
const courierDone = is("status", "Delivered", "Invoiced", "Paid");
const courierDrove = (d: RecordData) => !is("status", "Quoted", "Scheduled")(d);
const courierCosts = (d: RecordData) => mileCost(d) + num(d.tolls) + num(d.parking);
const ratePrice = (d: RecordData, miles: number) => num(d.base) + Math.max(0, miles - num(d.included_miles)) * num(d.per_mile);

const COURIER: GigConfig = {
  categories: ["Courier / Same-Day Delivery"],
  tagline: "Deliveries by client with rush and wait charges, proof of delivery, unpaid invoices, and $/mile after car costs.",
  usesClients: true,
  clientLabel: "Clients",
  jobsBoard: false,
  schedule: { label: "Pickups" },
  collections: [
    {
      key: "deliveries",
      label: "Deliveries",
      singular: "Delivery",
      titleField: "job",
      dateField: "date",
      statusField: "status",
      sort: { field: "date", dir: "desc" },
      description: `Each job from quote to paid. Income counts once it's delivered; miles count once you've driven. Net subtracts ${RATE}, tolls and parking.`,
      fields: [
        { key: "job", label: "Job", type: "text", required: true, placeholder: "e.g. Court filing: Smith & Co to County Courthouse" },
        { key: "client", label: "Client", type: "client", list: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "pickup_time", label: "Pickup time", type: "datetime" },
        { key: "delivered_at", label: "Delivered at", type: "datetime" },
        {
          key: "service",
          label: "Service level",
          type: "select",
          options: ["Standard same-day", "Rush (2-hour)", "Direct / hot shot", "Scheduled", "Route (multi-stop)", "After-hours / weekend"],
          default: "Standard same-day",
          list: true,
        },
        {
          key: "cargo",
          label: "Cargo",
          type: "select",
          options: ["Documents / legal", "Small parcel", "Medical / lab specimens", "Pharmacy", "Auto / industrial parts", "Large / palletized", "Other"],
        },
        { key: "booked_via", label: "Booked via", type: "select", options: ["Direct client", "Roadie", "Curri", "GoShare", "Frayt", "Other app / broker"], default: "Direct client" },
        { key: "pickup", label: "Pickup address", type: "text" },
        { key: "dropoff", label: "Drop-off address", type: "text" },
        { key: "stops", label: "Stops", type: "number", default: 1 },
        { ...MILES_FIELD, label: "Miles driven", help: "Total miles for the job, including getting to the pickup" },
        { key: "fee", label: "Delivery fee", type: "money", list: true },
        { key: "rush_fee", label: "Rush / after-hours surcharge", type: "money" },
        { key: "extras", label: "Wait time / extra stops / fuel surcharge", type: "money" },
        TOLLS_FIELD,
        PARKING_FIELD,
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["Quoted", "Scheduled", "Picked up", "Delivered", "Invoiced", "Paid", "Canceled"],
          default: "Scheduled",
          list: true,
        },
        { key: "pod", label: "Proof of delivery", type: "text", placeholder: "Signed by, or photo link" },
        { key: "invoice_no", label: "Invoice #", type: "text" },
        NOTES_FIELD,
      ],
      computed: [
        { key: "charge", label: "Charge", format: "money", fn: courierCharge },
        { key: "per_mile", label: "$ / mile", format: "money", fn: (d) => ratio(courierCharge(d), num(d.miles)) },
        { key: "net", label: "Net after mileage", format: "money", fn: (d) => courierCharge(d) - courierCosts(d) },
      ],
      income: (d) => (courierDone(d) ? courierCharge(d) : 0),
      expense: (d) => (courierDrove(d) ? courierCosts(d) : 0),
    },
    {
      key: "rates",
      label: "Rate card",
      singular: "Rate",
      titleField: "name",
      description: `Your price list. The 20-mile columns show what a typical job pays and what's left after ${RATE} for driving out and back.`,
      fields: [
        { key: "name", label: "Service", type: "text", required: true, placeholder: "e.g. Standard same-day, Downtown rush" },
        { key: "client", label: "Client-specific rate", type: "client", help: "Leave blank for your standard rates" },
        { key: "base", label: "Base fee", type: "money", list: true, help: "Covers the pickup and the included miles" },
        { key: "included_miles", label: "Miles included", type: "number", unit: "mi", default: 10 },
        { key: "per_mile", label: "Per extra mile", type: "money", list: true },
        { key: "rush_pct", label: "Rush surcharge", type: "percent", default: 50 },
        { key: "wait_rate", label: "Wait time per 15 min", type: "money" },
        { key: "extra_stop", label: "Per extra stop", type: "money" },
        NOTES_FIELD,
      ],
      computed: [
        { key: "price_20", label: "20-mi job", format: "money", fn: (d) => ratePrice(d, 20) },
        { key: "rush_20", label: "20-mi rush", format: "money", fn: (d) => ratePrice(d, 20) * (1 + num(d.rush_pct) / 100), list: false },
        { key: "net_20", label: "20-mi net (40 mi driven)", format: "money", fn: (d) => ratePrice(d, 20) - 40 * IRS_MILEAGE_RATE },
      ],
    },
    VEHICLES,
    VEHICLE_COSTS,
    expensesCollection({
      placeholder: "e.g. Dispatch app, cargo insurance, hand truck",
      categories: [
        "Phone & data plan",
        "Dispatch / routing software",
        "Cargo / general liability insurance",
        "Hand truck / straps / blankets",
        "Bags / totes / lockboxes",
        "Business license / registration",
        "Marketing / website",
        "Car loan interest",
      ],
      description: "Business costs you can deduct on top of the mileage rate.",
      categoryHelp: DRIVER_EXPENSE_HELP,
    }),
  ],
  kpis: [
    { label: "Revenue YTD", format: "money", value: (c) => c.incomeYtd, hint: "Delivered, invoiced and paid jobs" },
    {
      label: "To collect",
      format: "money",
      value: (c) => sum(c.all("deliveries").filter(is("status", "Delivered", "Invoiced")), courierCharge),
      hint: "Delivered or invoiced, not yet paid",
    },
    { label: "Deliveries this month", format: "number", value: (c) => count(c.month("deliveries"), courierDone) },
    {
      label: "Revenue per mile YTD",
      format: "money",
      value: (c) => {
        const done = c.ytd("deliveries").filter(courierDone);
        return ratio(sum(done, courierCharge), sum(done, "miles"));
      },
      hint: `Compare with the IRS cost of ${RATE}`,
    },
    {
      label: "Mileage deduction YTD",
      format: "money",
      value: (c) => sum(c.ytd("deliveries").filter(courierDrove), mileCost),
      hint: `Business miles x ${RATE}. Gas and repairs are not deducted on top.`,
    },
  ],
  checklist: {
    label: "Courier checklist",
    items: [
      "Get commercial auto coverage (personal policies usually exclude delivering for pay) and consider cargo insurance",
      "Register your business name and get any city or county business license you need",
      "Send clients a W-9; direct clients may send you a 1099-NEC, but report all income either way",
      "Get proof of delivery (signature or photo) on every job and invoice weekly",
      "Track every business mile from your first delivery and write down your odometer on January 1 and December 31",
      "Medical and lab work: clients often require HIPAA and bloodborne-pathogen training",
      "Pay quarterly estimated taxes (April, June, September, January)",
    ],
  },
  integrations: [
    { kind: "link", label: "Roadie", url: "https://www.roadie.com", note: "Same-day and long-distance delivery gigs" },
    { kind: "link", label: "Curri", url: "https://www.curri.com", note: "Construction and industrial supply deliveries" },
    ...MILEAGE_TRACKERS,
  ],
  resources: [
    ...DRIVING_RESOURCES,
    { label: "SBA: licenses and permits", url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits" },
  ],
};

// ---------- Hospitality & Food ----------

const FOOD_RESOURCES = {
  servsafe: { label: "ServSafe (food handler, manager, alcohol)", url: "https://www.servsafe.com" },
  sbaPermits: { label: "SBA: licenses and permits", url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits" },
  estimated: { label: "IRS estimated taxes", url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes" },
  mileage: { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" },
};

const daysLeftComputed = (key: string): GigComputed => ({
  key: "days_left",
  label: "Days until expiry",
  format: "number",
  fn: (d) => daysUntil(d[key]),
});

// Bartending

const barHours = (d: RecordData) => num(d.hours) || hoursBetween(d.start, d.end);
const barDone = is("status", "Completed", "Paid");
const barRevenue = (d: RecordData) => num(d.fee) + num(d.supplies_charge) + num(d.tips);
const barCosts = (d: RecordData) => num(d.supplies_cost) + num(d.helper_pay) + mileCost(d) + num(d.parking);
const barProfit = (d: RecordData) => barRevenue(d) - barCosts(d);
const barBalance = (d: RecordData) => num(d.fee) + num(d.supplies_charge) - num(d.deposit);

const BARTENDING: GigConfig = {
  categories: ["Bartending for Events"],
  tagline: "Event bookings with deposits and balances, bar packages that quote themselves, and certifications that never lapse.",
  usesClients: true,
  clientLabel: "Event hosts",
  jobsBoard: false,
  schedule: { label: "Event calendar" },
  collections: [
    {
      key: "events",
      label: "Events",
      singular: "Event",
      titleField: "name",
      dateField: "start",
      statusField: "status",
      sort: { field: "start", dir: "desc" },
      description:
        "Income counts when the event is completed (or a canceled event's deposit is kept). Supplies you buy for an event are deducted here, so don't log them again in Expenses.",
      fields: [
        { key: "name", label: "Event", type: "text", required: true, placeholder: "e.g. Garcia wedding reception" },
        { key: "client", label: "Host", type: "client", list: true },
        { key: "start", label: "Service starts", type: "datetime", required: true, list: true },
        { key: "end", label: "Service ends", type: "datetime" },
        { key: "hours", label: "Hours worked", type: "number", unit: "h", help: "Including setup and breakdown; leave blank to use start and end" },
        {
          key: "event_type",
          label: "Event type",
          type: "select",
          options: ["Wedding", "Corporate", "Private party", "Holiday party", "Fundraiser / gala", "Agency / staffing booking", "Other"],
        },
        { key: "venue", label: "Venue / address", type: "text" },
        { key: "guests", label: "Guests", type: "number", list: true },
        { key: "bartenders", label: "Bartenders (incl. you)", type: "number", default: 1 },
        { key: "package", label: "Bar package", type: "ref", ref: "packages" },
        {
          key: "alcohol_by",
          label: "Alcohol supplied by",
          type: "select",
          options: ["Host", "Venue", "Me (licensed)"],
          default: "Host",
          help: "Supplying or selling alcohol yourself usually requires a liquor license",
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["Inquiry", "Quoted", "Booked", "Completed", "Paid", "Canceled", "Canceled - deposit kept"],
          default: "Inquiry",
          list: true,
        },
        { key: "fee", label: "Bartending fee", type: "money", list: true, help: "Labor / service charge billed to the host" },
        { key: "supplies_charge", label: "Supplies charged", type: "money", help: "Mixers, ice, garnish, cups or bar rental billed to the host" },
        { key: "tips", label: "Tips", type: "money", help: "Cash, tip jar and digital tips you kept" },
        { key: "deposit", label: "Deposit received", type: "money" },
        { key: "supplies_cost", label: "Supplies cost", type: "money", help: "What you spent on mixers, ice, garnish and cups for this event" },
        { key: "helper_pay", label: "Paid to other bartenders / barbacks", type: "money" },
        { key: "miles", label: "Miles driven", type: "number", unit: "mi" },
        PARKING_FIELD,
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Signature drinks, dress code, on-site contact, last call time" },
      ],
      computed: [
        { key: "total", label: "Total", format: "money", fn: barRevenue },
        {
          key: "balance",
          label: "Balance due",
          format: "money",
          fn: (d) => (is("status", "Quoted", "Booked", "Completed")(d) ? barBalance(d) : null),
        },
        { key: "profit", label: "Profit", format: "money", fn: barProfit, list: false },
        { key: "per_hour", label: "Profit / hr", format: "money", fn: (d) => ratio(barProfit(d), barHours(d)) },
      ],
      income: (d) => (barDone(d) ? barRevenue(d) : is("status", "Canceled - deposit kept")(d) ? num(d.deposit) : 0),
      expense: (d) => (barDone(d) || is("status", "Canceled - deposit kept")(d) ? barCosts(d) : 0),
    },
    {
      key: "packages",
      label: "Bar packages",
      singular: "Package",
      titleField: "name",
      statusField: "status",
      description: "Your packages and rates. The quote column prices a 100-guest event at the minimum hours.",
      fields: [
        { key: "name", label: "Package", type: "text", required: true, placeholder: "e.g. Beer & wine service, Signature cocktail bar" },
        { key: "includes", label: "What's included", type: "textarea" },
        { key: "hourly_rate", label: "Rate per bartender-hour", type: "money", list: true },
        { key: "min_hours", label: "Minimum hours", type: "number", unit: "h", default: 4 },
        {
          key: "guests_per_bartender",
          label: "Guests per bartender",
          type: "number",
          default: 75,
          help: "A common rule of thumb is one bartender per 50 to 100 guests; fewer guests each for a full cocktail bar",
        },
        { key: "supplies_pp", label: "Supplies price per guest", type: "money", list: true, help: "Mixers, ice, garnish, cups; 0 for labor-only" },
        { key: "supplies_cost_pp", label: "Supplies cost per guest", type: "money" },
        { key: "status", label: "Status", type: "select", options: ["Active", "Retired"], default: "Active" },
      ],
      computed: [
        {
          key: "quote_100",
          label: "Quote: 100 guests",
          format: "money",
          fn: (d) =>
            num(d.hourly_rate) * num(d.min_hours) * Math.ceil(100 / Math.max(1, num(d.guests_per_bartender) || 75)) + num(d.supplies_pp) * 100,
        },
        { key: "supplies_margin", label: "Supplies margin", format: "percent", fn: (d) => ratio(num(d.supplies_pp) - num(d.supplies_cost_pp), num(d.supplies_pp)) },
      ],
    },
    {
      key: "certs",
      label: "Certifications & insurance",
      singular: "Certification",
      titleField: "name",
      dateField: "issued",
      sort: { field: "expires", dir: "asc" },
      fields: [
        { key: "name", label: "Name", type: "text", required: true, placeholder: "e.g. TIPS On-Premise, ServSafe Alcohol, liquor liability policy" },
        {
          key: "kind",
          label: "Type",
          type: "select",
          options: [
            "Alcohol server training",
            "State server permit / card",
            "Food handler card",
            "Liquor liability insurance",
            "General liability insurance",
            "Business license",
            "Other",
          ],
          list: true,
          help: "Some states require their own server permit (e.g. TABC in Texas, RBS in California, BASSET in Illinois)",
        },
        { key: "issuer", label: "Issued by", type: "text" },
        { key: "number", label: "Certificate / policy #", type: "text" },
        { key: "issued", label: "Issued", type: "date" },
        { key: "expires", label: "Expires", type: "date", list: true },
        { key: "cost", label: "Cost", type: "money" },
        { key: "file_url", label: "Copy (link)", type: "url", help: "Venues often ask for a copy or a certificate of insurance" },
      ],
      computed: [daysLeftComputed("expires")],
      expense: (d) => num(d.cost),
    },
    expensesCollection({
      placeholder: "e.g. Shaker set, portable bar, black-tie attire",
      categories: ["Bar tools / equipment", "Portable bar / rentals", "Coolers / ice chests", "Attire", "Phone & data plan", "Marketing / website"],
      description: "Gear and business costs. Event supplies are deducted on each event instead.",
    }),
  ],
  kpis: [
    { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd, hint: "Fees, supplies charged and tips from completed events" },
    {
      label: "Profit / hr YTD",
      format: "money",
      value: (c) => {
        const done = c.ytd("events").filter(barDone);
        return ratio(sum(done, barProfit), sum(done, barHours));
      },
      hint: "After supplies, helpers and mileage, tips included",
    },
    { label: "Booked events", format: "number", value: (c) => count(c.all("events"), is("status", "Booked")) },
    {
      label: "Balances outstanding",
      format: "money",
      value: (c) => sum(c.all("events").filter(is("status", "Booked", "Completed")), barBalance),
      hint: "Booked and completed events not marked Paid",
    },
    {
      label: "Certs expiring (60 days)",
      format: "number",
      value: (c) => count(c.all("certs"), expiresWithin("expires", 60)),
      hint: "Includes anything already expired",
    },
  ],
  checklist: {
    label: "Bartender checklist",
    items: [
      "Get alcohol server training (TIPS or ServSafe Alcohol) and any server permit your state requires",
      "Serve host-provided alcohol unless you're licensed; supplying or selling alcohol yourself usually needs a liquor license",
      "Carry liquor liability insurance; many venues ask for a certificate of insurance",
      "Use a contract with deposit, hours, guest count, cancellation terms, and your right to refuse service to minors and intoxicated guests",
      "Report all tips as income, including cash and digital tips",
      "Pay quarterly estimated taxes (April, June, September, January)",
    ],
  },
  resources: [
    { label: "TIPS alcohol server training", url: "https://www.gettips.com" },
    FOOD_RESOURCES.servsafe,
    FOOD_RESOURCES.sbaPermits,
    FOOD_RESOURCES.estimated,
  ],
};

// Food truck / catering

const truckSales = (d: RecordData) => num(d.cash_sales) + num(d.card_sales);
const truckCommission = (d: RecordData) => truckSales(d) * (num(d.commission_pct) / 100);
const truckIncome = (d: RecordData) => truckSales(d) + num(d.tips) + num(d.topup);
const truckFees = (d: RecordData) => num(d.event_fee) + truckCommission(d) + num(d.card_fees);
const truckEstProfit = (d: RecordData) => truckIncome(d) - truckFees(d) - truckSales(d) * (num(d.food_cost_pct) / 100);
const cateringFood = (d: RecordData) => num(d.guests) * num(d.per_person);
const cateringTotal = (d: RecordData) => cateringFood(d) * (1 + num(d.service_pct) / 100) + num(d.extras);
const cateringDone = is("status", "Completed", "Paid in full");

const FOOD_TRUCK: GigConfig = {
  categories: ["Food Truck / Catering"],
  tagline: "Service days by spot, catering quotes to paid, menu costing, and every permit's expiry in one place.",
  usesClients: true,
  clientLabel: "Catering clients",
  jobsBoard: false,
  schedule: { label: "Service calendar" },
  collections: [
    {
      key: "services",
      label: "Service days",
      singular: "Service day",
      titleField: "location",
      dateField: "date",
      statusField: "status",
      sort: { field: "date", dir: "desc" },
      description:
        "One row per stop or event. Estimated profit uses your food cost %; your actual food purchases are deducted in Purchases. Per-person catering jobs go in Catering.",
      fields: [
        { key: "location", label: "Spot / event", type: "text", required: true, placeholder: "e.g. Brewery on 5th, Downtown Farmers Market" },
        { key: "date", label: "Date", type: "date", required: true },
        {
          key: "location_type",
          label: "Type",
          type: "select",
          options: ["Street / curbside", "Brewery / winery", "Office / lunch stop", "Festival / fair", "Farmers market", "Private event (truck booking)", "Other"],
          list: true,
        },
        { key: "status", label: "Status", type: "select", options: ["Planned", "Confirmed", "Done", "Canceled / rained out"], default: "Planned" },
        { key: "hours", label: "Service hours", type: "number", unit: "h", help: "Window open; prep not included" },
        { key: "cash_sales", label: "Cash sales", type: "money" },
        { key: "card_sales", label: "Card sales", type: "money", help: "Before processing fees" },
        { key: "tips", label: "Tips kept", type: "money" },
        { key: "topup", label: "Host top-up to minimum", type: "money", help: "If a private-event host paid the difference up to your sales minimum" },
        { key: "orders", label: "Orders / tickets", type: "number" },
        { key: "card_fees", label: "Card processing fees", type: "money", help: "From your POS daily report" },
        { key: "event_fee", label: "Event / booth fee", type: "money" },
        { key: "commission_pct", label: "Commission", type: "percent", help: "Share of sales some festivals and breweries take, e.g. 10" },
        { key: "food_cost_pct", label: "Food cost %", type: "percent", default: 30, help: "Your menu average, for estimated profit only" },
        { key: "weather", label: "Weather", type: "select", options: ["Clear", "Hot", "Cold", "Rain", "Wind"] },
        NOTES_FIELD,
      ],
      computed: [
        { key: "sales", label: "Sales", format: "money", fn: truckSales },
        { key: "commission", label: "Commission", format: "money", fn: truckCommission, list: false },
        { key: "avg_ticket", label: "Avg. ticket", format: "money", fn: (d) => ratio(truckSales(d), num(d.orders)), list: false },
        { key: "est_profit", label: "Est. profit", format: "money", fn: truckEstProfit },
        { key: "per_hour", label: "Est. profit / hr", format: "money", fn: (d) => ratio(truckEstProfit(d), num(d.hours)) },
      ],
      income: (d) => (is("status", "Canceled / rained out")(d) ? 0 : truckIncome(d)),
      expense: truckFees,
    },
    {
      key: "catering",
      label: "Catering",
      singular: "Catering job",
      titleField: "name",
      dateField: "event_date",
      statusField: "status",
      sort: { field: "event_date", dir: "desc" },
      description:
        "Quotes through to paid. Income counts once the job is completed (or a deposit is kept on a cancellation). Totals exclude sales tax you collect. Food is deducted in Purchases; the food estimate here is for quoting.",
      fields: [
        { key: "name", label: "Event", type: "text", required: true, placeholder: "e.g. Lee graduation party" },
        { key: "client", label: "Client", type: "client", list: true },
        { key: "event_date", label: "Event date", type: "datetime", required: true },
        { key: "venue", label: "Venue / address", type: "text" },
        { key: "guests", label: "Guests", type: "number", list: true },
        { key: "per_person", label: "Price per person", type: "money", list: true },
        { key: "service_pct", label: "Service charge", type: "percent", help: "Added on top of food, e.g. 18" },
        { key: "extras", label: "Rentals / staffing / delivery charged", type: "money" },
        { key: "deposit", label: "Deposit received", type: "money" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["Inquiry", "Quote sent", "Booked", "Completed", "Paid in full", "Declined", "Canceled", "Canceled - deposit kept"],
          default: "Inquiry",
          list: true,
        },
        { key: "menu", label: "Menu", type: "textarea" },
        { key: "dietary", label: "Dietary needs / allergies", type: "text" },
        { key: "est_food_cost", label: "Est. food cost", type: "money", help: "For quoting only; actual purchases are deducted in Purchases" },
        { key: "staff_cost", label: "Staff pay for this job", type: "money" },
        NOTES_FIELD,
      ],
      computed: [
        { key: "total", label: "Total", format: "money", fn: cateringTotal },
        {
          key: "balance",
          label: "Balance due",
          format: "money",
          fn: (d) => (is("status", "Quote sent", "Booked", "Completed")(d) ? cateringTotal(d) - num(d.deposit) : null),
        },
        { key: "food_pct", label: "Est. food cost %", format: "percent", fn: (d) => ratio(num(d.est_food_cost), cateringFood(d)), list: false },
        { key: "est_profit", label: "Est. profit", format: "money", fn: (d) => cateringTotal(d) - num(d.est_food_cost) - num(d.staff_cost), list: false },
      ],
      income: (d) => (cateringDone(d) ? cateringTotal(d) : is("status", "Canceled - deposit kept")(d) ? num(d.deposit) : 0),
      expense: (d) => (cateringDone(d) ? num(d.staff_cost) : 0),
    },
    {
      key: "menu",
      label: "Menu",
      singular: "Menu item",
      titleField: "name",
      statusField: "status",
      description: "Plate costing: ingredient and packaging cost per serving against price.",
      fields: [
        { key: "name", label: "Item", type: "text", required: true, placeholder: "e.g. Birria tacos (3)" },
        { key: "category", label: "Category", type: "select", options: ["Entree", "Side", "Drink", "Dessert", "Combo", "Catering tray"], list: true },
        { key: "ingredient_cost", label: "Ingredient cost / serving", type: "money", list: true, help: "Cost each ingredient by the portion used" },
        { key: "packaging_cost", label: "Packaging / serving", type: "money", help: "Clamshell, napkin, fork, sauce cup" },
        { key: "price", label: "Price", type: "money", list: true },
        { key: "target_pct", label: "Target food cost", type: "percent", default: 30 },
        { key: "status", label: "Status", type: "select", options: ["Active", "Seasonal", "Testing", "Retired"], default: "Active" },
      ],
      computed: [
        { key: "plate_cost", label: "Plate cost", format: "money", fn: (d) => num(d.ingredient_cost) + num(d.packaging_cost) },
        { key: "food_cost_pct", label: "Food cost %", format: "percent", fn: (d) => ratio(num(d.ingredient_cost) + num(d.packaging_cost), num(d.price)) },
        { key: "contribution", label: "Contribution", format: "money", fn: (d) => num(d.price) - num(d.ingredient_cost) - num(d.packaging_cost) },
        {
          key: "target_price",
          label: "Price at target",
          format: "money",
          fn: (d) => ratio(num(d.ingredient_cost) + num(d.packaging_cost), num(d.target_pct) / 100),
          list: false,
        },
      ],
    },
    {
      key: "permits",
      label: "Permits & inspections",
      singular: "Permit",
      titleField: "name",
      dateField: "issued",
      sort: { field: "expires", dir: "asc" },
      fields: [
        { key: "name", label: "Permit", type: "text", required: true, placeholder: "e.g. County mobile food unit permit" },
        {
          key: "kind",
          label: "Type",
          type: "select",
          options: [
            "Health permit (mobile food unit)",
            "Health inspection",
            "Commissary agreement",
            "Fire inspection / propane",
            "Business license",
            "Sales tax permit",
            "Food manager certification",
            "Food handler cards (staff)",
            "Event / temporary permit",
            "Vehicle registration",
            "Insurance policy",
            "Other",
          ],
          list: true,
        },
        { key: "agency", label: "Issued by", type: "text", placeholder: "e.g. County health department" },
        { key: "number", label: "Permit #", type: "text" },
        { key: "issued", label: "Issued / inspected", type: "date" },
        { key: "expires", label: "Expires", type: "date", list: true },
        { key: "result", label: "Last result", type: "select", options: ["Passed", "Passed with corrections", "Failed / re-inspect", "N/A"] },
        { key: "cost", label: "Fee", type: "money", help: "Log each cost once: here, or in Purchases (e.g. insurance premiums)" },
        { key: "file_url", label: "Copy (link)", type: "url" },
      ],
      computed: [daysLeftComputed("expires")],
      expense: (d) => num(d.cost),
    },
    {
      key: "purchases",
      label: "Purchases",
      singular: "Purchase",
      titleField: "item",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      description: "Everything you buy to run the truck. Food and packaging here drive your actual food cost %.",
      fields: [
        { key: "item", label: "Purchase", type: "text", required: true, placeholder: "e.g. Restaurant Depot run, propane refill" },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "vendor", label: "Vendor", type: "text" },
        {
          key: "category",
          label: "Category",
          type: "select",
          options: [
            "Food / ingredients",
            "Packaging / disposables",
            "Propane / generator fuel",
            "Truck fuel",
            "Commissary / kitchen rent",
            "Truck repairs / maintenance",
            "Equipment / smallwares",
            "POS / software",
            "Insurance",
            "Marketing",
            "Other",
          ],
          list: true,
        },
        { key: "amount", label: "Amount", type: "money", required: true, list: true },
        RECEIPT_FIELD,
      ],
      expense: (d) => num(d.amount),
    },
  ],
  kpis: [
    { label: "Revenue YTD", format: "money", value: (c) => c.incomeYtd, hint: "Truck sales, tips and catering" },
    {
      label: "Actual food cost % YTD",
      format: "percent",
      value: (c) =>
        ratio(
          sum(c.ytd("purchases").filter(is("category", "Food / ingredients", "Packaging / disposables")), "amount"),
          sum(c.ytd("services"), truckSales) + sum(c.ytd("catering").filter(cateringDone), cateringFood),
        ),
      hint: "Food and packaging purchases / food sales",
    },
    {
      label: "Best spot",
      format: "text",
      value: (c) => bestBy(c.ytd("services").filter((d) => !is("status", "Canceled / rained out")(d)), (d) => String(d.location ?? ""), truckEstProfit, (d) => num(d.hours)),
      hint: "Highest estimated profit per service hour this year",
    },
    {
      label: "Catering balances due",
      format: "money",
      value: (c) => sum(c.all("catering").filter(is("status", "Booked", "Completed")), (d) => cateringTotal(d) - num(d.deposit)),
    },
    {
      label: "Permits expiring (60 days)",
      format: "number",
      value: (c) => count(c.all("permits"), expiresWithin("expires", 60)),
      hint: "Includes anything already expired",
    },
  ],
  checklist: {
    label: "Truck checklist",
    items: [
      "Get your mobile food unit health permit from the county health department and pass the plan review / inspection",
      "Sign a commissary agreement if your county requires one, and keep a copy on the truck",
      "Get a fire inspection for propane and cooking equipment (festivals often ask for it)",
      "Get a food protection manager certification (e.g. ServSafe Manager) and food handler cards for your crew",
      "Register for a sales tax permit; prepared food is usually taxable",
      "Carry commercial auto and general liability insurance; events usually want a certificate",
      "Cost every menu item and keep food cost near your target",
    ],
  },
  integrations: [
    { kind: "link", label: "Square Dashboard", url: "https://squareup.com/dashboard", note: "Daily sales and fee reports for your service days" },
    { kind: "link", label: "Roaming Hunger", url: "https://roaminghunger.com", note: "Catering and private event leads for food trucks" },
  ],
  resources: [FOOD_RESOURCES.servsafe, FOOD_RESOURCES.sbaPermits, FOOD_RESOURCES.estimated],
};

// Home bakery

const bakeTotal = (d: RecordData) => num(d.price) + num(d.delivery_fee);
const bakeOpen = is("status", "Requested", "Confirmed", "Baking", "Ready");
const unitCost = (d: RecordData) => (num(d.yield) ? num(d.batch_cost) / num(d.yield) : 0) + num(d.packaging);
const unitLabor = (d: RecordData) => (num(d.yield) ? ((num(d.batch_minutes) / 60) * num(d.hourly)) / num(d.yield) : 0);

const HOME_BAKERY: GigConfig = {
  categories: ["Home Bakery"],
  tagline: "Custom orders from request to pickup, recipe costing per unit, ingredient purchases, and market days.",
  usesClients: true,
  clientLabel: "Customers",
  jobsBoard: false,
  schedule: { label: "Pickup calendar" },
  collections: [
    {
      key: "orders",
      label: "Orders",
      singular: "Order",
      titleField: "items",
      dateField: "pickup",
      statusField: "status",
      sort: { field: "pickup", dir: "desc" },
      description:
        "Income counts at pickup (or when a canceled order's deposit is kept). Ingredients are deducted in Purchases; the estimate here is for profit per order.",
      fields: [
        { key: "items", label: "Order", type: "text", required: true, placeholder: "e.g. 2 dozen sugar cookies, unicorn theme" },
        { key: "client", label: "Customer", type: "client", list: true },
        { key: "pickup", label: "Pickup / delivery", type: "datetime", required: true, list: true },
        { key: "product", label: "Main product", type: "ref", ref: "products" },
        { key: "qty", label: "Quantity", type: "number" },
        { key: "occasion", label: "Occasion", type: "select", options: ["Birthday", "Wedding", "Shower", "Holiday", "Corporate", "Just because", "Other"] },
        { key: "fulfillment", label: "Fulfillment", type: "select", options: ["Pickup", "Delivery", "Market pickup"], default: "Pickup" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: ["Requested", "Confirmed", "Baking", "Ready", "Picked up", "Canceled", "Canceled - deposit kept"],
          default: "Requested",
          list: true,
        },
        { key: "price", label: "Price", type: "money", list: true },
        { key: "delivery_fee", label: "Delivery fee", type: "money" },
        { key: "deposit", label: "Deposit received", type: "money" },
        { key: "paid_via", label: "Paid via", type: "select", options: ["Cash", "Venmo", "Zelle", "Cash App", "Square", "PayPal", "Other"] },
        { key: "est_cost", label: "Est. ingredient cost", type: "money", help: "For profit per order only" },
        { key: "allergies", label: "Allergies / dietary", type: "text", help: "Ask on every order and note it here" },
        { key: "design", label: "Design / flavor notes", type: "textarea" },
        { key: "inspo", label: "Inspiration photo", type: "url" },
      ],
      computed: [
        { key: "total", label: "Total", format: "money", fn: bakeTotal },
        { key: "balance", label: "Balance due", format: "money", fn: (d) => (bakeOpen(d) ? bakeTotal(d) - num(d.deposit) : null) },
        { key: "est_profit", label: "Est. profit", format: "money", fn: (d) => bakeTotal(d) - num(d.est_cost), list: false },
      ],
      income: (d) => (is("status", "Picked up")(d) ? bakeTotal(d) : is("status", "Canceled - deposit kept")(d) ? num(d.deposit) : 0),
    },
    {
      key: "products",
      label: "Recipes & pricing",
      singular: "Product",
      titleField: "name",
      statusField: "status",
      description: "Cost per unit from batch cost and yield, and what's left after your time.",
      fields: [
        { key: "name", label: "Product", type: "text", required: true, placeholder: "e.g. Brown butter chocolate chip cookie" },
        { key: "category", label: "Category", type: "select", options: ["Cookies", "Cakes", "Cupcakes", "Bread", "Pies", "Pastries", "Decorated / custom", "Other"] },
        { key: "batch_cost", label: "Ingredient cost per batch", type: "money", list: true },
        { key: "yield", label: "Yield per batch", type: "number", unit: "pcs", default: 12, list: true },
        { key: "packaging", label: "Packaging per unit", type: "money", help: "Box, bag, label, sticker" },
        { key: "batch_minutes", label: "Hands-on time per batch", type: "number", unit: "min" },
        { key: "hourly", label: "Your hourly rate", type: "money", default: 20 },
        { key: "price", label: "Price per unit", type: "money", list: true },
        {
          key: "allergens",
          label: "Contains",
          type: "text",
          placeholder: "e.g. wheat, milk, eggs, soy",
          help: "For your label. The US major allergens are milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans and sesame.",
        },
        { key: "shelf_days", label: "Shelf life", type: "number", unit: "days" },
        { key: "status", label: "Status", type: "select", options: ["Active", "Seasonal", "Testing", "Retired"], default: "Active" },
      ],
      computed: [
        { key: "unit_cost", label: "Cost / unit", format: "money", fn: (d) => (num(d.yield) ? unitCost(d) : null) },
        { key: "margin", label: "Margin", format: "percent", fn: (d) => (num(d.yield) ? ratio(num(d.price) - unitCost(d), num(d.price)) : null) },
        { key: "labor", label: "Labor / unit", format: "money", fn: (d) => (num(d.yield) ? unitLabor(d) : null), list: false },
        {
          key: "profit_after_time",
          label: "Profit after your time",
          format: "money",
          fn: (d) => (num(d.yield) ? num(d.price) - unitCost(d) - unitLabor(d) : null),
        },
      ],
    },
    {
      key: "purchases",
      label: "Purchases",
      singular: "Purchase",
      titleField: "item",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      description: "Ingredients, packaging and supplies. Bought with household groceries? Enter the business share.",
      fields: [
        { key: "item", label: "Purchase", type: "text", required: true, placeholder: "e.g. Flour, butter, cake boxes" },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "vendor", label: "Vendor", type: "text", placeholder: "e.g. Costco, WebstaurantStore" },
        {
          key: "category",
          label: "Category",
          type: "select",
          options: [
            "Ingredients",
            "Decorations / sprinkles",
            "Packaging / boxes / labels",
            "Pans / tools / equipment",
            "Permit / license / course",
            "Payment processing fees",
            "Marketing / website",
            "Other",
          ],
          list: true,
        },
        { key: "amount", label: "Amount", type: "money", required: true, list: true },
        { key: "business_pct", label: "Business share", type: "percent", default: 100, help: "Part of a household grocery run? e.g. 40" },
        RECEIPT_FIELD,
      ],
      computed: [{ key: "deductible", label: "Deductible", format: "money", fn: (d) => num(d.amount) * share(d.business_pct) }],
      expense: (d) => num(d.amount) * share(d.business_pct),
    },
    {
      key: "markets",
      label: "Markets & pop-ups",
      singular: "Market day",
      titleField: "name",
      dateField: "date",
      sort: { field: "date", dir: "desc" },
      fields: [
        { key: "name", label: "Market", type: "text", required: true, placeholder: "e.g. Saturday Farmers Market" },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "booth_fee", label: "Booth fee", type: "money" },
        { key: "cash_sales", label: "Cash sales", type: "money" },
        { key: "card_sales", label: "Card sales", type: "money" },
        { key: "card_fees", label: "Card fees", type: "money" },
        { key: "units_brought", label: "Units brought", type: "number" },
        { key: "units_sold", label: "Units sold", type: "number" },
        NOTES_FIELD,
      ],
      computed: [
        { key: "sales", label: "Sales", format: "money", fn: (d) => num(d.cash_sales) + num(d.card_sales) },
        { key: "sell_through", label: "Sell-through", format: "percent", fn: (d) => ratio(num(d.units_sold), num(d.units_brought)) },
        { key: "profit", label: "After fees", format: "money", fn: (d) => num(d.cash_sales) + num(d.card_sales) - num(d.booth_fee) - num(d.card_fees) },
      ],
      income: (d) => num(d.cash_sales) + num(d.card_sales),
      expense: (d) => num(d.booth_fee) + num(d.card_fees),
    },
  ],
  kpis: [
    { label: "Sales YTD", format: "money", value: (c) => c.incomeYtd },
    { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After ingredients, packaging and fees" },
    { label: "Due in 7 days", format: "number", value: (c) => count(c.all("orders"), (d) => is("status", "Confirmed", "Baking", "Ready")(d) && dueWithin("pickup", 7)(d)) },
    {
      label: "Balances to collect",
      format: "money",
      value: (c) => sum(c.all("orders").filter(is("status", "Confirmed", "Baking", "Ready")), (d) => bakeTotal(d) - num(d.deposit)),
      hint: "Confirmed orders not yet picked up, minus deposits",
    },
    {
      label: "Avg. order YTD",
      format: "money",
      value: (c) => {
        const picked = c.ytd("orders").filter(is("status", "Picked up"));
        return ratio(sum(picked, bakeTotal), count(picked));
      },
    },
  ],
  checklist: {
    label: "Cottage bakery checklist",
    items: [
      "Read your state's cottage food law: cottage food laws vary by state on what you can sell, where (in person, online, shipping), and annual sales caps",
      "Register or get a permit if your state requires one, and check local zoning or HOA rules for home businesses",
      "Label every product the way your state requires (often product name, your name and address, ingredients, allergens, and a home-kitchen statement)",
      "Take a food handler course (e.g. ServSafe Food Handler); some states require it",
      "Take a deposit on custom orders and confirm allergies in writing",
      "Check whether your state charges sales tax on baked goods",
      "Log ingredient purchases as you go; split household grocery runs with the business share",
    ],
  },
  integrations: [{ kind: "link", label: "Square Dashboard", url: "https://squareup.com/dashboard", note: "Card sales for orders and markets" }],
  resources: [
    { label: "Forrager: cottage food laws by state", url: "https://forrager.com" },
    FOOD_RESOURCES.servsafe,
    FOOD_RESOURCES.sbaPermits,
    FOOD_RESOURCES.estimated,
  ],
};

// Personal chef

const chefDone = is("status", "Completed", "Paid");
const chefIncome = (d: RecordData) => num(d.service_fee) + num(d.tips) + num(d.grocery_reimbursed);
const chefCosts = (d: RecordData) => num(d.groceries_cost) + mileCost(d) + num(d.parking);
const chefProfit = (d: RecordData) => chefIncome(d) - chefCosts(d);

const PERSONAL_CHEF: GigConfig = {
  categories: ["Personal Chef"],
  tagline: "Household dietary profiles, cook dates with grocery reimbursements, menus, and your real hourly rate.",
  usesClients: true,
  clientLabel: "Households",
  jobsBoard: false,
  schedule: { label: "Cook dates" },
  collections: [
    {
      key: "sessions",
      label: "Cook dates",
      singular: "Cook date",
      titleField: "title",
      dateField: "start",
      statusField: "status",
      sort: { field: "start", dir: "desc" },
      description:
        "Groceries count both ways: what you spent is an expense and what the client paid you back is income. If the client pays the store directly, leave both blank.",
      fields: [
        { key: "title", label: "Cook date", type: "text", required: true, placeholder: "e.g. Weekly meal prep, Anniversary dinner for 2" },
        { key: "client", label: "Household", type: "client", list: true },
        { key: "start", label: "Date & time", type: "datetime", required: true, list: true },
        { key: "profile", label: "Dietary profile", type: "ref", ref: "profiles" },
        { key: "menu", label: "Menu", type: "ref", ref: "menus" },
        {
          key: "service_type",
          label: "Service",
          type: "select",
          options: ["Weekly meal prep", "Dinner party", "Intimate dinner", "Cooking lesson", "Holiday / event", "Other"],
        },
        { key: "servings", label: "Servings / guests", type: "number" },
        { key: "hours", label: "Hours", type: "number", unit: "h", help: "Shopping, cooking, cleanup and travel, for your real hourly rate" },
        { key: "status", label: "Status", type: "select", options: ["Requested", "Menu sent", "Confirmed", "Completed", "Paid", "Canceled"], default: "Requested", list: true },
        { key: "service_fee", label: "Service fee", type: "money", list: true },
        { key: "tips", label: "Tips", type: "money" },
        { key: "groceries_cost", label: "Groceries you paid", type: "money" },
        { key: "grocery_reimbursed", label: "Groceries billed to client", type: "money" },
        { key: "miles", label: "Miles (incl. grocery runs)", type: "number", unit: "mi" },
        PARKING_FIELD,
        NOTES_FIELD,
      ],
      computed: [
        { key: "profit", label: "Profit", format: "money", fn: chefProfit },
        { key: "per_hour", label: "$ / hr", format: "money", fn: (d) => ratio(chefProfit(d), num(d.hours)) },
        { key: "grocery_gap", label: "Grocery markup", format: "money", fn: (d) => num(d.grocery_reimbursed) - num(d.groceries_cost), list: false },
        { key: "per_serving", label: "Fee / serving", format: "money", fn: (d) => ratio(num(d.service_fee), num(d.servings)), list: false },
      ],
      income: (d) => (chefDone(d) ? chefIncome(d) : 0),
      expense: (d) => (chefDone(d) ? chefCosts(d) : 0),
    },
    {
      key: "profiles",
      label: "Dietary profiles",
      singular: "Dietary profile",
      titleField: "household",
      description: "One per household. Re-confirm allergies before every cook date.",
      fields: [
        { key: "household", label: "Household", type: "text", required: true, placeholder: "e.g. The Nguyen family" },
        { key: "client", label: "Client", type: "client" },
        { key: "people", label: "People", type: "number" },
        {
          key: "diet",
          label: "Diet",
          type: "select",
          options: ["No restrictions", "Vegetarian", "Vegan", "Pescatarian", "Gluten-free", "Dairy-free", "Low-carb / keto", "Paleo", "Low-sodium", "Kosher-style", "Halal", "Other"],
          list: true,
        },
        { key: "allergies", label: "Allergies", type: "text", list: true, help: "Each allergen and how severe" },
        { key: "avoid", label: "Dislikes / avoid", type: "text" },
        { key: "loves", label: "Favorites", type: "text" },
        { key: "goals", label: "Nutrition goals", type: "text", placeholder: "e.g. high protein, 500 to 600 cal per meal" },
        {
          key: "kitchen_notes",
          label: "Kitchen notes",
          type: "textarea",
          placeholder: "Gas or electric, pans on hand, oven quirks, fridge space, parking and entry",
        },
        { key: "containers", label: "Containers", type: "select", options: ["Client's containers", "I bring disposable", "I bring reusable (returned)"] },
        { key: "cook_day", label: "Usual cook day", type: "select", options: [...WEEKDAYS, "Varies"] },
        { key: "confirmed", label: "Last confirmed", type: "date", help: "When you last re-checked allergies and preferences" },
      ],
    },
    {
      key: "menus",
      label: "Menus",
      singular: "Menu",
      titleField: "name",
      statusField: "status",
      fields: [
        { key: "name", label: "Menu", type: "text", required: true, placeholder: "e.g. Fall meal prep week 1, Tuscan dinner party" },
        { key: "style", label: "Style", type: "select", options: ["Meal prep", "Plated dinner", "Family style", "Tasting menu", "Cooking lesson", "Other"], list: true },
        { key: "dishes", label: "Dishes", type: "textarea", placeholder: "One per line" },
        { key: "tags", label: "Dietary tags", type: "text", placeholder: "e.g. GF, DF, nut-free" },
        { key: "servings", label: "Servings", type: "number", default: 4 },
        { key: "grocery_est", label: "Est. groceries", type: "money", list: true },
        { key: "price", label: "Service price", type: "money", list: true },
        { key: "prep_hours", label: "Hours to shop, cook and clean", type: "number", unit: "h" },
        { key: "status", label: "Status", type: "select", options: ["Draft", "Sent", "Approved", "Favorite", "Retired"], default: "Draft" },
      ],
      computed: [
        { key: "grocery_per_serving", label: "Groceries / serving", format: "money", fn: (d) => ratio(num(d.grocery_est), num(d.servings)) },
        { key: "per_hour", label: "$ / hr", format: "money", fn: (d) => ratio(num(d.price), num(d.prep_hours)) },
      ],
    },
    expensesCollection({
      placeholder: "e.g. Knife sharpening, containers, liability insurance",
      categories: [
        "Knives / cookware / equipment",
        "Containers / packaging",
        "Liability insurance",
        "Certification / training",
        "Uniform / aprons",
        "Phone & data plan",
        "Marketing / website",
      ],
      description: "Business costs other than client groceries (those are on each cook date).",
    }),
  ],
  kpis: [
    { label: "Revenue YTD", format: "money", value: (c) => c.incomeYtd, hint: "Service fees, tips and grocery reimbursements" },
    {
      label: "$/hr YTD",
      format: "money",
      value: (c) => {
        const done = c.ytd("sessions").filter(chefDone);
        return ratio(sum(done, chefProfit), sum(done, "hours"));
      },
      hint: "After groceries and mileage, counting shopping and travel time",
    },
    { label: "Cook dates this month", format: "number", value: (c) => count(c.month("sessions"), (d) => !is("status", "Canceled")(d)) },
    { label: "Upcoming", format: "number", value: (c) => count(c.all("sessions"), is("status", "Menu sent", "Confirmed")) },
    {
      label: "To collect",
      format: "money",
      value: (c) => sum(c.all("sessions").filter(is("status", "Completed")), (d) => num(d.service_fee) + num(d.grocery_reimbursed)),
      hint: "Completed cook dates not marked Paid",
    },
  ],
  checklist: {
    label: "Chef checklist",
    items: [
      "Get a food safety certification (ServSafe Food Handler or Manager)",
      "Carry general liability insurance for cooking in clients' homes",
      "Check whether your city or county requires a business license for in-home chef services",
      "Confirm allergies in writing before every cook date and keep each household's profile current",
      "Decide how groceries work (client card, reimbursement, or built into your price) and put it in a service agreement with your cancellation policy",
      "Pay quarterly estimated taxes (April, June, September, January)",
    ],
  },
  resources: [FOOD_RESOURCES.servsafe, FOOD_RESOURCES.sbaPermits, FOOD_RESOURCES.estimated, FOOD_RESOURCES.mileage],
};

export const FOOD_RIDESHARE_CONFIGS: GigConfig[] = [
  BARTENDING,
  FOOD_TRUCK,
  HOME_BAKERY,
  PERSONAL_CHEF,
  AMAZON_FLEX,
  COURIER,
  FOOD_DELIVERY,
  INSTACART,
  RIDESHARE,
];
