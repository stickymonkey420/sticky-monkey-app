// Static content for the free-member Starter dashboard: Abu's daily money
// tips and the literacy-based learning path. Plain data, no API cost.

export const ABU_AVATAR_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a97f76bdc2bb83ea21e174f_abu-eyes-open-clean.png";

// One tip per day, rotating by day of year.
export const ABU_TIPS: string[] = [
  "Pay yourself first. Move savings out the day your paycheck lands, before you can spend it.",
  "An emergency fund isn't an investment. It's what keeps a flat tire from becoming credit card debt.",
  "Credit card interest is often 20%+ a year. Paying it off is a guaranteed return no stock can promise.",
  "Your credit score mostly comes down to two things: paying on time and using a small share of your limit.",
  "Ask what your coworkers earn. Pay secrecy mostly helps the people signing the checks.",
  "If an investment promises big returns with 'no risk', the risk is that it's a scam.",
  "Fees compound too. A 1% yearly fee can eat about a quarter of your retirement savings over 30 years.",
  "Getting a 401(k) match? Contributing enough to get it is an instant 50–100% return.",
  "Track one month of spending before making a budget. You can't fix what you haven't measured.",
  "Index funds let you own a slice of hundreds of companies without picking winners.",
  "Inflation is a quiet tax on cash. Money sitting at 0% loses buying power every year.",
  "Buy now, pay later is still debt. Count it like a credit card.",
  "Check your free credit reports at annualcreditreport.com. Errors are more common than you'd think.",
  "Lifestyle creep is real: when your pay goes up, save at least half of the raise.",
  "A Roth IRA is taxed now and grows tax-free. Great when you're in a lower tax bracket today.",
  "Don't invest money you'll need in the next few years. The market can be down for a long time.",
  "Rent vs buy isn't just the payment. Add taxes, insurance, repairs and the money you'd have invested.",
  "Side gig income? Set aside 25–30% for taxes so April doesn't hurt.",
  "Time in the market beats timing the market. Missing the best few days can halve your returns.",
  "Negotiate bills once a year: phone, internet, insurance. Ten minutes on the phone can save hundreds.",
  "Selling a covered call means agreeing to sell your shares at a set price in exchange for cash today.",
  "A cash-secured put pays you to wait for a stock at a lower price, if you'd be happy to own it.",
  "Diversify. Owning one stock means one bad headline can wreck your plan.",
  "Know your 'enough' number. Without one, there's always a reason to spend more.",
  "Minimum payments are designed to keep you in debt for years. Pay more than the minimum whenever you can.",
  "Payday loans can cost 300%+ a year. Almost any other option is cheaper.",
  "Talk about money with people you trust. Silence is how bad deals stay hidden.",
  "Automate it: savings, bills and investing on autopilot beat willpower every time.",
  "Your net worth is what you own minus what you owe. Track it monthly, not daily.",
  "Practice with fake money first. Fantasy Finance lets you make mistakes that cost nothing.",
];

export type LearningTopic = {
  title: string;
  summary: string;
  action?: { label: string; href: string };
};

export type LearningTier = {
  id: "foundations" | "building" | "growing";
  label: string;
  range: [number, number];
  blurb: string;
  topics: LearningTopic[];
};

export const LEARNING_TIERS: LearningTier[] = [
  {
    id: "foundations",
    label: "Foundations",
    range: [1, 3],
    blurb: "Get the basics solid: know where your money goes and build a safety net.",
    topics: [
      {
        title: "Where does my money go?",
        summary:
          "List every bill and track one month of spending. Most people find 2–3 'leaks', like forgotten subscriptions or delivery fees, that add up to real money.",
      },
      {
        title: "Your first emergency fund",
        summary:
          "Start with $500–$1,000 in a separate high-yield savings account, then grow it to 3 months of expenses. It's what keeps surprises from becoming debt.",
      },
      {
        title: "How credit actually works",
        summary:
          "Pay every bill on time and keep card balances under 30% of the limit. Those two habits drive most of your score, and a good score makes everything cheaper.",
      },
    ],
  },
  {
    id: "building",
    label: "Building",
    range: [4, 6],
    blurb: "Kill expensive debt and start investing for the long run.",
    topics: [
      {
        title: "Beat high-interest debt",
        summary:
          "Avalanche: pay the highest-rate debt first, which costs the least. Snowball: pay the smallest balance first, which builds momentum. Either beats minimum payments.",
      },
      {
        title: "Index funds 101",
        summary:
          "An index fund owns hundreds of companies at once for a tiny fee. It's how most people should start investing: no stock picking required.",
        action: { label: "Try it with practice money", href: "/game-a-fi-overview" },
      },
      {
        title: "401(k), IRA or Roth?",
        summary:
          "Grab any employer match first. Then a Roth IRA (taxed now, tax-free later) is often the next best step, especially early in your career.",
      },
    ],
  },
  {
    id: "growing",
    label: "Growing",
    range: [7, 10],
    blurb: "Put your money to work: allocation, income strategies and taxes.",
    topics: [
      {
        title: "Asset allocation",
        summary:
          "Your stock/bond/cash mix drives most of your long-term results. Pick a mix you can hold through a 30% drop without panic-selling.",
      },
      {
        title: "Generating income with options",
        summary:
          "Covered calls and cash-secured puts (the 'wheel') collect premium on stocks you're happy to own. Learn the risks with practice money before going live.",
        action: { label: "Practice in Fantasy Finance", href: "/game-a-fi-overview" },
      },
      {
        title: "Keep more of what you earn",
        summary:
          "Use tax-advantaged accounts, hold investments over a year for lower capital-gains rates, and harvest losses to offset gains.",
      },
    ],
  },
];

export function tierForLevel(level: number | null): LearningTier {
  if (level == null) return LEARNING_TIERS[0];
  return LEARNING_TIERS.find((t) => level >= t.range[0] && level <= t.range[1]) ?? LEARNING_TIERS[0];
}
