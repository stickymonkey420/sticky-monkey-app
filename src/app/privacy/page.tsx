import type { Metadata } from "next";
import LegalPage, { LEGAL, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Sticky Monkey Lifestyle" };

// Keep in sync with components/auth/AuthPromises.tsx (public commitments).
const SECTIONS: LegalSection[] = [
  {
    h: "Our promises",
    ul: [
      "We will never sell your data — not to advertisers, data brokers, or anyone else.",
      "No ads, ever, and no third-party marketing.",
      "No advertising or cross-site tracking cookies.",
      "Your financial, health and medical records are visible only to you. Other members can't browse or search for you; they can only connect with you if they already know your handle.",
    ],
  },
  {
    h: "Information we collect",
    p: ["Only what you give us or what is needed to run the service:"],
    ul: [
      "Account: email address, name, handle, password (stored hashed by our authentication provider), two-factor settings.",
      "Onboarding survey answers, such as your goals and financial-literacy self-rating.",
      "Financial information you enter or import: accounts, balances, holdings, options trades, income, W-2 and paystub figures, realized gains (for example from a CSV import), budgets and transactions.",
      "Linked accounts (paid plans only): if you connect a bank or brokerage through Plaid, we receive account names, balances, holdings and transactions. We never receive or store your bank login.",
      "Business and side-gig records you create: clients, jobs, appointments, income and expenses.",
      "Health information you enter: meals, food photos, exercise, weight, body-fat and body measurements, fasting sessions, goals and reminders.",
      "Medical follow-up records you enter: vaccines and dose dates, health checks and results, and clinics.",
      "Messages and screenshots you send to Abu, our in-app assistant.",
      "Technical data needed for security: IP address, browser and device type, sign-in times and error logs.",
    ],
  },
  {
    h: "How we use it",
    ul: [
      "To provide the features you use: dashboards, net worth, tax estimates, calorie tracking, reminders and Abu's answers.",
      "To keep accounts secure: sign-in, two-factor verification, bot protection and abuse prevention.",
      "To send service emails, such as sign-up confirmation and password resets, and — only if you opt in — Sticky Monkey news. You can unsubscribe at any time from any email.",
      "To fix bugs and improve the product, using your feedback and our error logs.",
    ],
  },
  {
    h: "Service providers we use",
    p: [
      "We share data only with the providers needed to run the service. They process it on our behalf and may not use it for their own purposes:",
    ],
    ul: [
      "Supabase — database, authentication and file storage (including food photos).",
      "Vercel — website hosting.",
      "Plaid — bank and brokerage linking, only if you choose to connect an account.",
      "Anthropic — AI processing for Abu and food-photo calorie estimates. Only the message, screenshot or photo you send is processed, under terms that don't allow it to be used to train their models.",
      "Resend — email delivery.",
      "Cloudflare Turnstile — bot protection on sign-up and sign-in.",
      "Finnhub — market prices. It receives ticker symbols only, never your personal information.",
    ],
  },
  {
    h: "Health and medical information",
    p: [
      "Sticky Monkey is a personal tracking tool. It is not a healthcare provider, and the information you enter is not covered by HIPAA. We protect it with the same per-account access controls as your financial data: only you can read it. We don't share it with insurers, employers or anyone else, and we never use it for advertising.",
    ],
  },
  {
    h: "Security",
    p: [
      "Data is encrypted in transit (HTTPS) and at rest by our hosting providers. Every database record is locked to its owner, two-factor sign-in is available (and required for administrators), and access to production systems is limited. No system is perfectly secure; if a breach affects your data, we will notify you as required by law.",
    ],
  },
  {
    h: "Keeping and deleting your data",
    p: [
      `We keep your data while your account is open. You can delete individual records at any time in the app. To delete your whole account, email ${LEGAL.contact}; we will delete your data within 30 days, apart from anything we must keep by law. Copies in backups are removed when those backups expire.`,
      "If you disconnect a linked account, we stop syncing it and you can remove its imported data.",
    ],
  },
  {
    h: "Your rights",
    p: [
      `You can ask us to access, correct, export or delete your personal information, or to stop processing it, by emailing ${LEGAL.contact}. Depending on where you live (for example California, the EU or the UK), you may have additional rights under local law. We will not treat you differently for exercising them.`,
    ],
  },
  {
    h: "Cookies",
    p: [
      "We use only essential cookies and browser storage: to keep you signed in, protect forms from bots, and remember simple preferences such as Abu's position on screen. We do not use advertising or analytics cookies.",
    ],
  },
  {
    h: "Children",
    p: ["Sticky Monkey is for adults 18 and older. We do not knowingly collect information from anyone under 18. If you believe a minor has an account, contact us and we will delete it."],
  },
  {
    h: "International users",
    p: ["Our service is hosted in the United States. If you use it from another country, your information will be processed in the United States."],
  },
  {
    h: "Changes to this policy",
    p: [
      "If we make material changes, we will notify you by email or in the app before they take effect. The effective date at the top of this page shows when the policy last changed.",
    ],
  },
  {
    h: "Contact",
    p: [`Questions or requests: ${LEGAL.contact}.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Sticky Monkey Lifestyle (“Sticky Monkey”, “we”, “us”) helps you track your money, health and goals in one place. This policy explains what we collect, why, who helps us run the service, and the choices you have."
      sections={SECTIONS}
    />
  );
}
