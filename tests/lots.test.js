import { describe, it, expect } from 'vitest';
import {
  calculateOfferValue,
  canClaimLot,
  canConfirmHandover,
  canCreateOffer,
  canRecordHandover,
  canRecordPayment,
  canRecyclerRespond,
  filterLots,
  formatLotCode,
  hasActiveOffer,
  hasLiveOffer,
  paymentStatusLabel,
  isLotIntake,
  offerStatusLabel,
  saleableWeight,
  summariseAggregatorLots,
  summariseOffers,
  validateHandover,
  validateOffer,
  verificationLabel,
} from '../src/lib/lots.js';

const AGG = 'agg-1';
const OTHER = 'agg-2';

const lot = (overrides = {}) => ({
  id: 'lot-1',
  lot_code: 'abcdef12-3456-7890-abcd-ef1234567890',
  aggregator_id: null,
  status: 'IN_AGGREGATOR_INVENTORY',
  category_id: 'cat-ewaste',
  category: { name: 'E-waste' },
  subcategory: { name: 'Cables and wires' },
  approximate_weight: 10,
  actual_weight: null,
  condition: 'Used',
  pickup_zone: 'Pune West',
  ...overrides,
});

describe('lot references and status labels', () => {
  it('formats a short lot reference', () => {
    expect(formatLotCode('abcdef12-3456')).toBe('Lot ABCDEF12');
    expect(formatLotCode(null)).toBe('Lot —');
  });

  it('labels offer and verification states without claiming unsupported facts', () => {
    expect(offerStatusLabel('OFFERED_TO_RECYCLER')).toBe('Awaiting recycler');
    expect(offerStatusLabel('WITHDRAWN')).toBe('Withdrawn');
    expect(verificationLabel('pending')).toBe('Verification pending');
    expect(verificationLabel('verified')).toBe('Verified by administrator');
    expect(verificationLabel(null)).toBe('Verification not recorded');
  });
});

describe('lot ownership rules', () => {
  it('treats an unassigned inventory lot as intake', () => {
    expect(isLotIntake(lot())).toBe(true);
    expect(isLotIntake(lot({ aggregator_id: AGG }))).toBe(false);
  });

  it('lets only approved aggregators claim an unassigned lot', () => {
    expect(canClaimLot(lot(), AGG, 'aggregator')).toBe(true);
    expect(canClaimLot(lot({ aggregator_id: AGG }), AGG, 'aggregator')).toBe(false);
    expect(canClaimLot(lot(), AGG, 'collector')).toBe(false);
    expect(canClaimLot(lot(), null, 'aggregator')).toBe(false);
  });

  it('lets an aggregator offer only a lot in its own inventory', () => {
    expect(canCreateOffer(lot({ aggregator_id: AGG }), AGG, 'aggregator', false)).toBe(true);
    expect(canCreateOffer(lot({ aggregator_id: AGG }), AGG, 'aggregator', true)).toBe(false);
    expect(canCreateOffer(lot({ aggregator_id: OTHER }), AGG, 'aggregator', false)).toBe(false);
    expect(canCreateOffer(lot({ aggregator_id: AGG }), AGG, 'consumer', false)).toBe(false);
  });

  it('detects a live offer', () => {
    expect(hasLiveOffer([{ status: 'WITHDRAWN' }])).toBe(false);
    expect(hasLiveOffer([{ status: 'OFFERED_TO_RECYCLER' }])).toBe(true);
    expect(hasLiveOffer([])).toBe(false);
  });
});

