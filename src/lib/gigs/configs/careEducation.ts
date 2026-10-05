import {
  avg,
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

// Care & Wellness and Education & Coaching. These are people businesses:
// every workspace keeps the details you need in the moment (allergies,
// pressure preferences, vet info, care plans, learning notes) next to a
// session log that turns hours, rates, tips, app fees and miles into
// taxable income and deductions.

// ---------- shared helpers ----------

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const has = (v: unknown) => v !== undefined && v !== null && v !== "";

const mileage = (d: RecordData) => num(d.miles) * IRS_MILEAGE_RATE;

const yearsSince = (date: unknown) => {
  const days = daysBetween(date, today());
  return days ? Math.floor(days / 365.25) : null;
};

// Days from today until a future YYYY-MM-DD date (0 if today, null if past or blank).
const daysUntil = (date: unknown) => {
  if (typeof date !== "string" || !date) return null;
  const t = today();
  if (date.slice(0, 10) < t) return null;
  return daysBetween(t, date);
};

const TAX_SET_ASIDE =
  "Set aside about 25-30% of profit for income and self-employment tax, and pay quarterly estimates if you'll owe $1,000 or more";

const IRS_ESTIMATED = { label: "IRS: estimated taxes", url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes" };
const IRS_SELF_EMPLOYED = {
  label: "IRS: self-employed tax center",
  url: "https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center",
};
const IRS_MILEAGE = { label: "IRS standard mileage rates", url: "https://www.irs.gov/tax-professionals/standard-mileage-rates" };
const IRS_PUB_926 = {
  label: "IRS Publication 926 (household employers)",
  url: "https://www.irs.gov/publications/p926",
  note: "When a family is your employer instead of your client",
};
const RED_CROSS = { label: "Red Cross classes (CPR, first aid)", url: "https://www.redcross.org/take-a-class" };

const expenses = (placeholder: string, categories: string[]): GigCollection => ({
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
    { key: "receipt_url", label: "Receipt link", type: "url" },
  ],
  expense: (d) => num(d.amount),
});

const GRADES = ["Pre-K", "K", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "College", "Adult"];

// ---------- Babysitting / Nanny ----------

const shiftHours = (d: RecordData) => hoursBetween(d.start, d.end);
const shiftRate = (d: RecordData) => num(d.hourly_rate) + num(d.extra_kid_rate) * Math.max(0, num(d.kids_count) - 1);
const shiftPay = (d: RecordData) => {
  const hours = shiftHours(d);
  const premium = Math.min(num(d.ot_hours), hours);
  const mult = num(d.ot_multiplier) || 1.5;
  return (hours - premium) * shiftRate(d) + premium * shiftRate(d) * mult;
};
const shiftWorked = (d: RecordData) => is("status", "Completed", "Paid")(d);
const shiftIncome = (d: RecordData) => {
  if (is("status", "Booked", "Canceled")(d)) return 0;
  if (is("status", "Late cancel (fee)")(d)) return num(d.cancel_fee);
  return shiftPay(d) + num(d.tip);
};

// ---------- Massage ----------

const massageTotal = (d: RecordData) => num(d.price) + num(d.tip);
const intakeAge = (d: RecordData) => (has(d.updated_on) ? daysBetween(d.updated_on, today()) : null);
const pkgRemaining = (d: RecordData) => Math.max(0, num(d.sessions_bought) - num(d.sessions_used));

// ---------- Pet sitting ----------

const visitBase = (d: RecordData) => num(d.rate) * (num(d.units) || 1) + num(d.addons);
const visitFee = (d: RecordData) => (visitBase(d) * num(d.platform_fee_pct)) / 100;
const visitGross = (d: RecordData) => visitBase(d) + num(d.tip);
const visitLive = (d: RecordData) => !is("status", "Booked", "Canceled")(d);

// ---------- Senior care ----------

const careHours = (d: RecordData) => hoursBetween(d.start, d.end);
const carePay = (d: RecordData) => num(d.flat_rate) || careHours(d) * num(d.hourly_rate);
const careLive = (d: RecordData) => !is("status", "Scheduled", "Canceled")(d);

// ---------- Tutoring / test prep lessons ----------

const lessonHours = (d: RecordData) => num(d.minutes) / 60;
const lessonGross = (d: RecordData) => lessonHours(d) * num(d.rate) * (num(d.students_count) || 1);
const lessonFee = (d: RecordData) => (lessonGross(d) * num(d.platform_fee_pct)) / 100;
const lessonBilled = (d: RecordData) => !is("status", "Scheduled", "Canceled")(d);

// ---------- Music ----------

const MAKEUP_OWED = ["Student canceled (make-up owed)", "Teacher canceled (make-up owed)"];

// ---------- Test prep ----------

const TESTS = ["SAT", "PSAT/NMSQT", "ACT", "AP exam", "GRE", "GMAT", "LSAT", "MCAT", "ISEE", "SSAT", "SHSAT", "TOEFL", "IELTS", "Other"];

// Total / composite from section scores, for tests where that's a simple formula.
const calcTotal = (d: RecordData): number | null => {
  const s = [num(d.s1), num(d.s2), num(d.s3), num(d.s4)];
  switch (String(d.test ?? "")) {
    case "SAT":
    case "PSAT/NMSQT":
    case "GRE":
      return s[0] && s[1] ? s[0] + s[1] : null;
    case "ACT": {
      // Composite = average of English, Math and Reading (Science is optional and separate).
      const core = s.slice(0, 3).filter((n) => n > 0);
      return core.length === 3 ? Math.round((core[0] + core[1] + core[2]) / 3) : null;
    }
    case "MCAT":
      return s.every((n) => n > 0) ? s[0] + s[1] + s[2] + s[3] : null;
    case "LSAT":
      return s[0] || null;
    default:
      return null;
  }
};
const practiceScore = (d: RecordData) => num(d.total) || calcTotal(d);

export const CARE_EDUCATION_CONFIGS: GigConfig[] = [
  // ======================= Care & Wellness =======================
  {
    categories: ["Babysitting / Nanny Services"],
    tagline: "Each child's allergies, routines and emergency info, plus shifts that work out your pay, overtime and miles.",
    usesClients: true,
    clientLabel: "Families",
    jobsBoard: false,
    schedule: { label: "Shifts" },
    collections: [
      {
        key: "shifts",
        label: "Shifts",
        singular: "Shift",
        titleField: "start",
        dateField: "start",
        statusField: "status",
        sort: { field: "start", dir: "desc" },
        fields: [
          { key: "start", label: "Start", type: "datetime", required: true },
          { key: "end", label: "End", type: "datetime", required: true },
          { key: "family", label: "Family", type: "client", list: true },
          { key: "shift_type", label: "Type", type: "select", options: ["After school", "Date night", "Full day", "Overnight", "Regular nanny day", "Event / wedding", "Drop-in"] },
          { key: "kids_count", label: "Kids", type: "number", default: 1 },
          { key: "hourly_rate", label: "Hourly rate", type: "money", required: true },
          { key: "extra_kid_rate", label: "Extra per child / hr", type: "money", help: "Added to the hourly rate for each child after the first" },
          {
            key: "ot_hours",
            label: "Premium hours",
            type: "number",
            unit: "hrs",
            help: "Hours paid at a higher rate: after midnight, holidays, or over 40 hrs in a week for a nanny",
          },
          { key: "ot_multiplier", label: "Premium multiplier", type: "number", default: 1.5, help: "1.5 = time and a half" },
          { key: "tip", label: "Tip / bonus", type: "money" },
          { key: "cancel_fee", label: "Late-cancel fee", type: "money", help: "What you charged when the family canceled last minute (status: Late cancel)" },
          { key: "miles", label: "Miles driven", type: "number", unit: "mi", help: "School runs, activities and errands during the shift" },
          { key: "booked_via", label: "Booked via", type: "select", options: ["Direct / referral", "Care.com", "UrbanSitter", "Sittercity", "Agency", "Other"], default: "Direct / referral" },
          { key: "pay_method", label: "Paid by", type: "select", options: ["Cash", "Venmo", "Zelle", "PayPal", "Check", "Through the app", "Other"] },
          { key: "status", label: "Status", type: "select", options: ["Booked", "Completed", "Paid", "Late cancel (fee)", "Canceled"], default: "Completed" },
          { key: "incident", label: "Incident to report", type: "bool", help: "Injury, illness or behavior issue the parents need to hear about" },
          { key: "notes", label: "Shift report", type: "textarea", placeholder: "Meals, naps, diapers / potty, activities, anything the parents should know" },
        ],
        computed: [
          { key: "hours", label: "Hours", format: "hours", fn: (d) => shiftHours(d) || null },
          { key: "eff_rate", label: "Rate / hr", format: "money", fn: (d) => shiftRate(d) || null, list: false },
          { key: "earned", label: "Earned", format: "money", fn: (d) => shiftIncome(d) },
          { key: "mileage", label: "Mileage deduction", format: "money", fn: (d) => (num(d.miles) ? mileage(d) : null), list: false },
        ],
        income: shiftIncome,
        expense: (d) => (is("status", "Booked", "Canceled")(d) ? 0 : mileage(d)),
      },
      {
        key: "kids",
        label: "Kids",
        singular: "Child",
        titleField: "name",
        sort: { field: "name", dir: "asc" },
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "family", label: "Family", type: "client", list: true },
          { key: "birthday", label: "Birthday", type: "date" },
          { key: "allergies", label: "Allergies", type: "text", list: true, placeholder: "e.g. peanuts (EpiPen in the diaper bag), none known" },
          { key: "medical", label: "Medical needs & medicines", type: "textarea", help: "Conditions and any medicine the parents asked you to give, with dose and time" },
          { key: "meals", label: "Meals & snacks", type: "textarea", placeholder: "What they eat, what's off-limits, bottle / formula amounts" },
          { key: "nap_time", label: "Nap / quiet time", type: "text" },
          { key: "bedtime", label: "Bedtime routine", type: "text", placeholder: "Bath at 7, two books, lights out 7:45" },
          { key: "screen_rules", label: "Screen-time rules", type: "text" },
          { key: "comfort", label: "Comfort items & soothing tips", type: "text" },
          { key: "school", label: "School / daycare", type: "text" },
          { key: "pickup_ok", label: "Authorized pickups", type: "text", help: "Only release the child to these people" },
          { key: "emergency_contact", label: "Emergency contact (name & phone)", type: "text" },
          { key: "pediatrician", label: "Pediatrician & phone", type: "text" },
          { key: "medical_consent", label: "Signed medical consent on file", type: "bool" },
          { key: "notes", label: "Other notes", type: "textarea" },
        ],
        computed: [{ key: "age", label: "Age", format: "number", fn: (d) => yearsSince(d.birthday) }],
      },
      expenses("e.g. CPR class, background check, craft supplies", [
        "CPR / first aid course",
        "Background check",
        "App / membership fees",
        "Activities & crafts",
        "Outings (not reimbursed)",
        "Car seat / gear",
        "Phone (business share)",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After mileage and expenses" },
      { label: "Hours this month", format: "hours", value: (c) => sum(c.month("shifts").filter(shiftWorked), shiftHours) },
      {
        label: "Avg. $ / hour YTD",
        format: "money",
        value: (c) => {
          const worked = c.ytd("shifts").filter(shiftWorked);
          return ratio(sum(worked, shiftIncome), sum(worked, shiftHours));
        },
        hint: "Including premiums and tips",
      },
      { label: "Owed to you", format: "money", value: (c) => sum(c.all("shifts").filter(is("status", "Completed")), shiftIncome), hint: "Completed shifts not marked Paid" },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get infant and child CPR and first aid certified (Red Cross or American Heart Association)",
        "Complete a background check and keep a copy to share with families who book you directly",
        "Fill in each child's allergies, medicines, emergency contact and authorized pickups before the first shift",
        "Agree on rates in writing: hourly, extra child, late-night / holiday premium, and cancellation fee",
        "Regular nanny for one family? You may be their household employee (W-2 and nanny tax, see IRS Publication 926), not self-employed",
        "Make sure your car insurance covers driving kids, and use car seats that fit them",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [
      { kind: "link", label: "Care.com", url: "https://www.care.com", note: "Profile, reviews and family messages" },
      { kind: "link", label: "UrbanSitter", url: "https://www.urbansitter.com" },
      { kind: "link", label: "Sittercity", url: "https://www.sittercity.com" },
    ],
    resources: [RED_CROSS, { label: "American Heart Association CPR", url: "https://cpr.heart.org" }, IRS_PUB_926, IRS_ESTIMATED],
  },
  {
    categories: ["Massage Therapist"],
    tagline: "Client intakes with health flags, SOAP-noted sessions, and packages, with tips and fees flowing to taxes.",
    usesClients: true,
    clientLabel: "Clients",
    jobsBoard: false,
    schedule: { label: "Appointments" },
    collections: [
      {
        key: "sessions",
        label: "Sessions",
        singular: "Session",
        titleField: "date",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "modality",
            label: "Modality",
            type: "select",
            list: true,
            options: ["Swedish", "Deep tissue", "Sports", "Prenatal", "Hot stone", "Myofascial release", "Trigger point", "Lymphatic drainage", "Reflexology", "Thai", "Cupping", "Chair massage", "Other"],
          },
          { key: "minutes", label: "Length", type: "number", unit: "min", default: 60 },
          { key: "location", label: "Location", type: "select", options: ["Studio / office", "Mobile (client's home)", "Spa / clinic", "Corporate / event"], default: "Studio / office" },
          { key: "pressure", label: "Pressure used", type: "select", options: ["Light", "Medium", "Firm", "Deep"] },
          {
            key: "price",
            label: "Price charged",
            type: "money",
            help: "Enter 0 if this used a prepaid package (counted when it was sold). For no-shows or late cancels, enter the fee you charged.",
          },
          { key: "tip", label: "Tip", type: "money" },
          { key: "package", label: "Package used", type: "ref", ref: "packages" },
          { key: "payment", label: "Payment", type: "select", options: ["Card", "Cash", "Venmo / Zelle", "Package credit", "Gift certificate", "HSA / FSA card", "Other"] },
          { key: "card_fee", label: "Card processing fee", type: "money" },
          { key: "miles", label: "Miles driven (mobile)", type: "number", unit: "mi" },
          { key: "status", label: "Status", type: "select", options: ["Booked", "Completed", "No-show", "Late cancel", "Canceled"], default: "Completed" },
          { key: "subjective", label: "S: Client reports", type: "textarea", placeholder: "Complaints, pain level 0-10, activities, changes since last visit" },
          { key: "objective", label: "O: Findings & techniques", type: "textarea", placeholder: "Posture, tension, trigger points, ROM; techniques and areas worked" },
          { key: "assessment", label: "A: Response to treatment", type: "textarea", placeholder: "Change in pain / ROM, how the client tolerated pressure" },
          { key: "plan", label: "P: Plan & home care", type: "textarea", placeholder: "Stretches, heat / ice, recommended frequency, next focus" },
        ],
        computed: [
          { key: "total", label: "Total (incl. tip)", format: "money", fn: (d) => (is("status", "Canceled")(d) ? 0 : massageTotal(d)) },
          { key: "per_hour", label: "$ / hands-on hour", format: "money", fn: (d) => ratio(massageTotal(d), num(d.minutes) / 60) },
        ],
        income: (d) => (is("status", "Booked", "Canceled")(d) ? 0 : massageTotal(d)),
        expense: (d) => (is("status", "Booked", "Canceled")(d) ? 0 : num(d.card_fee) + mileage(d)),
      },
      {
        key: "intake",
        label: "Client intake",
        singular: "Intake form",
        titleField: "client",
        sort: { field: "updated_on", dir: "asc" },
        fields: [
          { key: "client", label: "Client", type: "client", required: true },
          { key: "updated_on", label: "Last updated", type: "date", list: true, help: "Review health history at least yearly and whenever something changes" },
          { key: "pressure", label: "Preferred pressure", type: "select", options: ["Light", "Medium", "Firm", "Deep"], list: true },
          { key: "focus_areas", label: "Focus areas", type: "text", list: true, placeholder: "e.g. neck & shoulders, low back, IT band" },
          { key: "avoid_areas", label: "Areas to avoid", type: "text", placeholder: "e.g. feet, abdomen, face" },
          {
            key: "health_flags",
            label: "Health flags / contraindications",
            type: "textarea",
            help: "Pregnancy, blood thinners, recent surgery or injury, varicose veins, skin conditions, etc. Recheck before every session.",
          },
          { key: "medications", label: "Medications", type: "text" },
          { key: "allergies", label: "Allergies / oil sensitivities", type: "text", placeholder: "e.g. nut oils, lavender, latex" },
          { key: "pregnant", label: "Pregnant", type: "bool" },
          { key: "clearance", label: "Physician clearance on file", type: "bool" },
          { key: "consent", label: "Intake & consent signed", type: "bool" },
          { key: "preferences", label: "Preferences", type: "textarea", placeholder: "Music, talk or quiet, table warmer, draping, room temperature" },
          { key: "emergency_contact", label: "Emergency contact", type: "text" },
          { key: "referral", label: "Found you through", type: "select", options: ["Referral", "Google", "Instagram", "Booking app", "Gift certificate", "Walk-in", "Other"] },
        ],
        computed: [{ key: "days_since_update", label: "Days since update", format: "number", fn: intakeAge }],
      },
      {
        key: "packages",
        label: "Packages & memberships",
        singular: "Package",
        titleField: "name",
        dateField: "sold_on",
        statusField: "status",
        sort: { field: "sold_on", dir: "desc" },
        fields: [
          { key: "name", label: "Package", type: "text", required: true, placeholder: "e.g. 5 x 60-min deep tissue" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "kind", label: "Type", type: "select", options: ["Session package", "Monthly membership", "Gift certificate"], default: "Session package" },
          { key: "sold_on", label: "Sold / charged on", type: "date", required: true },
          { key: "amount_paid", label: "Amount paid", type: "money", required: true, list: true, help: "For memberships, add one row per monthly charge" },
          { key: "card_fee", label: "Processing fee", type: "money" },
          { key: "sessions_bought", label: "Sessions included", type: "number" },
          { key: "sessions_used", label: "Sessions used", type: "number", default: 0 },
          { key: "expires", label: "Expires", type: "date", help: "Federal and state rules limit how soon gift certificates can expire" },
          { key: "purchased_by", label: "Purchased by (gift)", type: "text" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Used up", "Expired", "Refunded"], default: "Active" },
        ],
        computed: [
          { key: "remaining", label: "Sessions left", format: "number", fn: (d) => (num(d.sessions_bought) ? pkgRemaining(d) : null) },
          { key: "per_session", label: "Value / session", format: "money", fn: (d) => ratio(num(d.amount_paid), num(d.sessions_bought)) },
          {
            key: "unredeemed",
            label: "Unredeemed value",
            format: "money",
            fn: (d) => (is("status", "Active")(d) && num(d.sessions_bought) ? (pkgRemaining(d) * num(d.amount_paid)) / num(d.sessions_bought) : null),
          },
        ],
        income: (d) => (is("status", "Refunded")(d) ? 0 : num(d.amount_paid)),
        expense: (d) => num(d.card_fee),
      },
      expenses("e.g. oils, linens, table, liability insurance", [
        "Oils / lotions / linens",
        "Laundry",
        "Table / equipment",
        "Room or suite rent",
        "Liability insurance",
        "License / CE courses",
        "Booking software",
        "Marketing",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Revenue YTD", format: "money", value: (c) => c.incomeYtd, hint: "Sessions, tips and package sales" },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      { label: "Sessions this month", format: "number", value: (c) => count(c.month("sessions"), is("status", "Completed")) },
      { label: "Prepaid sessions owed", format: "number", value: (c) => sum(c.all("packages").filter(is("status", "Active")), pkgRemaining), hint: "Unused sessions on active packages" },
      {
        label: "Intakes to update",
        format: "number",
        value: (c) => count(c.all("intake"), (d) => {
          const age = intakeAge(d);
          return age === null || age > 365;
        }),
        hint: "Older than a year or never dated",
      },
    ],
    checklist: {
      label: "Practice checklist",
      items: [
        "Get and keep your state massage license (most states require one, often through the MBLEx exam) and check local business or establishment permits",
        "Carry professional and general liability insurance (ABMP and AMTA memberships include coverage)",
        "Have every client sign an intake and consent form, and recheck health flags before each session",
        "Write SOAP notes after every session and keep client records confidential and secure",
        "Track continuing education hours for your license renewal",
        "Log tips with each session: they're taxable income",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [
      { kind: "link", label: "MassageBook", url: "https://www.massagebook.com", note: "Booking, intake forms and SOAP notes built for LMTs" },
      { kind: "link", label: "Vagaro", url: "https://www.vagaro.com" },
      { kind: "link", label: "Square Appointments", url: "https://squareup.com/us/en/appointments" },
    ],
    resources: [
      { label: "FSMTB (MBLEx and state boards)", url: "https://www.fsmtb.org" },
      { label: "ABMP", url: "https://www.abmp.com" },
      { label: "AMTA", url: "https://www.amtamassage.org" },
      IRS_ESTIMATED,
    ],
  },
  {
    categories: ["Pet Sitting / Dog Walking"],
    tagline: "Every pet's feeding, meds, vet and quirks, visit reports, keys you hold, and what Rover or Wag really kept.",
    usesClients: true,
    clientLabel: "Pet parents",
    jobsBoard: false,
    schedule: { label: "Walks & visits" },
    collections: [
      {
        key: "visits",
        label: "Visits & walks",
        singular: "Visit",
        titleField: "date",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "pet", label: "Pet", type: "ref", ref: "pets", list: true, help: "Main pet; mention others in the report" },
          { key: "client", label: "Pet parent", type: "client" },
          {
            key: "service",
            label: "Service",
            type: "select",
            list: true,
            options: ["30-min walk", "60-min walk", "Group walk", "Drop-in visit", "Overnight / house sitting", "Boarding (my home)", "Doggy day care", "Pet taxi", "Other"],
          },
          { key: "minutes", label: "Time on site", type: "number", unit: "min" },
          { key: "units", label: "Walks / visits / nights", type: "number", default: 1, help: "How many units this row covers at the rate, e.g. 5 nights" },
          { key: "rate", label: "Rate (per unit)", type: "money", required: true },
          { key: "addons", label: "Extra pet / holiday / add-ons", type: "money" },
          { key: "tip", label: "Tip", type: "money" },
          { key: "platform", label: "Booked via", type: "select", options: ["Direct", "Rover", "Wag", "Other app"], default: "Direct" },
          {
            key: "platform_fee_pct",
            label: "App service fee",
            type: "percent",
            default: 0,
            help: "The share the app keeps from your booking (check your Rover or Wag earnings page; tips usually aren't charged). 0 for direct clients.",
          },
          { key: "miles", label: "Miles driven", type: "number", unit: "mi" },
          { key: "fed", label: "Fed", type: "bool" },
          { key: "water", label: "Fresh water", type: "bool" },
          { key: "pee", label: "Pee", type: "bool" },
          { key: "poop", label: "Poop", type: "bool" },
          { key: "meds_given", label: "Meds given", type: "bool" },
          { key: "photos_sent", label: "Photo update sent", type: "bool" },
          { key: "report", label: "Visit report", type: "textarea", placeholder: "Mood, appetite, anything unusual, doors and lights you secured on the way out" },
          { key: "status", label: "Status", type: "select", options: ["Booked", "Completed", "Paid", "Canceled"], default: "Completed" },
        ],
        computed: [
          { key: "gross", label: "Gross", format: "money", fn: visitGross },
          { key: "app_fee", label: "App fee", format: "money", fn: (d) => visitFee(d) || null },
          { key: "take_home", label: "Take-home", format: "money", fn: (d) => visitGross(d) - visitFee(d) - mileage(d) },
        ],
        // Report the gross (what the app's 1099 shows) and deduct the app's cut.
        income: (d) => (visitLive(d) ? visitGross(d) : 0),
        expense: (d) => (visitLive(d) ? visitFee(d) + mileage(d) : 0),
      },
      {
        key: "pets",
        label: "Pets",
        singular: "Pet",
        titleField: "name",
        sort: { field: "name", dir: "asc" },
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "owner", label: "Pet parent", type: "client", list: true },
          { key: "species", label: "Species", type: "select", list: true, options: ["Dog", "Cat", "Bird", "Rabbit", "Small animal", "Reptile", "Fish", "Horse", "Other"], default: "Dog" },
          { key: "breed", label: "Breed", type: "text" },
          { key: "age", label: "Age", type: "number", unit: "yrs" },
          { key: "weight", label: "Weight", type: "number", unit: "lb" },
          { key: "sex", label: "Sex", type: "select", options: ["Male, neutered", "Male, intact", "Female, spayed", "Female, intact"] },
          { key: "feeding", label: "Feeding", type: "textarea", placeholder: "Food, amount, times, treats allowed" },
          { key: "meds", label: "Medications", type: "textarea", placeholder: "Name, dose, time, how to give it (pill pocket, in food)" },
          { key: "vet", label: "Vet clinic & phone", type: "text" },
          { key: "emergency_vet", label: "24-hour emergency vet", type: "text" },
          { key: "vet_authorized", label: "Vet authorization signed", type: "bool", help: "Lets you approve treatment up to an agreed amount if the owner can't be reached" },
          { key: "vaccines", label: "Vaccines current (rabies etc.)", type: "bool" },
          { key: "microchip", label: "Microchip #", type: "text" },
          { key: "behavior", label: "Behavior notes", type: "textarea", placeholder: "Leash pulling, reactive to dogs or people, escape artist, resource guarding, fears" },
          { key: "good_with_dogs", label: "Good with other dogs", type: "select", options: ["Yes", "Selective", "No"] },
          { key: "gear", label: "Leash / harness / bags", type: "text", placeholder: "Where the gear lives, harness fit notes" },
          { key: "access", label: "Home access", type: "select", options: ["Lockbox", "Key (see Keys & access)", "Door / garage code", "Smart lock", "Owner home", "Concierge"] },
          { key: "house_notes", label: "House notes", type: "textarea", placeholder: "Alarm, doors that stay shut, mail, plants, trash day, Wi-Fi" },
        ],
      },
      {
        key: "keys",
        label: "Keys & access",
        singular: "Key",
        titleField: "tag",
        statusField: "status",
        sort: { field: "received", dir: "desc" },
        fields: [
          { key: "tag", label: "Key tag", type: "text", required: true, placeholder: "e.g. K-07", help: "Label keys with a code, never the client's name or address" },
          { key: "client", label: "Pet parent", type: "client", list: true },
          { key: "kind", label: "Type", type: "select", options: ["House key", "Lockbox", "Garage remote", "Building fob", "Smart-lock access"], default: "House key" },
          { key: "received", label: "Received", type: "date" },
          { key: "returned", label: "Returned", type: "date" },
          { key: "where", label: "Stored where", type: "text" },
          { key: "status", label: "Status", type: "select", options: ["Holding", "In lockbox", "Returned", "Lost"], default: "Holding" },
          { key: "notes", label: "Notes", type: "text" },
        ],
      },
      expenses("e.g. poop bags, treats, leash, insurance", [
        "Supplies (bags, treats, leashes)",
        "Insurance & bonding",
        "Background check",
        "Pet first aid course",
        "App / software",
        "Phone (business share)",
        "Marketing",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd, hint: "Gross, before app fees" },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After app fees, mileage and expenses" },
      { label: "Visits & walks this month", format: "number", value: (c) => sum(c.month("visits").filter(visitLive), (d) => num(d.units) || 1) },
      { label: "App fees YTD", format: "money", value: (c) => sum(c.ytd("visits").filter(visitLive), visitFee), hint: "What Rover / Wag kept (deducted on Taxes)" },
      { label: "Keys you're holding", format: "number", value: (c) => count(c.all("keys"), is("status", "Holding", "In lockbox")) },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get pet-sitting liability insurance and a bond; app protection programs don't replace your own policy",
        "Take a pet first aid and CPR course (the Red Cross offers one online)",
        "Do a meet-and-greet before the first booking: collect vet info, vaccine records and a signed vet authorization",
        "Use a written service agreement covering rates, cancellations, key handling and emergencies",
        "Check your city's rules: some require a business license, a dog-walker permit, or limit dogs per walk",
        "Tag keys with a code (never the address) and log them in Keys & access",
        "Report all earnings even without a 1099 from Rover or Wag, then deduct their fees, your miles and supplies",
      ],
    },
    integrations: [
      { kind: "link", label: "Rover", url: "https://www.rover.com", note: "Copy each booking's payout and service fee here" },
      { kind: "link", label: "Wag", url: "https://wagwalking.com" },
      { kind: "link", label: "Time To Pet", url: "https://www.timetopet.com", note: "Scheduling and client portal for direct clients" },
    ],
    resources: [
      { label: "Pet Sitters International", url: "https://www.petsit.com" },
      { label: "NAPPS (National Association of Professional Pet Sitters)", url: "https://petsitters.org" },
      RED_CROSS,
      IRS_MILEAGE,
    ],
  },
  {
    categories: ["Senior / Elder Care"],
    tagline: "Care plans with ADLs, meds and contacts, visit logs that families can trust, incident reports and mileage.",
    usesClients: true,
    clientLabel: "Families",
    jobsBoard: false,
    schedule: { label: "Care visits" },
    collections: [
      {
        key: "visits",
        label: "Care visits",
        singular: "Visit",
        titleField: "start",
        dateField: "start",
        statusField: "status",
        sort: { field: "start", dir: "desc" },
        fields: [
          { key: "start", label: "Start", type: "datetime", required: true },
          { key: "end", label: "End", type: "datetime", required: true },
          { key: "care_plan", label: "Care recipient", type: "ref", ref: "care_plans", list: true },
          { key: "client", label: "Billed to", type: "client" },
          {
            key: "visit_type",
            label: "Visit type",
            type: "select",
            options: ["Companionship", "Personal care", "Respite", "Overnight", "Live-in day", "Transportation / errands", "Hospital / rehab sit"],
          },
          { key: "hourly_rate", label: "Hourly rate", type: "money" },
          { key: "flat_rate", label: "Flat rate (overnight / live-in)", type: "money", help: "Leave blank to bill hours x hourly rate" },
          { key: "did_bathing", label: "Bathing", type: "bool" },
          { key: "did_dressing", label: "Dressing / grooming", type: "bool" },
          { key: "did_toileting", label: "Toileting / continence care", type: "bool" },
          { key: "did_transfer", label: "Transfers / walking", type: "bool" },
          { key: "did_meals", label: "Meals / feeding", type: "bool" },
          { key: "did_meds", label: "Medication reminder", type: "bool" },
          { key: "did_housekeeping", label: "Light housekeeping / laundry", type: "bool" },
          { key: "did_errands", label: "Errands / appointments", type: "bool" },
          { key: "mood", label: "Mood", type: "select", options: ["Good", "Okay", "Low", "Agitated", "Confused"] },
          { key: "appetite", label: "Appetite", type: "select", options: ["Normal", "Ate a little", "Didn't eat"] },
          { key: "concern", label: "Change to report", type: "bool", help: "Falls, new confusion, not eating, new pain, skin issues: tell the family the same day" },
          { key: "miles", label: "Miles (errands, appointments)", type: "number", unit: "mi" },
          { key: "notes", label: "Visit notes", type: "textarea" },
          { key: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Paid", "Canceled"], default: "Completed" },
        ],
        computed: [
          { key: "hours", label: "Hours", format: "hours", fn: (d) => careHours(d) || null },
          { key: "pay", label: "Pay", format: "money", fn: (d) => (careLive(d) ? carePay(d) : 0) },
          { key: "mileage", label: "Mileage deduction", format: "money", fn: (d) => (num(d.miles) ? mileage(d) : null), list: false },
        ],
        income: (d) => (careLive(d) ? carePay(d) : 0),
        expense: (d) => (careLive(d) ? mileage(d) : 0),
      },
      {
        key: "care_plans",
        label: "Care plans",
        singular: "Care plan",
        titleField: "recipient",
        statusField: "status",
        sort: { field: "recipient", dir: "asc" },
        fields: [
          { key: "recipient", label: "Care recipient", type: "text", required: true },
          { key: "client", label: "Family contact / payer", type: "client", list: true },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused (hospital / rehab)", "Ended"], default: "Active" },
          { key: "schedule", label: "Visit schedule", type: "text", list: true, placeholder: "e.g. Mon / Wed / Fri 9am-1pm" },
          { key: "hourly_rate", label: "Agreed hourly rate", type: "money" },
          { key: "help_bathing", label: "Needs help: bathing", type: "bool" },
          { key: "help_dressing", label: "Needs help: dressing", type: "bool" },
          { key: "help_toileting", label: "Needs help: toileting / continence", type: "bool" },
          { key: "help_transfer", label: "Needs help: transfers / walking", type: "bool" },
          { key: "help_eating", label: "Needs help: eating", type: "bool" },
          { key: "mobility", label: "Mobility", type: "select", options: ["Independent", "Cane", "Walker", "Wheelchair", "Bed-bound"] },
          { key: "fall_risk", label: "Fall risk", type: "bool" },
          {
            key: "meds_schedule",
            label: "Medication schedule",
            type: "textarea",
            help: "Name, dose and time. Non-medical caregivers are often limited to reminders; check your state's rules before handling medications.",
          },
          { key: "diet", label: "Diet, allergies & swallowing notes", type: "textarea" },
          { key: "memory", label: "Memory / cognition", type: "select", options: ["No concerns", "Some forgetfulness", "Dementia diagnosis", "Other"] },
          { key: "physician", label: "Physician & phone", type: "text" },
          { key: "pharmacy", label: "Pharmacy & phone", type: "text" },
          { key: "emergency_contact", label: "Emergency contact (name & phone)", type: "text" },
          { key: "directive", label: "Know where advance directive / DNR is kept", type: "bool", help: "EMS may ask for it in an emergency" },
          { key: "routine", label: "Daily routine & preferences", type: "textarea", placeholder: "Wake time, favorite meals, shows, topics they enjoy, what upsets them" },
          { key: "reviewed_on", label: "Plan last reviewed", type: "date" },
        ],
        computed: [
          {
            key: "adl_count",
            label: "ADLs needing help",
            format: "number",
            fn: (d) => ["help_bathing", "help_dressing", "help_toileting", "help_transfer", "help_eating"].filter((k) => d[k] === true).length,
          },
        ],
      },
      {
        key: "incidents",
        label: "Incident reports",
        singular: "Incident",
        titleField: "summary",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "summary", label: "What happened", type: "text", required: true, placeholder: "e.g. Slipped in bathroom, no visible injury" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "care_plan", label: "Care recipient", type: "ref", ref: "care_plans", list: true },
          {
            key: "kind",
            label: "Type",
            type: "select",
            list: true,
            options: ["Fall", "Injury", "Medication issue", "Confusion / wandering", "Refused care", "ER / hospital visit", "Property damage", "Other"],
          },
          { key: "details", label: "Details", type: "textarea", help: "Facts only: time, what you saw, what you did" },
          { key: "action", label: "Action taken", type: "textarea" },
          { key: "family_notified", label: "Family notified", type: "bool" },
          { key: "followup", label: "Needs follow-up", type: "bool" },
        ],
      },
      expenses("e.g. gloves, CPR renewal, liability insurance", [
        "Gloves / PPE / supplies",
        "CPR / first aid / training",
        "Background check",
        "Liability insurance",
        "Phone (business share)",
        "Marketing",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After mileage and expenses" },
      { label: "Care hours this month", format: "hours", value: (c) => sum(c.month("visits").filter(careLive), careHours) },
      { label: "Active clients", format: "number", value: (c) => count(c.all("care_plans"), is("status", "Active")) },
      { label: "Incidents this month", format: "number", value: (c) => count(c.month("incidents")), hint: "Falls, ER visits and other logged incidents" },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get CPR and first aid certified (Red Cross or American Heart Association)",
        "Get a background check and keep a copy for families; some states require one or a caregiver registry listing",
        "Check your state's home care rules: some license or register independent caregivers, and many limit non-medical aides to medication reminders",
        "Carry general and professional liability insurance; don't rely on the family's homeowner's policy",
        "Working regularly for one family? You may be their household employee (W-2 and nanny tax, see IRS Publication 926), not self-employed",
        "Log every visit and report changes in condition (falls, confusion, appetite) to the family the same day",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [{ kind: "link", label: "Care.com", url: "https://www.care.com", note: "Senior care profile, reviews and family messages" }],
    resources: [
      { label: "Eldercare Locator", url: "https://eldercare.acl.gov", note: "Local aging services to point families to" },
      { label: "Family Caregiver Alliance", url: "https://www.caregiver.org" },
      { label: "Alzheimer's Association", url: "https://www.alz.org" },
      IRS_PUB_926,
      IRS_MILEAGE,
    ],
  },

  // ======================= Education & Coaching =======================
  {
    categories: ["Academic Tutor"],
    tagline: "Students with goals and accommodations, lessons with homework and progress, and grades that show it's working.",
    usesClients: true,
    clientLabel: "Students / parents",
    jobsBoard: false,
    schedule: { label: "Lessons" },
    collections: [
      {
        key: "lessons",
        label: "Lessons",
        singular: "Lesson",
        titleField: "date",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "student", label: "Student", type: "ref", ref: "students", list: true },
          { key: "subject", label: "Subject", type: "text" },
          { key: "topic", label: "Topic covered", type: "text", list: true, placeholder: "e.g. Solving two-step equations" },
          { key: "minutes", label: "Length", type: "number", unit: "min", default: 60 },
          { key: "rate", label: "Hourly rate", type: "money", required: true },
          { key: "mode", label: "Mode", type: "select", options: ["In person", "Online"] },
          { key: "platform", label: "Booked via", type: "select", options: ["Direct", "Wyzant", "Varsity Tutors", "Outschool", "Other"], default: "Direct" },
          {
            key: "platform_fee_pct",
            label: "Platform fee",
            type: "percent",
            default: 0,
            help: "The share the platform keeps (check your tutor account). 0 for direct students, or if a company pays you a set hourly rate.",
          },
          { key: "miles", label: "Miles driven", type: "number", unit: "mi" },
          { key: "prev_homework", label: "Last homework", type: "select", options: ["Done", "Partly done", "Not done", "None assigned"] },
          { key: "understanding", label: "Understanding (1-5)", type: "rating", help: "Your read on how well they've got today's topic" },
          { key: "check_score", label: "Quiz / exit-ticket score", type: "percent" },
          { key: "homework", label: "Homework assigned", type: "textarea" },
          { key: "parent_note", label: "Note to parent", type: "textarea" },
          { key: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Paid", "No-show (billed)", "Canceled"], default: "Completed" },
        ],
        computed: [
          { key: "earned", label: "Earned", format: "money", fn: (d) => (lessonBilled(d) ? lessonGross(d) : 0) },
          { key: "take_home", label: "Take-home", format: "money", fn: (d) => (lessonBilled(d) ? lessonGross(d) - lessonFee(d) - mileage(d) : 0), list: false },
        ],
        income: (d) => (lessonBilled(d) ? lessonGross(d) : 0),
        expense: (d) => (lessonBilled(d) ? lessonFee(d) + mileage(d) : 0),
      },
      {
        key: "students",
        label: "Students",
        singular: "Student",
        titleField: "name",
        statusField: "status",
        sort: { field: "name", dir: "asc" },
        fields: [
          { key: "name", label: "Student", type: "text", required: true },
          { key: "client", label: "Parent / payer", type: "client" },
          { key: "grade", label: "Grade", type: "select", options: GRADES, list: true },
          { key: "subjects", label: "Subjects", type: "text", list: true, placeholder: "e.g. Algebra 1, Chemistry" },
          { key: "school", label: "School", type: "text" },
          { key: "goals", label: "Goals", type: "textarea", placeholder: "e.g. Get from a C to a B in Algebra 1 by the semester final" },
          { key: "accommodations", label: "Learning notes / accommodations", type: "textarea", help: "IEP or 504 accommodations, what works, what doesn't" },
          { key: "rate", label: "Hourly rate", type: "money" },
          { key: "format", label: "Format", type: "select", options: ["In person", "Online", "Both"] },
          { key: "start_date", label: "Started", type: "date" },
          { key: "baseline_pct", label: "Starting grade", type: "percent", help: "Class grade % when you started" },
          { key: "current_pct", label: "Current grade", type: "percent" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "Finished"], default: "Active" },
        ],
        computed: [
          {
            key: "grade_change",
            label: "Grade change",
            format: "percent",
            fn: (d) => (has(d.baseline_pct) && has(d.current_pct) ? (num(d.current_pct) - num(d.baseline_pct)) / 100 : null),
          },
        ],
      },
      {
        key: "progress",
        label: "Grades & tests",
        singular: "Result",
        titleField: "title",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "title", label: "Assessment", type: "text", required: true, placeholder: "e.g. Unit 3 test, Q2 report card, fall diagnostic" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "student", label: "Student", type: "ref", ref: "students", list: true },
          { key: "kind", label: "Type", type: "select", options: ["Class test / quiz", "Report card", "Diagnostic", "Standardized test", "Practice set"] },
          { key: "subject", label: "Subject", type: "text" },
          { key: "score", label: "Score", type: "number" },
          { key: "max_score", label: "Out of", type: "number", default: 100 },
          { key: "notes", label: "What went well / what to work on", type: "textarea" },
        ],
        computed: [{ key: "pct", label: "Score %", format: "percent", fn: (d) => (has(d.score) ? ratio(num(d.score), num(d.max_score)) : null) }],
      },
      expenses("e.g. workbooks, Zoom, whiteboard", [
        "Books / workbooks",
        "Software / subscriptions",
        "Whiteboard / supplies",
        "Background check",
        "Platform membership",
        "Marketing",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd, hint: "After platform fees, mileage and expenses" },
      { label: "Tutoring hours this month", format: "hours", value: (c) => sum(c.month("lessons").filter(lessonBilled), lessonHours) },
      { label: "Active students", format: "number", value: (c) => count(c.all("students"), is("status", "Active")) },
      {
        label: "Avg. grade change",
        format: "percent",
        value: (c) =>
          avg(
            c.all("students").filter((d) => is("status", "Active", "Finished")(d) && has(d.baseline_pct) && has(d.current_pct)),
            (d) => (num(d.current_pct) - num(d.baseline_pct)) / 100,
          ),
        hint: "Starting vs. current class grade, in points",
      },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Get a background check: many families ask for one, and schools and tutoring companies often require it",
        "Put your policies in writing: rates, packages, and a 24-hour cancellation / no-show fee",
        "Run a short diagnostic in the first session and record each student's starting grade",
        "Send parents a short progress note after each lesson",
        "Ask about IEP or 504 accommodations and keep learning notes private",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [
      { kind: "link", label: "Wyzant", url: "https://www.wyzant.com" },
      { kind: "link", label: "Varsity Tutors", url: "https://www.varsitytutors.com" },
      { kind: "link", label: "Outschool", url: "https://outschool.com", note: "Small-group online classes" },
    ],
    resources: [{ label: "Khan Academy (free practice to assign)", url: "https://www.khanacademy.org" }, IRS_ESTIMATED, IRS_SELF_EMPLOYED],
  },
  {
    categories: ["Life / Business Coach"],
    tagline: "Client goals with measurable progress, session notes and commitments, packages, and your discovery-call close rate.",
    usesClients: true,
    clientLabel: "Coaching clients",
    jobsBoard: false,
    schedule: { label: "Coaching sessions" },
    collections: [
      {
        key: "sessions",
        label: "Sessions",
        singular: "Session",
        titleField: "date",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "goal", label: "Main goal", type: "ref", ref: "goals" },
          { key: "package", label: "Package", type: "ref", ref: "packages" },
          {
            key: "session_type",
            label: "Type",
            type: "select",
            options: ["Coaching session", "Discovery call", "Intensive / VIP day", "Group coaching", "Workshop / talk", "Check-in"],
            default: "Coaching session",
          },
          { key: "minutes", label: "Length", type: "number", unit: "min", default: 60 },
          { key: "fee", label: "Fee", type: "money", list: true, help: "Leave 0 when the session comes out of a package (the package is counted when paid)" },
          { key: "processing_fee", label: "Payment processing fee", type: "money" },
          { key: "followed_through", label: "Did last commitments", type: "select", options: ["Yes", "Partly", "No", "First session"] },
          { key: "wins", label: "Wins since last session", type: "textarea" },
          { key: "focus", label: "Session focus", type: "textarea" },
          { key: "insights", label: "Insights / breakthroughs", type: "textarea" },
          { key: "commitments", label: "Client commitments", type: "textarea", help: "Action items the client agreed to before the next session" },
          { key: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "No-show", "Canceled"], default: "Completed" },
        ],
        computed: [{ key: "per_hour", label: "$ / hour", format: "money", fn: (d) => (num(d.fee) ? ratio(num(d.fee), num(d.minutes) / 60) : null) }],
        income: (d) => (is("status", "Scheduled", "Canceled")(d) ? 0 : num(d.fee)),
        expense: (d) => num(d.processing_fee),
      },
      {
        key: "goals",
        label: "Client goals",
        singular: "Goal",
        titleField: "goal",
        statusField: "status",
        sort: { field: "target_date", dir: "asc" },
        fields: [
          { key: "goal", label: "Goal", type: "text", required: true, placeholder: "e.g. Grow consulting revenue to $15k / month" },
          { key: "client", label: "Client", type: "client", list: true },
          {
            key: "area",
            label: "Area",
            type: "select",
            options: ["Career", "Business growth", "Leadership", "Productivity", "Health & habits", "Relationships", "Money", "Life transition", "Other"],
          },
          { key: "why", label: "Why it matters", type: "textarea" },
          { key: "metric", label: "Measured by", type: "text", placeholder: "e.g. monthly revenue, sales calls / week, workouts / week" },
          { key: "baseline", label: "Starting value", type: "number" },
          { key: "target", label: "Target value", type: "number" },
          { key: "current", label: "Current value", type: "number" },
          { key: "set_on", label: "Set on", type: "date" },
          { key: "target_date", label: "Target date", type: "date" },
          { key: "obstacles", label: "Obstacles / limiting beliefs", type: "textarea" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Achieved", "Paused", "Dropped"], default: "Active" },
        ],
        computed: [
          {
            key: "progress",
            label: "Progress",
            format: "percent",
            fn: (d) => (has(d.baseline) && has(d.target) && has(d.current) ? ratio(num(d.current) - num(d.baseline), num(d.target) - num(d.baseline)) : null),
          },
          { key: "days_left", label: "Days left", format: "number", fn: (d) => daysUntil(d.target_date) },
        ],
      },
      {
        key: "packages",
        label: "Packages",
        singular: "Package",
        titleField: "name",
        dateField: "sold_on",
        statusField: "status",
        sort: { field: "sold_on", dir: "desc" },
        fields: [
          { key: "name", label: "Package / program", type: "text", required: true, placeholder: "e.g. 3-month leadership program (12 sessions)" },
          { key: "client", label: "Client", type: "client", list: true },
          { key: "sold_on", label: "Paid on", type: "date", required: true },
          { key: "price", label: "Program price", type: "money" },
          {
            key: "collected",
            label: "Collected so far",
            type: "money",
            required: true,
            list: true,
            help: "Update as installments arrive. Taxes count it on the Paid-on date, so start a new row for payments in a new year.",
          },
          { key: "processing_fee", label: "Processing fees", type: "money" },
          { key: "payment_plan", label: "Payment plan", type: "select", options: ["Paid in full", "Monthly installments", "Retainer"], default: "Paid in full" },
          { key: "sessions_bought", label: "Sessions included", type: "number" },
          { key: "sessions_used", label: "Sessions used", type: "number", default: 0 },
          { key: "ends_on", label: "Ends", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Completed", "Expired", "Refunded"], default: "Active" },
        ],
        computed: [
          { key: "balance", label: "Balance due", format: "money", fn: (d) => (num(d.price) ? Math.max(0, num(d.price) - num(d.collected)) : null) },
          { key: "sessions_left", label: "Sessions left", format: "number", fn: (d) => (num(d.sessions_bought) ? pkgRemaining(d) : null) },
          { key: "per_session", label: "Value / session", format: "money", fn: (d) => ratio(num(d.price) || num(d.collected), num(d.sessions_bought)), list: false },
        ],
        income: (d) => (is("status", "Refunded")(d) ? 0 : num(d.collected)),
        expense: (d) => num(d.processing_fee),
      },
      {
        key: "leads",
        label: "Discovery calls",
        singular: "Discovery call",
        titleField: "name",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "name", label: "Prospect", type: "text", required: true },
          { key: "date", label: "Call date", type: "date", required: true },
          { key: "source", label: "Source", type: "select", options: ["Referral", "LinkedIn", "Instagram", "Podcast / speaking", "Website / SEO", "Newsletter", "Other"], list: true },
          { key: "need", label: "What they want help with", type: "textarea" },
          { key: "offer", label: "Offer proposed", type: "text" },
          { key: "value", label: "Potential value", type: "money", list: true },
          { key: "follow_up", label: "Follow up on", type: "date" },
          { key: "status", label: "Status", type: "select", options: ["Booked", "Held", "Proposal sent", "Signed", "Not a fit", "No-show"], default: "Booked" },
        ],
      },
      expenses("e.g. ICF credential, Zoom, scheduling app", [
        "Coach training / credential",
        "Mentor coaching / supervision",
        "Software (video, scheduling, CRM)",
        "Assessments / tools",
        "Insurance",
        "Marketing / ads",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Revenue YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      {
        label: "Sessions this month",
        format: "number",
        value: (c) => count(c.month("sessions"), (d) => is("status", "Completed")(d) && !is("session_type", "Discovery call")(d)),
      },
      { label: "Prepaid sessions owed", format: "number", value: (c) => sum(c.all("packages").filter(is("status", "Active")), pkgRemaining), hint: "Unused sessions on active packages" },
      {
        label: "Discovery close rate YTD",
        format: "percent",
        value: (c) => ratio(count(c.ytd("leads"), is("status", "Signed")), count(c.ytd("leads"), is("status", "Held", "Proposal sent", "Signed", "Not a fit"))),
        hint: "Signed / calls held",
      },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Coaching is largely unregulated, so credentials build trust: consider an ICF credential (ACC, PCC or MCC)",
        "Use a signed coaching agreement covering scope, confidentiality, cancellations, refunds and payment plans",
        "Make clear that coaching isn't therapy or medical, legal or financial advice, and refer out when a client needs a licensed professional",
        "Carry professional liability (errors and omissions) insurance",
        "Log every discovery call so you know your close rate and where clients come from",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [
      { kind: "link", label: "Calendly", url: "https://calendly.com", note: "Discovery-call and session booking" },
      { kind: "link", label: "Paperbell", url: "https://paperbell.com", note: "Packages, contracts and payments for coaches" },
      { kind: "link", label: "Zoom", url: "https://zoom.us" },
    ],
    resources: [{ label: "International Coaching Federation (ICF)", url: "https://coachingfederation.org" }, IRS_ESTIMATED, IRS_SELF_EMPLOYED],
  },
  {
    categories: ["Music Teacher / Tutor"],
    tagline: "Students by instrument and level, lesson notes, practice assignments, make-ups, recitals and tuition.",
    usesClients: true,
    clientLabel: "Students / parents",
    jobsBoard: false,
    schedule: { label: "Lessons" },
    collections: [
      {
        key: "lessons",
        label: "Lessons",
        singular: "Lesson",
        titleField: "date",
        dateField: "date",
        statusField: "attendance",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "student", label: "Student", type: "ref", ref: "students", list: true },
          { key: "minutes", label: "Length", type: "number", unit: "min", default: 30 },
          {
            key: "attendance",
            label: "Attendance",
            type: "select",
            options: ["Attended", "Make-up lesson", "No-show (billed)", "Student canceled (make-up owed)", "Student canceled (no make-up)", "Teacher canceled (make-up owed)"],
            default: "Attended",
          },
          { key: "location", label: "Location", type: "select", options: ["My studio", "Student's home", "Online", "Music school / store"] },
          { key: "worked_on", label: "Worked on", type: "textarea", placeholder: "Pieces, scales, technique, theory, sight-reading" },
          { key: "prepared", label: "Preparedness (1-5)", type: "rating", help: "How well they'd practiced since last week" },
          { key: "fee", label: "Charged for this lesson", type: "money", help: "Per-lesson students only. Monthly or semester tuition goes in Tuition & expenses." },
          { key: "miles", label: "Miles driven", type: "number", unit: "mi", help: "Driving to students' homes" },
          { key: "notes", label: "Notes for parent / next lesson", type: "textarea" },
        ],
        income: (d) => num(d.fee),
        expense: (d) => mileage(d),
      },
      {
        key: "students",
        label: "Students",
        singular: "Student",
        titleField: "name",
        statusField: "status",
        sort: { field: "name", dir: "asc" },
        fields: [
          { key: "name", label: "Student", type: "text", required: true },
          { key: "client", label: "Parent / payer", type: "client" },
          {
            key: "instrument",
            label: "Instrument",
            type: "select",
            list: true,
            options: ["Piano", "Guitar", "Bass", "Voice", "Violin", "Viola", "Cello", "Drums / percussion", "Ukulele", "Flute", "Clarinet", "Saxophone", "Trumpet", "Other"],
          },
          { key: "level", label: "Level", type: "select", list: true, options: ["Beginner", "Early intermediate", "Intermediate", "Late intermediate", "Advanced"], default: "Beginner" },
          { key: "age", label: "Age", type: "number", unit: "yrs" },
          { key: "method_book", label: "Current book / method", type: "text", placeholder: "e.g. Faber Piano Adventures 2A, Suzuki Violin Book 1" },
          { key: "repertoire", label: "Current pieces", type: "textarea" },
          {
            key: "exam_track",
            label: "Exam / program",
            type: "select",
            options: ["None", "RCM Certificate Program", "ABRSM", "Trinity College London", "Rockschool (RSL)", "MTNA / state association", "School auditions / All-State"],
            default: "None",
          },
          { key: "next_milestone", label: "Next exam / level", type: "text" },
          { key: "lesson_length", label: "Lesson length", type: "select", options: ["30 min", "45 min", "60 min"], default: "30 min" },
          { key: "rate", label: "Rate per lesson", type: "money" },
          { key: "billing", label: "Billing", type: "select", options: ["Per lesson", "Monthly tuition", "Semester tuition", "Package"], default: "Monthly tuition" },
          { key: "start_date", label: "Started", type: "date" },
          { key: "goals", label: "Goals", type: "textarea" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Paused", "Quit"], default: "Active" },
        ],
        computed: [{ key: "years", label: "Years studying", format: "number", fn: (d) => yearsSince(d.start_date) }],
      },
      {
        key: "practice",
        label: "Practice assignments",
        singular: "Assignment",
        titleField: "assignment",
        dateField: "assigned_on",
        statusField: "status",
        sort: { field: "assigned_on", dir: "desc" },
        fields: [
          { key: "assignment", label: "Assignment", type: "text", required: true, placeholder: "e.g. Minuet in G, hands together, bars 1-16 at 80 bpm" },
          { key: "student", label: "Student", type: "ref", ref: "students", list: true },
          { key: "assigned_on", label: "Assigned", type: "date", required: true },
          { key: "minutes_per_day", label: "Minutes / day", type: "number", unit: "min", default: 20 },
          { key: "days_goal", label: "Days goal", type: "number", unit: "days", default: 5 },
          { key: "days_done", label: "Days practiced", type: "number", unit: "days", help: "From the student's practice log or app" },
          { key: "tempo_goal", label: "Tempo goal", type: "number", unit: "bpm" },
          { key: "tempo_reached", label: "Tempo reached", type: "number", unit: "bpm" },
          { key: "status", label: "Status", type: "select", options: ["Assigned", "Checked: ready", "Checked: keep working"], default: "Assigned" },
        ],
        computed: [
          { key: "completion", label: "Practice done", format: "percent", fn: (d) => (has(d.days_done) ? ratio(num(d.days_done), num(d.days_goal)) : null) },
          { key: "minutes_total", label: "Minutes practiced", format: "number", fn: (d) => (has(d.days_done) ? num(d.days_done) * num(d.minutes_per_day) : null), list: false },
        ],
      },
      {
        key: "recitals",
        label: "Recitals & exams",
        singular: "Event",
        titleField: "event",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "event", label: "Event", type: "text", required: true, placeholder: "e.g. Spring studio recital" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "kind", label: "Type", type: "select", list: true, options: ["Studio recital", "Festival / adjudication", "Competition", "Graded exam", "Audition", "Community performance"] },
          { key: "venue", label: "Venue", type: "text" },
          { key: "students_count", label: "Students performing", type: "number" },
          { key: "program", label: "Program (student: piece)", type: "textarea" },
          { key: "fees_collected", label: "Fees collected", type: "money", help: "Recital or entry fees families paid you" },
          { key: "costs", label: "Costs", type: "money", help: "Venue, accompanist, programs, refreshments, entry fees you paid" },
          { key: "results", label: "Results / ratings", type: "textarea" },
          { key: "status", label: "Status", type: "select", options: ["Planning", "Registered", "Done"], default: "Planning" },
        ],
        computed: [{ key: "net", label: "Net", format: "money", fn: (d) => num(d.fees_collected) - num(d.costs) }],
        income: (d) => num(d.fees_collected),
        expense: (d) => num(d.costs),
      },
      {
        key: "tuition",
        label: "Tuition & expenses",
        singular: "Entry",
        titleField: "item",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "item", label: "Description", type: "text", required: true, placeholder: "e.g. October tuition - Maya, or sheet music" },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "kind", label: "Money", type: "select", options: ["Tuition received", "Expense"], default: "Tuition received", list: true },
          { key: "student", label: "Student", type: "ref", ref: "students" },
          {
            key: "category",
            label: "Category",
            type: "select",
            options: [
              "Monthly tuition",
              "Semester tuition",
              "Lesson package",
              "Registration fee",
              "Sheet music / books",
              "Instrument repair / tuning",
              "Studio rent",
              "Software / apps",
              "Professional dues / training",
              "Marketing",
              "Other",
            ],
          },
          { key: "amount", label: "Amount", type: "money", required: true, list: true },
          { key: "method", label: "Paid by", type: "select", options: ["Cash", "Check", "Venmo", "Zelle", "Card", "Studio software", "Other"] },
          { key: "processing_fee", label: "Processing fee", type: "money" },
        ],
        income: (d) => (is("kind", "Tuition received")(d) ? num(d.amount) : 0),
        expense: (d) => (is("kind", "Expense")(d) ? num(d.amount) : 0) + num(d.processing_fee),
      },
    ],
    kpis: [
      { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd, hint: "Tuition, lesson fees and recital fees" },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      { label: "Active students", format: "number", value: (c) => count(c.all("students"), is("status", "Active")) },
      {
        label: "Make-ups owed",
        format: "number",
        value: (c) => Math.max(0, count(c.all("lessons"), is("attendance", ...MAKEUP_OWED)) - count(c.all("lessons"), is("attendance", "Make-up lesson"))),
        hint: "Canceled lessons not yet made up",
      },
      {
        label: "Practice done this month",
        format: "percent",
        value: (c) => avg(c.month("practice").filter((d) => has(d.days_done) && num(d.days_goal) > 0), (d) => Math.min(1, num(d.days_done) / num(d.days_goal))),
        hint: "Days practiced vs. goal",
      },
    ],
    checklist: {
      label: "Studio checklist",
      items: [
        "Write a studio policy: tuition and due dates, make-up and cancellation rules, recital fees",
        "Teaching from home? Check local zoning or HOA rules and ask whether your home insurance covers students on site",
        "Consider a teacher liability policy; some music teacher associations offer member plans",
        "Get a background check if you teach minors; many schools and music stores require one",
        "Join a teachers association such as MTNA for certification (NCTM), festivals and student programs",
        "Keep receipts for sheet music, tuning, repairs and studio costs: they're deductible",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [
      { kind: "link", label: "My Music Staff", url: "https://www.mymusicstaff.com", note: "Studio scheduling, invoicing and parent portal" },
      { kind: "link", label: "Thumbtack", url: "https://www.thumbtack.com", note: "Get found by local students" },
    ],
    resources: [
      { label: "MTNA (Music Teachers National Association)", url: "https://www.mtna.org" },
      { label: "RCM Certificate Program", url: "https://www.rcmusic.com" },
      { label: "ABRSM", url: "https://www.abrsm.org" },
      { label: "IMSLP (free public-domain sheet music)", url: "https://imslp.org" },
    ],
  },
  {
    categories: ["Test Prep Coach"],
    tagline: "Each student's test, date and target score, practice tests by section, and sessions that close the gap.",
    usesClients: true,
    clientLabel: "Students / parents",
    jobsBoard: false,
    schedule: { label: "Prep sessions" },
    collections: [
      {
        key: "students",
        label: "Students",
        singular: "Student",
        titleField: "name",
        statusField: "status",
        sort: { field: "test_date", dir: "asc" },
        fields: [
          { key: "name", label: "Student", type: "text", required: true },
          { key: "client", label: "Parent / payer", type: "client" },
          { key: "test", label: "Target test", type: "select", options: TESTS, list: true },
          { key: "test_date", label: "Test date", type: "date", list: true },
          { key: "registered", label: "Registered for that date", type: "bool" },
          { key: "baseline", label: "Diagnostic score", type: "number", help: "Total / composite from the first full, timed practice test" },
          { key: "target", label: "Target score", type: "number", list: true },
          { key: "best", label: "Best recent score", type: "number", help: "Update after each full practice test" },
          { key: "official", label: "Official score", type: "number" },
          { key: "weak_areas", label: "Weak areas", type: "textarea" },
          { key: "accommodations", label: "Testing accommodations", type: "text", help: "e.g. extended time. Approval can take weeks, so apply early." },
          { key: "schools", label: "Target schools / programs", type: "text" },
          { key: "program", label: "Program", type: "select", options: ["Hourly", "Package", "Group class"] },
          { key: "rate", label: "Hourly rate", type: "money" },
          { key: "status", label: "Status", type: "select", options: ["Active", "Tested: waiting on scores", "Done", "Paused"], default: "Active" },
        ],
        computed: [
          { key: "gain", label: "Points gained", format: "number", fn: (d) => (has(d.baseline) && has(d.best) ? num(d.best) - num(d.baseline) : null) },
          { key: "to_target", label: "Points to target", format: "number", fn: (d) => (has(d.target) && has(d.best) ? Math.max(0, num(d.target) - num(d.best)) : null) },
          { key: "days_left", label: "Days to test", format: "number", fn: (d) => daysUntil(d.test_date) },
        ],
      },
      {
        key: "practice_tests",
        label: "Practice tests",
        singular: "Practice test",
        titleField: "date",
        dateField: "date",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "student", label: "Student", type: "ref", ref: "students", list: true },
          { key: "test", label: "Test", type: "select", options: TESTS, list: true },
          { key: "source", label: "Test / form", type: "text", placeholder: "e.g. Bluebook Practice Test 4, LSAT PrepTest 140" },
          { key: "official_material", label: "Official material", type: "bool" },
          { key: "conditions", label: "Conditions", type: "select", options: ["Full, timed", "Full, untimed", "Section only", "Real test (official score)"], default: "Full, timed" },
          { key: "s1", label: "Section 1", type: "number", help: "SAT / PSAT: Reading & Writing; ACT: English; GRE: Verbal; MCAT: Chem / Phys; LSAT: scaled score" },
          { key: "s2", label: "Section 2", type: "number", help: "SAT / PSAT: Math; ACT: Math; GRE: Quant; MCAT: CARS" },
          { key: "s3", label: "Section 3", type: "number", help: "ACT: Reading; GRE: Analytical Writing; MCAT: Bio / Biochem" },
          { key: "s4", label: "Section 4", type: "number", help: "ACT: Science (optional); MCAT: Psych / Soc" },
          { key: "total", label: "Total / composite", type: "number", help: "Leave blank for SAT, PSAT, ACT, GRE, MCAT and LSAT to calculate it from the sections" },
          { key: "errors", label: "Error log", type: "textarea", placeholder: "Missed questions by topic and why: content gap, careless, timing" },
        ],
        computed: [{ key: "score", label: "Score", format: "number", fn: practiceScore }],
      },
      {
        key: "sessions",
        label: "Sessions",
        singular: "Session",
        titleField: "date",
        dateField: "date",
        statusField: "status",
        sort: { field: "date", dir: "desc" },
        fields: [
          { key: "date", label: "Date", type: "date", required: true },
          { key: "student", label: "Student", type: "ref", ref: "students", list: true },
          { key: "focus", label: "Focus", type: "text", list: true, placeholder: "e.g. SAT Math: linear equations, timing drills" },
          { key: "minutes", label: "Length", type: "number", unit: "min", default: 60 },
          { key: "format", label: "Format", type: "select", options: ["1-on-1 online", "1-on-1 in person", "Small group", "Class"], default: "1-on-1 online" },
          { key: "students_count", label: "Students", type: "number", default: 1, help: "For groups, how many paid at the per-student rate" },
          { key: "rate", label: "Hourly rate (per student)", type: "money", required: true },
          { key: "platform", label: "Booked via", type: "select", options: ["Direct", "Wyzant", "Varsity Tutors", "Other"], default: "Direct" },
          { key: "platform_fee_pct", label: "Platform fee", type: "percent", default: 0, help: "The share the platform keeps (check your tutor account). 0 for direct students." },
          { key: "miles", label: "Miles driven", type: "number", unit: "mi" },
          { key: "homework", label: "Homework assigned", type: "textarea", placeholder: "e.g. 2 timed Reading sections + error log" },
          { key: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Paid", "No-show (billed)", "Canceled"], default: "Completed" },
        ],
        computed: [
          { key: "hours", label: "Hours", format: "hours", fn: (d) => lessonHours(d) || null, list: false },
          { key: "earned", label: "Earned", format: "money", fn: (d) => (lessonBilled(d) ? lessonGross(d) : 0) },
          { key: "take_home", label: "Take-home", format: "money", fn: (d) => (lessonBilled(d) ? lessonGross(d) - lessonFee(d) - mileage(d) : 0), list: false },
        ],
        income: (d) => (lessonBilled(d) ? lessonGross(d) : 0),
        expense: (d) => (lessonBilled(d) ? lessonFee(d) + mileage(d) : 0),
      },
      expenses("e.g. official prep books, question bank", [
        "Official prep books",
        "Question banks / software",
        "Practice test materials",
        "Video / whiteboard tools",
        "Platform membership",
        "Marketing / ads",
        "Other",
      ]),
    ],
    kpis: [
      { label: "Earnings YTD", format: "money", value: (c) => c.incomeYtd },
      { label: "Profit YTD", format: "money", value: (c) => c.incomeYtd - c.expenseYtd },
      {
        label: "Avg. progress to target",
        format: "percent",
        value: (c) =>
          avg(
            c.all("students").filter((d) => !is("status", "Paused")(d) && has(d.baseline) && has(d.best) && num(d.target) > num(d.baseline)),
            (d) => (num(d.best) - num(d.baseline)) / (num(d.target) - num(d.baseline)),
          ),
        hint: "Share of the diagnostic-to-target gap each student has closed",
      },
      { label: "Students at target", format: "number", value: (c) => count(c.all("students"), (d) => num(d.target) > 0 && num(d.best) >= num(d.target)) },
      {
        label: "Testing in next 30 days",
        format: "number",
        value: (c) =>
          count(c.all("students"), (d) => {
            const left = daysUntil(d.test_date);
            return left !== null && left <= 30;
          }),
      },
    ],
    checklist: {
      label: "Getting started",
      items: [
        "Start every student with a full, timed diagnostic and log it in Practice tests",
        "Use official practice material first: College Board Bluebook (SAT / PSAT), ACT, ETS (GRE), LSAC LawHub (LSAT), AAMC (MCAT)",
        "Check each student's registration deadline and score-release date for their test date",
        "Ask about testing accommodations early: College Board and ACT approvals can take several weeks",
        "Avoid guaranteed-score marketing unless you put a clear refund policy in writing",
        "Get a background check if you work with minors",
        TAX_SET_ASIDE,
      ],
    },
    integrations: [
      { kind: "link", label: "College Board Bluebook", url: "https://bluebook.collegeboard.org", note: "Official digital SAT / PSAT practice tests" },
      { kind: "link", label: "Wyzant", url: "https://www.wyzant.com" },
      { kind: "link", label: "Varsity Tutors", url: "https://www.varsitytutors.com" },
    ],
    resources: [
      { label: "SAT Suite (dates, scores)", url: "https://satsuite.collegeboard.org" },
      { label: "ACT", url: "https://www.act.org" },
      { label: "GRE (ETS)", url: "https://www.ets.org/gre.html" },
      { label: "LSAC (LSAT)", url: "https://www.lsac.org" },
      { label: "AAMC (MCAT)", url: "https://students-residents.aamc.org" },
      { label: "College Board accommodations (SSD)", url: "https://accommodations.collegeboard.org" },
    ],
  },
];
