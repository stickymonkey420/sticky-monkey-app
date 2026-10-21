import type { Metadata } from "next";
import LegalPage, { LEGAL, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · Sticky Monkey Lifestyle" };

const SECTIONS: LegalSection[] = [
  {
    h: "Accepting these terms",
    p: [
      "By creating an account or using Sticky Monkey Lifestyle (“Sticky Monkey”, the “service”), you agree to these Terms and to our Privacy Policy. If you don't agree, please don't use the service.",
    ],
  },
  {
    h: "Who can use Sticky Monkey",
    ul: [
      "You must be at least 18 years old.",
      "You must give accurate sign-up information and keep your password and two-factor device secure. You are responsible for activity on your account.",
      "One person per account. Don't share your account or sign in as someone else.",
    ],
  },
  {
    h: "What Sticky Monkey is — and isn't",
    p: [
      "Sticky Monkey is a set of tools for organizing and tracking your own information: investments, options trades, income, taxes, side businesses, nutrition, exercise and medical follow-ups.",
      "It is not financial, investment, tax, legal or medical advice. Market data, screener results, tax estimates, calorie counts, health targets, vaccine schedules and anything Abu says are for information only and may be incomplete, delayed or wrong. We are not a broker, investment adviser, tax preparer, lender or healthcare provider. Make your own decisions and consult a qualified professional — your doctor, a licensed financial adviser or a tax professional — before acting on anything you see here.",
      "In a medical emergency, call your local emergency number.",
    ],
  },
  {
    h: "AI features",
    p: [
      "Abu and the food-photo calorie estimates use artificial intelligence. AI output can be inaccurate. Check important details yourself, and don't send Abu passwords, account numbers or other information you don't need to share.",
    ],
  },
  {
    h: "Fantasy Finance and simulators",
    p: [
      "Fantasy Finance, the practice account and the options simulator use play money only. No real trades are placed, nothing has cash value, and results don't predict real-world returns.",
    ],
  },
  {
    h: "Linked accounts",
    p: [
      "If you connect a bank or brokerage (paid plans only), the connection is provided by Plaid under Plaid's own terms and privacy policy. Sticky Monkey has read-only access: it cannot move money or place trades. Balances may be delayed and are not a substitute for statements from your institution.",
    ],
  },
  {
    h: "Your content",
    p: [
      "You own the information you put into Sticky Monkey. You give us permission to store, process and display it only to provide the service to you. We do not sell it. You can delete it at any time, as described in our Privacy Policy.",
    ],
  },
  {
    h: "Acceptable use",
    p: ["Don't:"],
    ul: [
      "break the law, or use the service to harass, defraud or harm anyone;",
      "try to access other members' data, probe or bypass our security, or overload the service;",
      "scrape, copy or resell the service or its data, or use bots to create accounts;",
      "upload malware or content you don't have the right to share.",
    ],
  },
  {
    h: "Paid plans",
    p: [
      "Sticky Monkey is currently free. If we introduce paid plans, the price, billing period and cancellation terms will be shown before you buy, and nothing will be charged without your agreement.",
    ],
  },
  {
    h: "Early-access service",
    p: [
      "Sticky Monkey is under active development. Features may change, be added or be removed, and there may be bugs or downtime. Keep your own records of anything important, such as tax documents and medical records.",
    ],
  },
  {
    h: "Ending your account",
    p: [
      `You can stop using Sticky Monkey and ask us to delete your account at any time by emailing ${LEGAL.contact}. We may suspend or close accounts that break these Terms or put other members or the service at risk.`,
    ],
  },
  {
    h: "Disclaimers",
    p: [
      "The service is provided “as is” and “as available”, without warranties of any kind, express or implied, including accuracy, fitness for a particular purpose and non-infringement, to the fullest extent the law allows.",
    ],
  },
  {
    h: "Limitation of liability",
    p: [
      "To the fullest extent the law allows, Sticky Monkey will not be liable for indirect, incidental, special or consequential damages, or for lost profits, investment or trading losses, tax penalties, or health outcomes arising from your use of the service. Our total liability for any claim is limited to the greater of $100 or the amount you paid us in the 12 months before the claim.",
    ],
  },
  {
    h: "Indemnity",
    p: ["If you misuse the service or break these Terms and that leads to a claim against us, you agree to cover the reasonable costs of that claim."],
  },
  {
    h: "Governing law",
    p: [`These Terms are governed by the laws of ${LEGAL.governingLaw}, without regard to conflict-of-law rules. Disputes will be handled in the courts located there, unless the law where you live says otherwise.`],
  },
  {
    h: "Changes to these terms",
    p: [
      "If we make material changes, we will notify you by email or in the app before they take effect. Continuing to use the service after that means you accept the updated Terms.",
    ],
  },
  {
    h: "Contact",
    p: [`Questions about these Terms: ${LEGAL.contact}.`],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These Terms explain the rules for using Sticky Monkey Lifestyle. Please read them — especially the sections on advice, AI and liability."
      sections={SECTIONS}
    />
  );
}
