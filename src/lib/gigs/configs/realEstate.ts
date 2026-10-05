import {
  count,
  daysBetween,
  hoursBetween,
  is,
  num,
  ratio,
  sum,
  type GigConfig,
  type GigField,
  type RecordData,
} from "../schema";

// Rentals of things you own: a foil board fleet, a Philippine condo or
// house, a garage or parking spot. Each workspace answers "is this asset
// paying for itself?".
//
// Money convention: income()/expense() always return USD. Foil sessions
// abroad and everything on the Philippine property are entered in the
// currency actually paid, with the exchange rate on the record, and are
// converted here. A peso amount without a rate converts to nothing (the
// USD column shows a dash) rather than being counted as dollars.

const yes = (v: unknown) => v === true || v === "true";
const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------- Foil Board Rental ----------

const FOIL_CURRENCY_FIELDS: GigField[] = [
  {
    key: "currency",
    label: "Currency",
    type: "select",
    options: ["USD", "MXN", "PHP"],
    default: "USD",
    help: "The currency the money actually moved in",
  },
  {
    key: "fx_rate",
    label: "Exchange rate (per 1 USD)",
    type: "number",
    placeholder: "e.g. 18.50",
    help: "How many pesos equal 1 USD on that date. Not needed for USD. Without it the USD column stays blank and nothing is sent to Taxes.",
  },
];

// Amount in the record's currency -> USD (null when a peso amount has no rate).
function foilUsd(d: RecordData, amount: number): number | null {
  const cur = String(d.currency ?? "");
  if (!cur || cur === "USD") return amount;
  const rate = num(d.fx_rate);
  return rate > 0 ? amount / rate : null;
}
const foilUsd0 = (d: RecordData, amount: number) => foilUsd(d, amount) ?? 0;

const rideHours = (d: RecordData) => hoursBetween(d.start, d.end);
// Hourly rental plus any flat lesson / tour price, in the session's currency.
const sessionPrice = (d: RecordData) => num(d.rate_per_hour) * rideHours(d) + num(d.lesson_fee);
const sessionFee = (d: RecordData) => (sessionPrice(d) * num(d.platform_fee_pct)) / 100;
// Paid sessions: completed, or a no-show you kept payment for.
const sessionPaid = is("status", "Completed", "No-show");
const depositKept = (d: RecordData) =>
  is("deposit_status", "Kept")(d)
    ? num(d.deposit_kept) || num(d.deposit)
    : is("deposit_status", "Partly kept")(d)
      ? num(d.deposit_kept)
      : 0;
const sessionIncome = (d: RecordData) => (sessionPaid(d) ? sessionPrice(d) + num(d.tips) : 0) + depositKept(d);

// ---------- Philippines Property ----------

const MODE_AIRBNB = "Airbnb / short-term";
const MODE_LONG_TERM = "Long-term rent";
const MODE_VACATION = "Private vacation home";

const phpUsd = (php: number, rate: unknown): number | null => (num(rate) > 0 ? php / num(rate) : null);

type DealNumbers = { priceUsd: number; cashIn: number; gross: number; costs: number; net: number };

// One year of the modeled property, in USD at the deal's exchange rate.
function dealNumbers(d: RecordData): DealNumbers | null {
  const fx = num(d.php_per_usd);
  if (fx <= 0) return null;
  const price = num(d.purchase_price_php);
  const cashInPhp = price * (1 + num(d.closing_pct) / 100) + num(d.furnishing_php);
  const mode = String(d.mode ?? "");
  let grossPhp = 0;
  if (mode === MODE_AIRBNB) {
    const rentableNights = Math.max(0, 365 - num(d.personal_nights));
    grossPhp = rentableNights * (num(d.occupancy_pct) / 100) * num(d.nightly_php);
  } else if (mode === MODE_LONG_TERM) {
    // Blank occupancy on a long-term lease means rented all 12 months.
    const occ = num(d.occupancy_pct) > 0 ? num(d.occupancy_pct) / 100 : 1;
    grossPhp = num(d.rent_monthly_php) * 12 * occ;
  }
  const fixedPhp =
    12 * (num(d.dues_monthly_php) + num(d.utilities_monthly_php) + num(d.other_monthly_php)) + num(d.rpt_yearly_php);
  const variablePhp = (grossPhp * (num(d.mgmt_pct) + num(d.platform_pct) + num(d.ph_tax_pct))) / 100;
  const costsPhp = fixedPhp + variablePhp;
  return {
    priceUsd: price / fx,
    cashIn: cashInPhp / fx,
    gross: grossPhp / fx,
    costs: costsPhp / fx,
    net: (grossPhp - costsPhp) / fx,
  };
}

const dealCapRate = (d: RecordData): number | null => {
  const m = dealNumbers(d);
  if (!m || is("mode", MODE_VACATION)(d)) return null;
  return ratio(m.net, m.priceUsd);
};

const stayNights = (d: RecordData) => daysBetween(d.check_in, d.check_out);
const stayGrossPhp = (d: RecordData) =>
  num(d.total_php) > 0 ? num(d.total_php) : num(d.nightly_php) * stayNights(d) + num(d.cleaning_fee_php);
const stayFeePhp = (d: RecordData) => (stayGrossPhp(d) * num(d.platform_fee_pct)) / 100;
// Income counts once the guest has checked in (imported rows have no status and count too).
const stayCounts = (d: RecordData) => !is("status", "Booked", "Canceled")(d);

