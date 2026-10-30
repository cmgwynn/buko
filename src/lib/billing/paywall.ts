export type PeriodUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export interface IntroOffer { price: number; priceString: string; periodUnit: string; periodNumberOfUnits: number; cycles: number }
export interface PlanProduct { price: number; priceString: string; currencyCode: string; introPrice?: IntroOffer | null }
export interface PlanPackage { identifier: string; packageType: string; product: PlanProduct }

/** Annual first so the best-value plan is the default selection. */
export function orderPlans<T extends PlanPackage>(items: T[]): T[] {
  const rank = (type: string) => type === 'ANNUAL' ? 0 : type === 'MONTHLY' ? 1 : 2;
  return [...items].filter((item) => rank(item.packageType) < 2).sort((a, b) => rank(a.packageType) - rank(b.packageType));
}

function periodText(units: number, unit: string): string | null {
  const n = Math.max(1, Math.round(units));
  switch (unit) {
    case 'DAY': return `${n}-day`;
    case 'WEEK': return `${n * 7}-day`;
    case 'MONTH': return `${n}-month`;
    case 'YEAR': return `${n}-year`;
    default: return null;
  }
}

/** "7-day free trial" for a $0 intro offer; null when there is no free trial. */
export function freeTrialText(intro: IntroOffer | null | undefined): string | null {
  if (!intro || intro.price !== 0) return null;
  const period = periodText(intro.periodNumberOfUnits * Math.max(1, intro.cycles || 1), intro.periodUnit);
  return period ? `${period} free trial` : null;
}

export function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

export function perMonth(item: PlanPackage): string | null {
  if (item.packageType !== 'ANNUAL' || !(item.product.price > 0)) return null;
  return formatMoney(Math.floor(item.product.price / 12 * 100) / 100, item.product.currencyCode);
}

/** Whole-percent saving of annual vs paying monthly for 12 months. */
export function annualSavings(items: PlanPackage[]): number | null {
  const annual = items.find((item) => item.packageType === 'ANNUAL');
  const monthly = items.find((item) => item.packageType === 'MONTHLY');
  if (!annual || !monthly || annual.product.currencyCode !== monthly.product.currencyCode || !(monthly.product.price > 0)) return null;
  const saving = Math.floor((1 - annual.product.price / (monthly.product.price * 12)) * 100);
  return saving > 0 ? saving : null;
}

export function ctaTitle(item: PlanPackage): string {
  const trial = freeTrialText(item.product.introPrice);
  if (trial) return `Start ${trial}`;
  return `Subscribe for ${item.product.priceString} / ${item.packageType === 'ANNUAL' ? 'year' : 'month'}`;
}

/** Store-required price disclosure shown under the button. */
export function renewalText(item: PlanPackage): string {
  const unit = item.packageType === 'ANNUAL' ? 'year' : 'month';
  const trial = freeTrialText(item.product.introPrice);
  const price = `${item.product.priceString} per ${unit}`;
  return trial
    ? `Free for the trial, then ${price}. Cancel at least 24 hours before the trial ends in your store account and you won't be charged.`
    : `${price}, renews automatically until cancelled in your store account.`;
}

export type PaywallSource = 'meal-plan' | 'training-plan' | 'checkin' | 'suggest' | 'coach' | 'health';
const SOURCES: Record<PaywallSource, string> = {
  'meal-plan': 'Save your generated meal plan',
  'training-plan': 'Save your 4-week training plan',
  checkin: 'Let your plan adapt every week',
  suggest: 'Get tested meal suggestions',
  coach: 'Talk it through with Coach',
  health: 'Sync with your health app',
};
export function paywallHeadline(source: unknown): string {
  return typeof source === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, source) ? SOURCES[source as PaywallSource] : 'Plans built around you';
}
