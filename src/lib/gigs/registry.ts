import type { GigConfig } from "./schema";
import { CARE_EDUCATION_CONFIGS } from "./configs/careEducation";
import { DIGITAL_CREATIVE_CONFIGS } from "./configs/digitalCreative";
import { ECOMMERCE_CONFIGS } from "./configs/ecommerce";
import { FOOD_RIDESHARE_CONFIGS } from "./configs/foodRideshare";
import { HOME_TRADES_CONFIGS } from "./configs/homeTrades";
import { REAL_ESTATE_CONFIGS } from "./configs/realEstate";
import { SHORT_TERM_RENTAL_CONFIGS } from "./configs/shortTermRental";

// Every tailored gig workspace, keyed by exact gig_categories.name. Rentals
// (Property Management), classes (Yoga / Fitness), App/Web Developer and
// IT/Tech Support keep their hand-built modules and aren't listed here.
const ALL: GigConfig[] = [
  ...CARE_EDUCATION_CONFIGS,
  ...DIGITAL_CREATIVE_CONFIGS,
  ...ECOMMERCE_CONFIGS,
  ...FOOD_RIDESHARE_CONFIGS,
  ...HOME_TRADES_CONFIGS,
  ...REAL_ESTATE_CONFIGS,
  ...SHORT_TERM_RENTAL_CONFIGS,
];

const BY_NAME = new Map<string, GigConfig>();
for (const c of ALL) for (const name of c.categories) BY_NAME.set(name.toLowerCase(), c);

export function getGigConfig(categoryName: string | null | undefined): GigConfig | null {
  if (!categoryName) return null;
  return BY_NAME.get(categoryName.trim().toLowerCase()) ?? null;
}

export function allGigCategoryNames(): string[] {
  return [...BY_NAME.keys()];
}