// Rental-use share of a cost; blank means 100% rental.
const rentalShare = (d: RecordData) =>
  d.rental_share_pct === undefined || d.rental_share_pct === null || d.rental_share_pct === ""
    ? 100
    : num(d.rental_share_pct);

const visitNights = (d: RecordData) => (yes(d.work_trip) ? 0 : daysBetween(d.arrive, d.depart));

// ---------- Storage / Parking ----------

const leaseActive = is("status", "Active", "Notice given");
const paymentIncome = (d: RecordData) => num(d.amount) + num(d.late_fee);

export const REAL_ESTATE_CONFIGS: GigConfig[] = [
  {
    categories: ["Foil Board Rental"],
    tagline: "eFoil and hydrofoil fleet, lessons and rentals, battery cycles and waivers, in the USA, Mexico or the Philippines.",
    usesClients: true,
    clientLabel: "Riders",
    jobsBoard: false,
    schedule: { label: "Lessons & rentals" },
    collections: [
      {
        key: "rentals",
        label: "Sessions",
        singular: "Session",
        description: "Every rental, lesson and tour. Enter prices in the currency you charged; revenue is converted to USD with the session's exchange rate.",
        titleField: "rider_name",
        dateField: "start",
        statusField: "status",
        sort: { field: "start", dir: "desc" },
        fields: [
          { key: "rider_name", label: "Rider / group", type: "text", required: true, placeholder: "e.g. Sarah M. + 1" },
          { key: "start", label: "Start", type: "datetime", required: true },
          { key: "end", label: "End", type: "datetime", required: true },
          { key: "session_type", label: "Session type", type: "select", options: ["Lesson", "Rental", "Guided tour", "Demo ride"], default: "Lesson" },
          { key: "board", label: "Board", type: "ref", ref: "fleet" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Booked", "Completed", "No-show", "Canceled", "Weather canceled"],
            default: "Booked",
            help: "Revenue counts once Completed. Use No-show only if you kept the payment; refunded no-shows are Canceled.",
          },
          { key: "waiver_signed", label: "Waiver signed", type: "bool", default: false, list: true },
          { key: "rider", label: "Rider profile", type: "client", help: "Optional: link a saved rider to keep their history and waiver in one place" },
          { key: "spot", label: "Launch spot", type: "text", placeholder: "e.g. Bulabog Beach, Boracay" },
          {
            key: "platform",
            label: "Booked via",
            type: "select",
            options: ["Direct", "GetYourGuide", "Viator", "Airbnb Experiences", "Hotel / resort desk", "Other"],
            default: "Direct",
          },
          { key: "rate_per_hour", label: "Rate per hour", type: "number", help: "In the session's currency" },
          {
            key: "lesson_fee",
            label: "Lesson / tour fee (flat)",
            type: "number",
            help: "Flat-priced package? Put the whole price here and leave the hourly rate at 0.",
          },
          { key: "tips", label: "Tips", type: "number" },
          {
            key: "platform_fee_pct",
            label: "Platform commission",
            type: "percent",
            default: 0,
            help: "GetYourGuide and Viator commissions are often 20-30% and Airbnb Experiences charges hosts about 20%; use the rate in your agreement. Direct: your card processor's fee (~3%), or 0 for cash.",
          },
          ...FOIL_CURRENCY_FIELDS,
          { key: "deposit", label: "Deposit held", type: "number", help: "Cash or card hold. Not income unless you keep it." },
          { key: "deposit_status", label: "Deposit", type: "select", options: ["No deposit", "Held", "Returned", "Partly kept", "Kept"], default: "No deposit" },
          {
            key: "deposit_kept",
            label: "Deposit kept",
            type: "number",
            help: "Amount kept for damage or loss; counts as income. Kept with this blank uses the full deposit.",
          },
          { key: "notes", label: "Notes", type: "textarea", placeholder: "Conditions, rider level, incidents" },
        ],
        computed: [
          { key: "hours", label: "Hours", format: "hours", fn: (d) => rideHours(d) || null },
          { key: "revenue_usd", label: "Revenue (USD)", format: "money", fn: (d) => foilUsd(d, sessionPrice(d)) },
          { key: "platform_fee_usd", label: "Platform fee (USD)", format: "money", list: false, fn: (d) => foilUsd(d, sessionFee(d)) },
          {
            key: "net_usd",
            label: "Net (USD)",
            format: "money",
            fn: (d) => foilUsd(d, sessionIncome(d) - (sessionPaid(d) ? sessionFee(d) : 0)),
          },
        ],
        income: (d) => foilUsd0(d, sessionIncome(d)),
        expense: (d) => (sessionPaid(d) ? foilUsd0(d, sessionFee(d)) : 0),
      },
      {
        key: "fleet",
        label: "Fleet",
        singular: "Board",
        description: "Each board or foil kit, where it is, and how worn its batteries are.",
        titleField: "name",
        statusField: "status",
        fields: [
          { key: "name", label: "Board", type: "text", required: true, placeholder: "e.g. Flite #2 (blue)" },
          { key: "board_type", label: "Type", type: "select", options: ["eFoil", "Hydrofoil SUP", "Wing foil kit", "Surf / pump foil", "Other"], default: "eFoil" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Available", "Rented", "Charging", "In repair", "Retired"],
            default: "Available",
          },
          { key: "country", label: "Country", type: "select", options: ["USA", "Mexico", "Philippines"] },
          {
            key: "brand",
            label: "Brand",
            type: "select",
            options: ["Fliteboard", "Lift Foils", "Waydoo", "Awake", "Armstrong", "Slingshot", "Duotone", "F-One", "Other"],
          },
          { key: "model", label: "Model", type: "text", placeholder: "e.g. Series 3, LIFT5, Flyer EVO" },
          { key: "base", label: "Base / beach", type: "text", placeholder: "e.g. Lake Tahoe, La Paz, Boracay" },
          { key: "serial", label: "Serial number", type: "text" },
          { key: "purchase_date", label: "Purchase date", type: "date" },
          {
            key: "purchase_cost",
            label: "Purchase cost (USD)",
            type: "money",
            list: true,
            help: "Board, foil, controller, batteries and charger, plus shipping and import duty. Not deducted automatically: boards are equipment (depreciation or Section 179, ask your CPA). Log the deduction in Expenses if you take it.",
          },
          { key: "battery_packs", label: "Battery packs", type: "number", unit: "packs" },
          {
            key: "battery_cycles",
            label: "Battery cycles",
            type: "number",
            unit: "cycles",
            help: "Charge cycles on the most-used pack, from the board's app or controller",
          },
          { key: "rated_cycles", label: "Rated cycle life", type: "number", unit: "cycles", help: "From your manufacturer's battery spec" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          { key: "battery_wear", label: "Battery wear", format: "percent", fn: (d) => ratio(num(d.battery_cycles), num(d.rated_cycles)) },
          {
            key: "cycles_left",
            label: "Cycles left",
            format: "number",
            list: false,
            fn: (d) => (num(d.rated_cycles) ? Math.max(0, num(d.rated_cycles) - num(d.battery_cycles)) : null),
          },
        ],
      },
      {
        key: "maintenance",
        label: "Maintenance",
        singular: "Service",
        description: "Repairs and service per board. Logging battery cycles at each service shows when packs need replacing.",
        titleField: "issue",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "issue", label: "Issue / work done", type: "text", required: true, placeholder: "e.g. Prop replaced after reef strike" },
          { key: "board", label: "Board", type: "ref", ref: "fleet", required: true },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "kind",
            label: "Type",
            type: "select",
            options: ["Scheduled service", "Battery", "Motor / prop", "Foil / mast", "Board / hull", "Controller / remote", "Water intrusion", "Other"],
          },
          { key: "status", label: "Status", type: "select", options: ["Open", "Waiting on parts", "Done"], default: "Open" },
          { key: "parts_cost", label: "Parts cost", type: "number" },
          { key: "labor_cost", label: "Labor / shop cost", type: "number" },
          ...FOIL_CURRENCY_FIELDS,
          { key: "cycles_at_service", label: "Battery cycles at service", type: "number", unit: "cycles" },
          { key: "downtime_days", label: "Days out of service", type: "number", unit: "days" },
          { key: "warranty", label: "Warranty claim", type: "bool", default: false },
          { key: "vendor", label: "Shop / technician", type: "text" },
        ],
        computed: [
          { key: "cost_usd", label: "Cost (USD)", format: "money", fn: (d) => foilUsd(d, num(d.parts_cost) + num(d.labor_cost)) },
        ],
        expense: (d) => foilUsd0(d, num(d.parts_cost) + num(d.labor_cost)),
      },
      {
        key: "expenses",
        label: "Expenses",
        singular: "Expense",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Expense", type: "text", required: true, placeholder: "e.g. Annual liability policy, jet ski fuel" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: [
              "Liability insurance",
              "Launch / beach permits",
              "Boat / jet ski support",
              "Fuel",
              "Transport / van",
              "Storage / shop rent",
              "Charging / electricity",
              "Safety gear (PFDs, helmets, radios)",
              "Instructor pay",
              "Booking software / marketing",
              "Shipping / import duty",
              "Equipment (board / battery purchase)",
              "Other",
            ],
          },
          { key: "amount", label: "Amount", type: "number", required: true },
          ...FOIL_CURRENCY_FIELDS,
          { key: "receipt_url", label: "Receipt link", type: "url" },
        ],
        computed: [{ key: "amount_usd", label: "Amount (USD)", format: "money", fn: (d) => foilUsd(d, num(d.amount)) }],
        expense: (d) => foilUsd0(d, num(d.amount)),
      },
    ],
    kpis: [
      { label: "Revenue YTD", format: "money", value: (c) => c.incomeYtd, hint: "USD, incl. tips and kept deposits" },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "Before board depreciation" },
      {
        label: "Hours on water YTD",
        format: "hours",
        value: (c) => sum(c.ytd("rentals").filter(is("status", "Completed")), rideHours),
      },
      {
        label: "Fleet cost recovered",
        format: "percent",
        value: (c) =>
          ratio(
            sum(c.all("rentals").filter(sessionPaid), (d) => foilUsd0(d, sessionPrice(d))),
            sum(c.all("fleet"), "purchase_cost"),
          ),
        hint: "All-time rental revenue / board purchase cost",
      },
      {
        label: "Boards available now",
        format: "text",
        value: (c) => {
          const active = c.all("fleet").filter((d) => !is("status", "Retired")(d));
          return active.length ? `${count(active, is("status", "Available"))} of ${active.length}` : null;
        },
      },
      {
        label: "Waivers missing",
        format: "number",
        value: (c) => count(c.all("rentals"), (d) => is("status", "Booked", "Completed")(d) && !yes(d.waiver_signed)),
        hint: "Booked or completed sessions without a signed waiver",
      },
    ],
    checklist: {
      label: "Before you launch",
      items: [
        "Have every rider sign a liability waiver before they touch the water, and tick Waiver signed on the session",
        "Get commercial liability insurance that names watercraft rental and instruction; many general liability policies exclude watercraft",
        "Check permits for commercial watercraft activity where you operate; rules vary by beach, lake, municipality and country (US city, park or harbor permits; the port captain and municipality in Mexico; LGU permits and Coast Guard or tourism office rules in the Philippines)",
        "Give a safety briefing every session, put riders in a PFD or impact vest and a helmet, and keep a support boat or jet ski for lessons",
        "Lithium batteries: charge on a non-flammable surface with someone watching, store packs part-charged, and expect large eFoil packs to ship as Class 9 dangerous goods (they can't fly as airline baggage)",
        "Operating abroad: log each session in the currency charged with that day's exchange rate. US citizens report worldwide income (usually Schedule C), and Mexico or the Philippines may require local registration and tax; ask a cross-border CPA about foreign tax credits",
        "Log battery cycles at every service so you can budget pack replacements",
      ],
    },
    integrations: [
      { kind: "link", label: "GetYourGuide supplier portal", url: "https://supplier.getyourguide.com", note: "List lessons and tours; commission comes out of each booking" },
      { kind: "link", label: "Viator Management Center", url: "https://supplier.viator.com", note: "Tripadvisor's tours and activities marketplace" },
      { kind: "link", label: "Airbnb Experiences", url: "https://www.airbnb.com/host/experiences" },
    ],
    resources: [
      { label: "Fliteboard", url: "https://fliteboard.com" },
      { label: "Lift Foils", url: "https://liftfoils.com" },
      { label: "Waydoo", url: "https://www.waydoo.com" },
      { label: "FAA PackSafe (lithium batteries)", url: "https://www.faa.gov/hazmat/packsafe" },
      { label: "IRS: US citizens and residents abroad", url: "https://www.irs.gov/individuals/international-taxpayers/us-citizens-and-resident-aliens-abroad" },
      { label: "IRS Schedule C", url: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040" },
    ],
  },
  {
    categories: ["Philippines Property (Rent/Home)"],
    tagline: "Model a Philippine condo or house in USD before you buy, then run it as an Airbnb, a long-term rental, or your own vacation home.",
    usesClients: false,
    jobsBoard: false,
    schedule: false,
    collections: [
      {
        key: "deals",
        label: "Deal model",
        singular: "Property",
        description: "Run the numbers before you buy. Enter peso amounts and the exchange rate; results are in USD per year.",
        titleField: "name",
        statusField: "status",
        fields: [
          { key: "name", label: "Property", type: "text", required: true, placeholder: "e.g. 1BR condo, Mactan Newtown" },
          {
            key: "city",
            label: "City / area",
            type: "select",
            options: ["Cebu City", "Mactan / Lapu-Lapu", "Boracay", "Siargao", "Makati", "BGC / Taguig", "Pasig / Ortigas", "Davao", "Palawan", "Dumaguete", "Other"],
          },
          { key: "mode", label: "Use", type: "select", options: [MODE_AIRBNB, MODE_LONG_TERM, MODE_VACATION], default: MODE_AIRBNB },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Researching", "Viewing", "Offer made", "Reserved", "Bought", "Passed"],
            default: "Researching",
          },
          { key: "property_type", label: "Property type", type: "select", options: ["Condo unit", "Condotel / resort unit", "House & lot (via lease)", "Townhouse"], default: "Condo unit" },
          {
            key: "ownership",
            label: "Ownership route",
            type: "select",
            options: [
              "Condo (foreigner-eligible, 40% foreign cap)",
              "Long-term land lease",
              "Filipino spouse/heir ownership",
              "Corporation (60/40)",
            ],
            help: "Foreigners can't own land in the Philippines. A condo unit is allowed while foreign ownership of the condo corporation stays within 40%. Land and houses are usually held through a registered long-term lease (recent law changes extended the maximum term; confirm current terms with a Philippine lawyer), title in a Filipino spouse's name (legally the spouse's property), inheritance by legal succession, or a corporation at least 60% Filipino-owned. Nominee ('dummy') owners are illegal.",
          },
          { key: "purchase_price_php", label: "Purchase price", type: "number", unit: "PHP", required: true },
          {
            key: "php_per_usd",
            label: "PHP per USD",
            type: "number",
            required: true,
            placeholder: "e.g. 57",
            help: "Exchange rate for this model; check the current rate (BSP publishes a daily reference rate)",
          },
          {
            key: "closing_pct",
            label: "Closing costs",
            type: "percent",
            default: 6,
            help: "Transfer tax, documentary stamp tax, registration and legal/notarial fees; ~5-7% of the price is a common estimate. Who pays which is negotiable, so confirm with your broker or lawyer.",
          },
          { key: "furnishing_php", label: "Furnishing & setup", type: "number", unit: "PHP" },
          { key: "dues_monthly_php", label: "Association dues / month", type: "number", unit: "PHP" },
          { key: "rpt_yearly_php", label: "Real property tax / year", type: "number", unit: "PHP" },
          {
            key: "utilities_monthly_php",
            label: "Utilities & internet / month",
            type: "number",
            unit: "PHP",
            help: "What you pay; leave 0 if a long-term tenant pays utilities",
          },
          {
            key: "other_monthly_php",
            label: "Other costs / month",
            type: "number",
            unit: "PHP",
            help: "Cleaning, supplies, insurance, caretaker, repairs reserve",
          },
          { key: "nightly_php", label: "Nightly rate (Airbnb)", type: "number", unit: "PHP" },
          {
            key: "occupancy_pct",
            label: "Occupancy",
            type: "percent",
            placeholder: "e.g. 55",
            help: "Airbnb: share of available nights booked (check comparable listings). Long-term: share of the year rented, e.g. 92 for 11 of 12 months; blank means fully rented.",
          },
          { key: "rent_monthly_php", label: "Monthly rent (long-term)", type: "number", unit: "PHP" },
          {
            key: "mgmt_pct",
            label: "Management fee",
            type: "percent",
            help: "Local co-hosts / property managers often charge 15-25% of rent for short-term, less for long-term. 0 if you self-manage.",
          },
          {
            key: "platform_pct",
            label: "Platform fee",
            type: "percent",
            default: 3,
            help: "Airbnb split-fee hosts pay about 3% (host-only pricing is around 15%); Booking.com and Agoda commissions are often 15-20%. 0 for long-term.",
          },
          {
            key: "ph_tax_pct",
            label: "Philippine tax (estimate)",
            type: "percent",
            help: "Philippine taxes on rental income may apply depending on your residency and setup. Get an estimate from a cross-border CPA and enter it as a % of gross rent.",
          },
          {
            key: "personal_nights",
            label: "Personal-use nights / year",
            type: "number",
            unit: "nights",
            help: "Nights you or family use it; taken out of Airbnb availability",
          },
          { key: "listing_url", label: "Listing link", type: "url" },
          { key: "notes", label: "Notes", type: "textarea", placeholder: "Developer, turnover date, foreign-ownership % confirmed, short-term rental rules" },
        ],
        computed: [
          { key: "cash_in", label: "Total cash in", format: "money", fn: (d) => dealNumbers(d)?.cashIn ?? null },
          { key: "annual_gross", label: "Annual gross", format: "money", list: false, fn: (d) => dealNumbers(d)?.gross ?? null },
          { key: "annual_net", label: "Annual net", format: "money", fn: (d) => dealNumbers(d)?.net ?? null },
          { key: "cap_rate", label: "Cap rate", format: "percent", fn: dealCapRate },
          {
            key: "payback_years",
            label: "Payback (years)",
            format: "number",
            fn: (d) => {
              const m = dealNumbers(d);
              return m && m.net > 0 && !is("mode", MODE_VACATION)(d) ? m.cashIn / m.net : null;
            },
          },
          {
            key: "cost_per_personal_night",
            label: "Cost per night you stay",
            format: "money",
            list: false,
            fn: (d) => {
              const m = dealNumbers(d);
              return m && is("mode", MODE_VACATION)(d) ? ratio(m.costs, num(d.personal_nights)) : null;
            },
          },
        ],
      },
      {
        key: "stays",
        label: "Stays",
        singular: "Stay",
        description: "Guest bookings. Peso amounts are converted to USD with each stay's exchange rate.",
        titleField: "guest",
        dateField: "check_in",
        statusField: "status",
        sort: { field: "check_in", dir: "desc" },
        fields: [
          { key: "guest", label: "Guest", type: "text", required: true },
          { key: "check_in", label: "Check-in", type: "date", required: true },
          { key: "check_out", label: "Check-out", type: "date", required: true },
          { key: "platform", label: "Booked via", type: "select", options: ["Airbnb", "Booking.com", "Agoda", "Direct", "Other"], default: "Airbnb" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["Booked", "Checked in", "Completed", "Canceled"],
            default: "Booked",
            help: "Income counts once the guest checks in",
          },
          { key: "property", label: "Property", type: "ref", ref: "deals", help: "The unit from Deal model, if you have more than one" },
          { key: "guests", label: "Guests", type: "number" },
          { key: "nightly_php", label: "Nightly rate", type: "number", unit: "PHP" },
          { key: "cleaning_fee_php", label: "Cleaning fee charged", type: "number", unit: "PHP" },
          {
            key: "total_php",
            label: "Booking total (optional)",
            type: "number",
            unit: "PHP",
            help: "Gross from the platform incl. cleaning (e.g. Airbnb gross earnings). If filled, it's used instead of nightly rate x nights + cleaning.",
          },
          {
            key: "platform_fee_pct",
            label: "Platform fee",
            type: "percent",
            default: 3,
            help: "Airbnb split-fee ~3% (host-only ~15%); Booking.com / Agoda often 15-20%; Direct 0",
          },
          {
            key: "php_per_usd",
            label: "PHP per USD",
            type: "number",
            required: true,
            placeholder: "e.g. 57",
            help: "Exchange rate on the payout date. Converts this stay to USD for your US return.",
          },
          { key: "confirmation", label: "Confirmation code", type: "text" },
          { key: "review", label: "Guest review", type: "rating" },
        ],
        computed: [
          { key: "nights", label: "Nights", format: "number", fn: (d) => stayNights(d) || null },
          { key: "gross_usd", label: "Gross (USD)", format: "money", fn: (d) => phpUsd(stayGrossPhp(d), d.php_per_usd) },
          { key: "fee_usd", label: "Platform fee (USD)", format: "money", list: false, fn: (d) => phpUsd(stayFeePhp(d), d.php_per_usd) },
          { key: "net_usd", label: "Net (USD)", format: "money", fn: (d) => phpUsd(stayGrossPhp(d) - stayFeePhp(d), d.php_per_usd) },
        ],
        income: (d) => (stayCounts(d) ? phpUsd(stayGrossPhp(d), d.php_per_usd) ?? 0 : 0),
        expense: (d) => (stayCounts(d) ? phpUsd(stayFeePhp(d), d.php_per_usd) ?? 0 : 0),
        csvImport: {
          hint: "Airbnb: Earnings → Transaction history → Export CSV (in PHP). Booking.com: Extranet → Reservations → Download. Add the PHP per USD rate after importing.",
          guess: {
            guest: ["guest", "guest name", "guest name(s)", "booker name"],
            check_in: ["start date", "check-in", "arrival"],
            check_out: ["end date", "check-out", "departure"],
            total_php: ["gross earnings", "price", "total price"],
            confirmation: ["confirmation code", "book number", "reservation number"],
          },
          idField: "confirmation",
        },
      },
      {
        key: "expenses",
        label: "Expenses",
        singular: "Expense",
        description: "Running costs in pesos, converted to USD. Only the rental-use share is deductible.",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Expense", type: "text", required: true, placeholder: "e.g. October association dues" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: [
              "Association dues",
              "Utilities (electric / water)",
              "Internet",
              "Cleaning / laundry",
              "Repairs & maintenance",
              "Property manager",
              "Real property tax (RPT)",
              "Furnishing / supplies",
              "Insurance",
              "Legal / accounting",
              "Other",
            ],
          },
          { key: "amount_php", label: "Amount", type: "number", unit: "PHP", required: true },
          { key: "php_per_usd", label: "PHP per USD", type: "number", required: true, placeholder: "e.g. 57", help: "Exchange rate on the payment date" },
          { key: "property", label: "Property", type: "ref", ref: "deals" },
          {
            key: "rental_share_pct",
            label: "Rental-use share",
            type: "percent",
            default: 100,
            help: "When you also stay there yourself, US rules generally allow only the rental share (rental days / total days used). Use 0 for purely personal vacation-home costs.",
          },
          { key: "receipt_url", label: "Receipt link", type: "url" },
        ],
        computed: [
          { key: "amount_usd", label: "Amount (USD)", format: "money", fn: (d) => phpUsd(num(d.amount_php), d.php_per_usd) },
          {
            key: "deductible_usd",
            label: "Deductible (USD)",
            format: "money",
            fn: (d) => phpUsd((num(d.amount_php) * rentalShare(d)) / 100, d.php_per_usd),
          },
        ],
        expense: (d) => phpUsd((num(d.amount_php) * rentalShare(d)) / 100, d.php_per_usd) ?? 0,
      },
      {
        key: "visits",
        label: "Personal visits",
        singular: "Visit",
        description: "Your own stays. They drive the US personal-use test that limits deductions on a home you also rent out.",
        titleField: "trip",
        dateField: "arrive",
        sort: { field: "arrive", dir: "desc" },
        fields: [
          { key: "trip", label: "Trip", type: "text", required: true, placeholder: "e.g. Christmas with family" },
          { key: "arrive", label: "Arrive", type: "date", required: true },
          { key: "depart", label: "Depart", type: "date", required: true },
          { key: "property", label: "Property", type: "ref", ref: "deals" },
          { key: "who", label: "Who stayed", type: "text", placeholder: "e.g. Me + 3 family" },
          {
            key: "work_trip",
            label: "Mostly repair / maintenance days",
            type: "bool",
            default: false,
            help: "Days spent working substantially full time on repairs and maintenance don't count as personal use (IRS Pub 527)",
          },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [{ key: "personal_nights", label: "Personal nights", format: "number", fn: visitNights }],
      },
    ],
    kpis: [
      { label: "Rental income YTD", format: "money", value: (c) => c.incomeYtd, hint: "USD at each stay's exchange rate" },
      { label: "Net YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "Schedule E, before depreciation" },
      { label: "Booked nights YTD", format: "number", value: (c) => sum(c.ytd("stays").filter(stayCounts), stayNights) },
      {
        label: "Avg. nightly (USD)",
        format: "money",
        value: (c) => {
          const stays = c.ytd("stays").filter(stayCounts);
          return ratio(sum(stays, (d) => phpUsd(stayGrossPhp(d), d.php_per_usd) ?? 0), sum(stays, stayNights));
        },
      },
      {
        label: "Personal use YTD",
        format: "text",
        value: (c) => {
          const personal = sum(c.ytd("visits"), visitNights);
          const rented = sum(c.ytd("stays").filter(stayCounts), stayNights);
          return `${personal} of ${Math.max(14, Math.floor(rented * 0.1))} nights`;
        },
        hint: "US test: personal use over the greater of 14 days or 10% of rented days limits deductions (Pub 527)",
      },
      {
        label: "Best modeled cap rate",
        format: "percent",
        value: (c) => {
          const rates = c
            .all("deals")
            .filter((d) => !is("status", "Passed")(d))
            .map(dealCapRate)
            .filter((r): r is number => r != null);
          return rates.length ? Math.max(...rates) : null;
        },
        hint: "Highest cap rate in Deal model (excluding passed deals)",
      },
    ],
    checklist: {
      label: "Before you buy",
      items: [
        "Foreigners can't own land in the Philippines. A condo unit is fine while the building's foreign ownership stays within 40%; get the current foreign-ownership figure from the developer or condo corporation in writing",
        "Houses and land: use a registered long-term lease, or title held by a Filipino spouse (legally their property) or a 60/40 Filipino-majority corporation. Never use a nominee owner; it's illegal under the Anti-Dummy Law",
        "Recent law changes extended the maximum land lease term for foreign investors; have a Philippine lawyer confirm current terms and run a title check at the Registry of Deeds before any deposit",
        "Read the condo's house rules: many buildings restrict or ban short-term rentals or require guest registration",
        "For short-term rentals, ask the LGU about business permits, BIR registration, and Department of Tourism accreditation; requirements vary by city and are strict in places like Boracay",
        "US citizens report worldwide income: foreign rental income goes on Schedule E in USD, and Philippine taxes on rental income may also apply (a foreign tax credit can offset double tax). Foreign rental property is depreciated over a longer schedule; consult a cross-border CPA",
        "Peso bank accounts: if your foreign accounts total over $10,000 at any time in the year, file an FBAR (FinCEN 114)",
        "Log every stay and expense with that day's PHP-per-USD rate so the numbers land in USD",
      ],
    },
    integrations: [
      { kind: "link", label: "Airbnb hosting", url: "https://www.airbnb.com/hosting" },
      { kind: "link", label: "Booking.com Partner Hub", url: "https://partner.booking.com" },
      { kind: "link", label: "Agoda YCS (host extranet)", url: "https://ycs.agoda.com", note: "Popular with Asian travelers" },
    ],
    resources: [
      { label: "IRS Publication 527 (Residential Rental Property)", url: "https://www.irs.gov/publications/p527" },
      { label: "IRS Schedule E", url: "https://www.irs.gov/forms-pubs/about-schedule-e-form-1040" },
      { label: "IRS: US citizens and residents abroad", url: "https://www.irs.gov/individuals/international-taxpayers/us-citizens-and-resident-aliens-abroad" },
      { label: "IRS: FBAR filing", url: "https://www.irs.gov/businesses/small-businesses-self-employed/report-of-foreign-bank-and-financial-accounts-fbar" },
      { label: "Bureau of Internal Revenue (Philippines)", url: "https://www.bir.gov.ph" },
      { label: "Bangko Sentral ng Pilipinas (reference exchange rate)", url: "https://www.bsp.gov.ph" },
    ],
  },
  {
    categories: ["Storage / Parking Space Rental"],
    tagline: "Garages, driveways, parking and storage spaces: who's renting, what's paid, and what's sitting empty.",
    usesClients: true,
    clientLabel: "Renters",
    jobsBoard: false,
    schedule: false,
    collections: [
      {
        key: "spaces",
        label: "Spaces",
        singular: "Space",
        titleField: "name",
        statusField: "status",
        fields: [
          { key: "name", label: "Space", type: "text", required: true, placeholder: "e.g. Garage bay 2, Driveway spot A" },
          {
            key: "space_type",
            label: "Type",
            type: "select",
            options: ["Garage", "Driveway", "Parking spot", "Carport", "Storage unit", "Shed / outbuilding", "Basement / attic", "RV / boat spot", "Yard / lot"],
          },
          { key: "status", label: "Status", type: "select", options: ["Vacant", "Rented", "Unavailable"], default: "Vacant" },
          { key: "monthly_rate", label: "Asking rate / month", type: "money", list: true },
          { key: "platform", label: "Listed on", type: "select", options: ["Neighbor.com", "SpotHero", "Direct", "Craigslist", "Facebook Marketplace", "Nextdoor", "Other"] },
          { key: "size_sqft", label: "Size", type: "number", unit: "sq ft" },
          { key: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g. 10 x 20 ft, 7 ft door" },
          { key: "features", label: "Features", type: "text", placeholder: "e.g. covered, 24/7 access, outlet, climate controlled" },
          { key: "location", label: "Location", type: "text" },
          { key: "listing_url", label: "Listing link", type: "url" },
        ],
        computed: [
          { key: "rate_per_sqft", label: "$ / sq ft / mo", format: "money", fn: (d) => ratio(num(d.monthly_rate), num(d.size_sqft)) },
        ],
      },
      {
        key: "leases",
        label: "Leases",
        singular: "Lease",
        titleField: "renter_name",
        dateField: "start_date",
        statusField: "status",
        sort: { field: "start_date", dir: "desc" },
        fields: [
          { key: "renter_name", label: "Renter", type: "text", required: true },
          { key: "space", label: "Space", type: "ref", ref: "spaces", required: true },
          { key: "monthly_rent", label: "Monthly rent", type: "money", required: true },
          { key: "status", label: "Status", type: "select", options: ["Pending", "Active", "Notice given", "Ended"], default: "Active" },
          { key: "start_date", label: "Start", type: "date", required: true },
          { key: "end_date", label: "End", type: "date", help: "Blank = month-to-month" },
          { key: "renter", label: "Renter profile", type: "client", help: "Optional: link the renter's contact details" },
          { key: "due_day", label: "Rent due day", type: "number", placeholder: "1", help: "Day of the month rent is due" },
          { key: "deposit", label: "Deposit", type: "money", help: "Not income unless you keep it (record a kept deposit as a payment)" },
          { key: "access", label: "Access method / gate code", type: "text", placeholder: "e.g. keypad 4821, remote #2, lockbox" },
          { key: "stored", label: "Vehicle / items stored", type: "text", placeholder: "e.g. 2019 Tacoma, plate 8ABC123" },
          { key: "agreement_signed", label: "Signed agreement", type: "bool", default: false },
          { key: "insurance_on_file", label: "Renter's insurance on file", type: "bool", default: false },
          { key: "autopay", label: "Autopay", type: "bool", default: false },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          {
            key: "months",
            label: "Months rented",
            format: "number",
            fn: (d) => {
              const days = daysBetween(d.start_date, d.end_date || todayIso());
              return days ? Math.round((days / 30.44) * 10) / 10 : null;
            },
          },
          { key: "annual_rent", label: "Annual rent", format: "money", list: false, fn: (d) => num(d.monthly_rent) * 12 || null },
        ],
      },
      {
        key: "payments",
        label: "Payments",
        singular: "Payment",
        titleField: "payer",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "payer", label: "Paid by", type: "text", required: true },
          { key: "date", label: "Date received", type: "date", required: true },
          { key: "space", label: "Space", type: "ref", ref: "spaces" },
          { key: "amount", label: "Amount", type: "money", required: true, help: "Gross rent before any platform fee" },
          { key: "period", label: "For period", type: "text", placeholder: "e.g. Oct 2026" },
          {
            key: "kind",
            label: "Type",
            type: "select",
            options: ["Rent", "Deposit kept", "Other income"],
            default: "Rent",
          },
          { key: "late_fee", label: "Late fee", type: "money" },
          {
            key: "platform_fee",
            label: "Platform / processing fee",
            type: "money",
            help: "Neighbor and SpotHero pay out after their fee; enter it so the gross counts as income and the fee as an expense",
          },
          {
            key: "method",
            label: "Paid via",
            type: "select",
            options: ["Platform payout", "Zelle", "Venmo", "Cash App", "PayPal", "Card (Stripe / Square)", "Check", "Cash", "Other"],
          },
        ],
        computed: [
          { key: "net", label: "Net received", format: "money", fn: (d) => paymentIncome(d) - num(d.platform_fee) },
        ],
        income: paymentIncome,
        expense: (d) => num(d.platform_fee),
      },
      {
        key: "expenses",
        label: "Expenses",
        singular: "Expense",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Expense", type: "text", required: true, placeholder: "e.g. Keypad lock, extra garage remote" },
          { key: "date", label: "Date", type: "date", required: true },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: [
              "Insurance",
              "HOA fees (rental share)",
              "Property tax (rental share)",
              "Repairs & maintenance",
              "Locks / remotes / signage",
              "Security cameras / lighting",
              "Utilities",
              "Cleaning",
              "Listing / advertising",
              "Other",
            ],
          },
          { key: "amount", label: "Amount", type: "money", required: true },
          { key: "space", label: "Space", type: "ref", ref: "spaces" },
          { key: "receipt_url", label: "Receipt link", type: "url" },
        ],
        expense: (d) => num(d.amount),
      },
    ],
    kpis: [
      {
        label: "Occupancy",
        format: "percent",
        value: (c) => {
          const rentable = c.all("spaces").filter((d) => !is("status", "Unavailable")(d));
          return ratio(count(rentable, is("status", "Rented")), rentable.length);
        },
        hint: "Rented / rentable spaces",
      },
      { label: "Monthly rent roll", format: "money", value: (c) => sum(c.all("leases").filter(leaseActive), "monthly_rent"), hint: "Active leases" },
      { label: "Collected YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Net YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      { label: "Vacant spaces", format: "number", value: (c) => count(c.all("spaces"), is("status", "Vacant")) },
      {
        label: "Rent not in yet",
        format: "number",
        value: (c) => {
          const dayOfMonth = new Date().getDate();
          const paid = new Set(
            c
              .month("payments")
              .filter(is("kind", "Rent", ""))
              .map((d) => String(d.space ?? "")),
          );
          return count(
            c.all("leases"),
            (d) => leaseActive(d) && !!d.space && (num(d.due_day) || 1) <= dayOfMonth && !paid.has(String(d.space)),
          );
        },
        hint: "Active leases past their due day with no rent payment for their space this month",
      },
    ],
    checklist: {
      label: "Before you list",
      items: [
        "Check that your HOA rules, your own lease (if you rent) and local zoning allow renting out the space",
        "Use a written agreement with every renter: rent, due date, late fee, deposit, access hours, notice to end",
        "List prohibited items (flammable or hazardous materials, perishables, anything illegal, living in the space) and ask renters to insure their own belongings",
        "Get liability insurance that covers renting the space; homeowner policies often exclude business use, and platform host protections have limits",
        "Track gate codes and remotes per renter, and change codes when a lease ends",
        "Rental income is taxable; renting space without substantial services usually goes on Schedule E. Deposits aren't income unless you keep them",
      ],
    },
    integrations: [
      { kind: "link", label: "Neighbor.com", url: "https://www.neighbor.com", note: "Peer-to-peer storage and parking marketplace; handles booking and monthly payments" },
      { kind: "link", label: "SpotHero", url: "https://spothero.com", note: "Mainly for parking lots and garage operators" },
      { kind: "link", label: "Craigslist", url: "https://www.craigslist.org", note: "Housing → parking & storage" },
    ],
    resources: [
      { label: "IRS Topic 414: Rental income and expenses", url: "https://www.irs.gov/taxtopics/tc414" },
      { label: "IRS Publication 527 (Residential Rental Property)", url: "https://www.irs.gov/publications/p527" },
      { label: "IRS Schedule E", url: "https://www.irs.gov/forms-pubs/about-schedule-e-form-1040" },
    ],
  },
];