describe('saleable weight and offer value', () => {
  it('prefers actual collected weight and falls back to the estimate', () => {
    expect(saleableWeight(lot({ actual_weight: 9.5 }))).toBe(9.5);
    expect(saleableWeight(lot())).toBe(10);
    expect(saleableWeight(lot({ actual_weight: 0, approximate_weight: null }))).toBeNull();
  });

  it('calculates and rounds the estimated offer value', () => {
    expect(calculateOfferValue(95, 9.5)).toBe(902.5);
    expect(calculateOfferValue('14.33', '2.5')).toBe(35.83);
    expect(calculateOfferValue(0, 10)).toBeNull();
    expect(calculateOfferValue(10, null)).toBeNull();
    expect(calculateOfferValue('abc', 10)).toBeNull();
  });

  it('validates offer input before sending', () => {
    expect(validateOffer({ recyclerId: 'r1', ratePerKg: '95' })).toBeNull();
    expect(validateOffer({ recyclerId: '', ratePerKg: '95' })).toMatch(/Choose a recycler/);
    expect(validateOffer({ recyclerId: 'r1', ratePerKg: '0' })).toMatch(/above zero/);
    expect(validateOffer({ recyclerId: 'r1', ratePerKg: '' })).toMatch(/above zero/);
  });
});

describe('lot filtering and summaries', () => {
  const lots = [
    lot({ id: 'a', lot_code: 'aaaa1111-0000' }),
    lot({ id: 'b', aggregator_id: AGG, lot_code: 'bbbb2222-0000', category_id: 'cat-paper', pickup_zone: 'Pune East' }),
    lot({ id: 'c', aggregator_id: AGG, actual_weight: 5.5, lot_code: 'cccc3333-0000', category_id: 'cat-metal', pickup_zone: 'Nashik' }),
  ];

  it('filters by intake and owned scopes', () => {
    expect(filterLots(lots, { scope: 'intake' }).map((l) => l.id)).toEqual(['a']);
    expect(filterLots(lots, { scope: 'mine' }).map((l) => l.id)).toEqual(['b', 'c']);
  });

  it('filters by category and free text', () => {
    expect(filterLots(lots, { categoryId: 'cat-paper' }).map((l) => l.id)).toEqual(['b']);
    expect(filterLots(lots, { search: 'bbbb' }).map((l) => l.id)).toEqual(['b']);
    expect(filterLots(lots, { search: 'pune west' }).map((l) => l.id)).toEqual(['a']);
    expect(filterLots(lots, { search: 'nothing' })).toEqual([]);
  });

  it('summarises intake, inventory and weight', () => {
    const summary = summariseAggregatorLots(lots, AGG);
    expect(summary.intakeCount).toBe(1);
    expect(summary.inventoryCount).toBe(2);
    expect(summary.inventoryWeight).toBe(15.5);
  });

  it('summarises live and withdrawn offers', () => {
    const summary = summariseOffers([
      { status: 'OFFERED_TO_RECYCLER' },
      { status: 'WITHDRAWN' },
      { status: 'OFFERED_TO_RECYCLER' },
    ]);
    expect(summary.liveCount).toBe(2);
    expect(summary.withdrawn).toHaveLength(1);
    expect(summary.totalCount).toBe(3);
  });

  it('handles empty input', () => {
    expect(filterLots(null)).toEqual([]);
    expect(summariseAggregatorLots(null, AGG).inventoryWeight).toBe(0);
    expect(summariseOffers(null).totalCount).toBe(0);
  });
});

