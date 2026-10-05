import { count, daysBetween, is, num, ratio, sum, type GigConfig, type RecordData } from "../schema";

// Airbnb / short-term rental host. Reservations come in from the listing's
// calendar (iCal sync: dates + confirmation code) and the Airbnb earnings
// CSV (amounts); both land on the same row via the confirmation code.

const nights = (d: RecordData) => num(d.nights) || daysBetween(d.check_in, d.check_out);
const gross = (d: RecordData) => num(d.gross) || nights(d) * num(d.nightly_rate) + num(d.cleaning_fee);
const hostFee = (d: RecordData) => (d.host_fee != null && d.host_fee !== "" ? num(d.host_fee) : gross(d) * (num(d.host_fee_pct) / 100));
const live = (d: RecordData) => !is("status", "Canceled", "Inquiry", "Blocked")(d);

export const SHORT_TERM_RENTAL_CONFIGS: GigConfig[] = [
  {
    categories: ["Airbnb / Short-Term Rental Host"],
    tagline: "Reservations synced from your Airbnb / VRBO calendar, payouts, turnovers and occupancy.",
    usesClients: false,
    schedule: { label: "Check-ins, turnovers & maintenance" },
    jobsBoard: false,
    collections: [
      {
        key: "reservations",
        label: "Reservations",
        singular: "Reservation",
        titleField: "guest",
        dateField: "check_in",
        statusField: "status",
        sort: { field: "check_in", dir: "desc" },
        fields: [
          { key: "guest", label: "Guest", type: "text", required: true },
          { key: "listing", label: "Listing", type: "ref", ref: "listings" },
          { key: "platform", label: "Platform", type: "select", options: ["Airbnb", "VRBO", "Booking.com", "Direct", "Other"], default: "Airbnb" },
          { key: "check_in", label: "Check-in", type: "date", required: true },
          { key: "check_out", label: "Check-out", type: "date", list: true },
          { key: "nights", label: "Nights", type: "number", help: "Leave blank to count from the dates" },
          { key: "guests_count", label: "Guests", type: "number" },
          { key: "nightly_rate", label: "Avg. nightly rate", type: "money" },
          { key: "cleaning_fee", label: "Cleaning fee charged", type: "money" },
          { key: "gross", label: "Gross earnings", type: "money", help: "Airbnb's 'Gross Earnings' (nightly total + cleaning fee). Overrides the nightly math when filled." },
          { key: "host_fee_pct", label: "Host service fee", type: "percent", default: 3, help: "Airbnb split-fee hosts ~3%; host-only fee ~15%" },
          { key: "host_fee", label: "Host fee (actual)", type: "money", help: "From the payout report, if you have it" },
          { key: "taxes_remitted", label: "Occupancy tax collected by platform", type: "money", help: "Not your income when the platform remits it" },
          { key: "status", label: "Status", type: "select", options: ["Inquiry", "Booked", "Checked in", "Completed", "Canceled", "Blocked"], default: "Booked" },
          { key: "review", label: "Review", type: "rating" },
          { key: "external_ref", label: "Confirmation code", type: "text", help: "Matches the calendar sync and the earnings CSV" },
          { key: "notes", label: "Notes", type: "textarea" },
        ],
        computed: [
          { key: "nights_calc", label: "Nights", format: "number", fn: (d) => nights(d) || null },
          { key: "gross_calc", label: "Gross", format: "money", fn: (d) => gross(d) || null },
          { key: "payout", label: "Payout", format: "money", fn: (d) => (gross(d) ? gross(d) - hostFee(d) : null) },
          { key: "adr", label: "ADR", format: "money", fn: (d) => ratio(gross(d) - num(d.cleaning_fee), nights(d)) },
        ],
        income: (d) => (live(d) ? gross(d) : 0),
        expense: (d) => (live(d) ? hostFee(d) : 0),
        csvImport: {
          hint: "Airbnb: Menu → Earnings → Download CSV (Completed or Upcoming payouts). Rows with the same confirmation code update the synced reservation.",
          guess: {
            external_ref: ["confirmation code"],
            guest: ["guest"],
            check_in: ["start date"],
            nights: ["nights"],
            gross: ["gross earnings"],
            host_fee: ["service fee", "host fee"],
            cleaning_fee: ["cleaning fee"],
            taxes_remitted: ["occupancy taxes", "pass through tot"],
          },
          idField: "external_ref",
        },
      },
      {
        key: "listings",
        label: "Listings",
        singular: "Listing",
        titleField: "name",
        fields: [
          { key: "name", label: "Listing", type: "text", required: true },
          { key: "address", label: "Address", type: "text" },
          { key: "bedrooms", label: "Bedrooms", type: "number" },
          { key: "max_guests", label: "Max guests", type: "number" },
          { key: "base_rate", label: "Base nightly rate", type: "money", list: true },
          { key: "cleaning_fee", label: "Cleaning fee", type: "money" },
          { key: "min_nights", label: "Minimum nights", type: "number" },
          { key: "permit_no", label: "STR permit / license #", type: "text", help: "Many cities require a short-term rental permit" },
          { key: "permit_expires", label: "Permit expires", type: "date" },
          { key: "listing_url", label: "Listing link", type: "url" },
          { key: "lockbox", label: "Entry / lock code notes", type: "text" },
        ],
      },
      {
        key: "turnovers",
        label: "Turnovers",
        singular: "Turnover",
        titleField: "date",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "listing", label: "Listing", type: "ref", ref: "listings" },
          { key: "cleaner", label: "Cleaner", type: "text" },
          { key: "cleaning_cost", label: "Cleaning cost", type: "money", list: true },
          { key: "laundry_cost", label: "Laundry", type: "money" },
          { key: "restock_cost", label: "Restock (supplies)", type: "money" },
          { key: "status", label: "Status", type: "select", options: ["Scheduled", "Done", "Issue reported"], default: "Scheduled" },
          { key: "damage", label: "Damage / missing items", type: "textarea" },
        ],
        computed: [{ key: "total", label: "Total cost", format: "money", fn: (d) => num(d.cleaning_cost) + num(d.laundry_cost) + num(d.restock_cost) }],
        expense: (d) => num(d.cleaning_cost) + num(d.laundry_cost) + num(d.restock_cost),
      },
      {
        key: "expenses",
        label: "Expenses",
        singular: "Expense",
        titleField: "item",
        dateField: "date",
        fields: [
          { key: "item", label: "Expense", type: "text", required: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "listing", label: "Listing", type: "ref", ref: "listings" },
          { key: "category", label: "Category", type: "select", options: ["Utilities", "Internet / streaming", "Repairs", "Furnishings", "Supplies", "Insurance", "Mortgage interest", "Property tax", "HOA", "Permits / licenses", "Software (pricing, locks)", "Other"] },
          { key: "amount", label: "Amount", type: "money", required: true },
          { key: "rental_pct", label: "Rental-use share", type: "percent", default: 100, help: "Lower it if you also live in / use the property" },
        ],
        computed: [{ key: "deductible", label: "Deductible", format: "money", fn: (d) => num(d.amount) * (num(d.rental_pct || 100) / 100) }],
        expense: (d) => num(d.amount) * (num(d.rental_pct === "" || d.rental_pct == null ? 100 : d.rental_pct) / 100),
      },
    ],
    kpis: [
      { label: "Gross YTD", format: "money", value: (c) => sum(c.ytd("reservations").filter(live), gross) },
      { label: "Net YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After host fees, turnovers and expenses" },
      {
        label: "Occupancy YTD",
        format: "percent",
        value: (c) => {
          const start = new Date(new Date().getFullYear(), 0, 1).getTime();
          const elapsed = Math.max(1, Math.ceil((Date.now() - start) / 86_400_000));
          const listings = Math.max(1, count(c.all("listings")));
          return ratio(sum(c.ytd("reservations").filter(live), nights), elapsed * listings);
        },
      },
      { label: "ADR YTD", format: "money", value: (c) => ratio(sum(c.ytd("reservations").filter(live), (d) => gross(d) - num(d.cleaning_fee)), sum(c.ytd("reservations").filter(live), nights)) },
      { label: "Missing amounts", format: "number", value: (c) => count(c.all("reservations"), (d) => live(d) && !gross(d)), hint: "Synced stays without earnings yet: import the earnings CSV" },
    ],
    checklist: {
      label: "Host checklist",
      items: [
        "Check your city/county short-term rental rules and get a permit if required",
        "Confirm your HOA, lease or mortgage allows short-term rentals",
        "Get short-term rental insurance (a regular homeowner's policy may not cover guests)",
        "Connect your listing calendar below so reservations sync automatically",
        "Import the Airbnb earnings CSV monthly to fill in payouts",
        "Know your tax category: average stay of 7 days or less can change how income is reported; ask your CPA",
        "If you use the property personally, track personal days (affects deductions)",
      ],
    },
    integrations: [
      { kind: "ical", label: "Listing calendar (iCal)" },
      { kind: "link", label: "Airbnb hosting", url: "https://www.airbnb.com/hosting" },
      { kind: "link", label: "VRBO owner dashboard", url: "https://www.vrbo.com/p/owner" },
    ],
    resources: [
      { label: "Airbnb Resource Center (hosting)", url: "https://www.airbnb.com/resources/hosting-homes" },
      { label: "IRS Topic 415: renting residential & vacation property", url: "https://www.irs.gov/taxtopics/tc415" },
    ],
  },
];
