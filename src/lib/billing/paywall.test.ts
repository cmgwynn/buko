import assert from 'node:assert/strict';
import test from 'node:test';
import { annualSavings, ctaTitle, freeTrialText, orderPlans, paywallHeadline, perMonth, renewalText, type PlanPackage } from './paywall';

const trial = { price: 0, priceString: '$0.00', periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 };
const annual: PlanPackage = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { price: 49.99, priceString: '$49.99', currencyCode: 'USD', introPrice: trial } };
const monthly: PlanPackage = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { price: 9.99, priceString: '$9.99', currencyCode: 'USD', introPrice: null } };

test('orders annual first and drops other package types', () => {
  const weekly = { ...monthly, identifier: 'w', packageType: 'WEEKLY' };
  assert.deepEqual(orderPlans([monthly, weekly, annual]).map((p) => p.packageType), ['ANNUAL', 'MONTHLY']);
});

test('free trial text only for $0 intro offers', () => {
  assert.equal(freeTrialText(trial), '7-day free trial');
  assert.equal(freeTrialText({ ...trial, periodUnit: 'WEEK', periodNumberOfUnits: 2 }), '14-day free trial');
  assert.equal(freeTrialText({ ...trial, price: 0.99 }), null);
  assert.equal(freeTrialText(null), null);
  assert.equal(freeTrialText({ ...trial, periodUnit: 'ODD' }), null);
});

test('annual pricing helpers', () => {
  assert.match(perMonth(annual) ?? '', /4\.16/);
  assert.equal(perMonth(monthly), null);
  assert.equal(annualSavings([annual, monthly]), 58);
  assert.equal(annualSavings([annual]), null);
  assert.equal(annualSavings([annual, { ...monthly, product: { ...monthly.product, currencyCode: 'EUR' } }]), null);
});

test('CTA and renewal disclosure', () => {
  assert.equal(ctaTitle(annual), 'Start 7-day free trial');
  assert.equal(ctaTitle(monthly), 'Subscribe for $9.99 / month');
  assert.match(renewalText(annual), /then \$49\.99 per year/);
  assert.match(renewalText(monthly), /renews automatically/);
});

test('headline by source', () => {
  assert.equal(paywallHeadline('meal-plan'), 'Save your generated meal plan');
  assert.equal(paywallHeadline('toString'), 'Plans built around you');
  assert.equal(paywallHeadline(undefined), 'Plans built around you');
});