describe('Phase 6 response and handover rules', () => {
  const offer = (overrides = {}) => ({
    id: 'offer-1',
    recycler_id: 'facility-1',
    status: 'OFFERED_TO_RECYCLER',
    payment_status: 'PENDING',
    ...overrides,
  });

  it('lets only the addressed recycler respond to an open offer', () => {
    expect(canRecyclerRespond(offer(), 'facility-1', 'recycler')).toBe(true);
    expect(canRecyclerRespond(offer(), 'facility-2', 'recycler')).toBe(false);
    expect(canRecyclerRespond(offer(), 'facility-1', 'aggregator')).toBe(false);
    expect(canRecyclerRespond(offer({ status: 'ACCEPTED_BY_RECYCLER' }), 'facility-1', 'recycler')).toBe(false);
    expect(canRecyclerRespond(offer({ status: 'WITHDRAWN' }), 'facility-1', 'recycler')).toBe(false);
  });

  it('blocks a new offer while one is active, but not after decline', () => {
    expect(hasActiveOffer([{ status: 'OFFERED_TO_RECYCLER' }])).toBe(true);
    expect(hasActiveOffer([{ status: 'ACCEPTED_BY_RECYCLER' }])).toBe(true);
    expect(hasActiveOffer([{ status: 'HANDOVER_CONFIRMED' }])).toBe(true);
    expect(hasActiveOffer([{ status: 'COMPLETED' }])).toBe(true);
    expect(hasActiveOffer([{ status: 'REJECTED_BY_RECYCLER' }])).toBe(false);
    expect(hasActiveOffer([{ status: 'WITHDRAWN' }])).toBe(false);
    expect(canCreateOffer(lot({ aggregator_id: AGG }), AGG, 'aggregator', hasActiveOffer([{ status: 'ACCEPTED_BY_RECYCLER' }]))).toBe(false);
    expect(canCreateOffer(lot({ aggregator_id: AGG }), AGG, 'aggregator', hasActiveOffer([{ status: 'REJECTED_BY_RECYCLER' }]))).toBe(true);
  });

  it('allows handover only for an accepted offer and receipt only by the facility', () => {
    expect(canRecordHandover(offer({ status: 'ACCEPTED_BY_RECYCLER' }), AGG, 'aggregator')).toBe(true);
    expect(canRecordHandover(offer(), AGG, 'aggregator')).toBe(false);
    expect(canRecordHandover(offer({ status: 'ACCEPTED_BY_RECYCLER' }), AGG, 'recycler')).toBe(false);

    const handover = { recycler_confirmation: false };
    expect(canConfirmHandover(handover, offer({ status: 'HANDOVER_CONFIRMED' }), 'facility-1', 'recycler')).toBe(true);
    expect(canConfirmHandover(handover, offer({ status: 'HANDOVER_CONFIRMED' }), 'facility-2', 'recycler')).toBe(false);
    expect(canConfirmHandover({ recycler_confirmation: true }, offer({ status: 'COMPLETED' }), 'facility-1', 'recycler')).toBe(false);
  });

  it('validates final received weight separately from collection weight', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    expect(validateHandover({ receivedWeight: '12.7', handoverDate: '2026-11-26T10:00:00Z' }, now)).toBeNull();
    expect(validateHandover({ receivedWeight: '0', handoverDate: '2026-11-26T10:00:00Z' }, now)).toMatch(/above zero/);
    expect(validateHandover({ receivedWeight: '12', handoverDate: '' }, now)).toMatch(/Choose/);
    expect(validateHandover({ receivedWeight: '12', handoverDate: '2026-11-27T10:00:00Z' }, now)).toMatch(/future/);
  });

  it('keeps payment independent and labels it plainly', () => {
    expect(canRecordPayment(offer({ status: 'ACCEPTED_BY_RECYCLER' }), 'aggregator')).toBe(true);
    expect(canRecordPayment(offer({ status: 'ACCEPTED_BY_RECYCLER', payment_status: 'PAID' }), 'aggregator')).toBe(false);
    expect(canRecordPayment(offer({ status: 'OFFERED_TO_RECYCLER' }), 'aggregator')).toBe(false);
    expect(canRecordPayment(offer({ status: 'REJECTED_BY_RECYCLER' }), 'aggregator')).toBe(false);
    expect(paymentStatusLabel('PENDING')).toBe('Payment pending');
    expect(paymentStatusLabel('PAID')).toBe('Payment recorded');
  });

  it('summarises every response and handover state', () => {
    const summary = summariseOffers([
      { status: 'OFFERED_TO_RECYCLER' },
      { status: 'ACCEPTED_BY_RECYCLER' },
      { status: 'HANDOVER_CONFIRMED' },
      { status: 'COMPLETED' },
      { status: 'REJECTED_BY_RECYCLER' },
      { status: 'WITHDRAWN' },
    ]);
    expect(summary.liveCount).toBe(1);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.handoverCount).toBe(1);
    expect(summary.completedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.withdrawn).toHaveLength(1);
  });
});
