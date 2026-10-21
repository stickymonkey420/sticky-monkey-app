import type { Metadata } from "next";
import LegalPage, { LEGAL, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Consumer Health Data Privacy Policy · Sticky Monkey Lifestyle" };

// Separate consumer health data policy required by Nevada SB 370 (NRS 603A)
// and Washington's My Health My Data Act. Keep in sync with the consent text
// in components/health/HealthConsentGate.tsx and with /privacy.
const SECTIONS: LegalSection[] = [
  {
    h: "What counts as consumer health data",
    p: [
      "Information that identifies you and relates to your past, present or future physical or mental health. In Sticky Monkey, that is everything in the Health and Medical sections.",
    ],
  },
  {
    h: "Categories we collect",
    ul: [
      "Nutrition: meals, foods, portions, calories and macros, and food photos you take.",
      "Activity: exercise sessions and estimated calories burned.",
      "Body: weight, body-fat percentage, BMI and other scale readings, and tape measurements.",
      "Fasting sessions and health goals (for example, target weight and weekly loss rate).",
      "Health profile: birth year, sex, height and activity level, used to estimate calorie needs.",
      "Medical follow-ups: vaccines and dose dates, health checks and results, clinics, and visit notes.",
      "Health reminders you set, such as weigh-ins.",
    ],
  },
  {
    h: "Sources",
    p: [
      "All of it comes directly from you, entered or photographed in the app. Calorie and nutrition values are filled in from the public USDA food database, and food-photo estimates come from our AI provider. We don't buy health data or collect it from other companies, and we don't use location or geofencing.",
    ],
  },
  {
    h: "Why we collect it",
    p: [
      "Only to provide the Health and Medical features you ask for: calorie in/out tracking, food lookups, body and fasting tracking, reminders, vaccine and health-check schedules, and the health summary on your dashboard. We do not use it for advertising, profiling or any other purpose, and we collect it only after you consent.",
    ],
  },
  {
    h: "Who we share it with",
    p: ["We never sell consumer health data. It is shared only with the processors that run the service, under contract and only for that purpose:"],
    ul: [
      "Supabase — database and storage of your entries and food photos.",
      "Vercel — website hosting.",
      "Anthropic — receives a food photo only when you ask for a calorie estimate. Its terms don't allow it to train its models on this data.",
    ],
  },
  {
    h: "Your rights",
    p: ["You can, at any time:"],
    ul: [
      "confirm whether we collect, share or sell your consumer health data (we never sell it);",
      "get a copy of it, and the list of every third party and processor it has been shared with;",
      "withdraw your consent — use “Withdraw health data consent” at the bottom of the Health page, or email us;",
      "have it deleted, including from our processors. You can also delete individual entries yourself in the app.",
    ],
  },
  {
    h: "How to make a request",
    p: [
      `Email ${LEGAL.contact} from the address on your account, with the subject “Health data request”. We may confirm your identity before acting. We respond within 45 days; if a request is complex we may extend that once by up to 45 more days and will tell you why.`,
      `If we turn down your request, you can appeal by replying with “Appeal” in the subject line. We will answer an appeal within 45 days and explain our decision. If you are still unhappy, you can contact your state attorney general (for example, the Nevada or Washington Attorney General).`,
    ],
  },
  {
    h: "Security and breaches",
    p: [
      "Health data is locked to your account: no other member, and no Sticky Monkey staff outside urgent support or security work, can view it. It is encrypted in transit and at rest. If a breach exposes your health data, we will notify you without unreasonable delay, and within 60 days at the latest, as the FTC Health Breach Notification Rule requires.",
    ],
  },
  {
    h: "Not HIPAA",
    p: [
      "Sticky Monkey is not a healthcare provider, health plan or business associate, so HIPAA does not apply. This policy, our Privacy Policy and the state laws above describe the protections that do.",
    ],
  },
  {
    h: "Changes",
    p: [
      "If we change how we collect or share consumer health data, we will update this page and ask for your consent again before the change applies to you.",
    ],
  },
];

export default function ConsumerHealthDataPage() {
  return (
    <LegalPage
      title="Consumer Health Data Privacy Policy"
      intro="This policy covers the health information you keep in Sticky Monkey Lifestyle's Health and Medical sections. It adds to our Privacy Policy and is written to meet consumer health data laws such as Nevada SB 370 and Washington's My Health My Data Act."
      sections={SECTIONS}
    />
  );
}
