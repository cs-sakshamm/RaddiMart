import { describe, it, expect } from 'vitest';
import {
  LISTING_STATUS,
  buildMarketplaceFilters,
  calculateIndicativePrice,
  canCollectorClaim,
  canCollectorComplete,
  canConsumerCancel,
  canConsumerEdit,
  canConsumerRequestPickup,
  canTransition,
  filterListings,
  formatAmount,
  formatWeight,
  paginate,
  statusLabel,
  summariseCollectorListings,
} from '../src/lib/listings.js';

const COLLECTOR = 'collector-1';
const OTHER_COLLECTOR = 'collector-2';

const listings = [
  {
    id: 'l1',
    status: 'LISTED',
    collector_id: null,
    category_id: 'cat-ewaste',
    subcategory_id: 'sub-pcb',
    pickup_zone: 'Pune West',
    condition: 'Used',
    category: { name: 'E-waste' },
    subcategory: { name: 'PCBs' },
    updated_at: '2026-11-20T10:00:00Z',
  },
  {
    id: 'l2',
    status: 'PICKUP_REQUESTED',
    collector_id: null,
    category_id: 'cat-metals',
    subcategory_id: 'sub-copper',
    pickup_zone: 'Pune East',
    condition: 'New',
    category: { name: 'Metals' },
    subcategory: { name: 'Copper' },
    updated_at: '2026-11-21T10:00:00Z',
  },
  {
    id: 'l3',
    status: 'ACCEPTED',
    collector_id: COLLECTOR,
    category_id: 'cat-metals',
    subcategory_id: 'sub-copper',
    pickup_zone: 'Pune East',
    condition: 'Used',
    category: { name: 'Metals' },
    subcategory: { name: 'Copper' },
    updated_at: '2026-11-22T10:00:00Z',
  },
  {
    id: 'l4',
    status: 'COLLECTED',
    collector_id: COLLECTOR,
    category_id: 'cat-paper',
    subcategory_id: null,
    pickup_zone: 'Pune West',
    condition: 'Used',
    category: { name: 'Paper' },
    subcategory: null,
    updated_at: '2026-11-23T10:00:00Z',
  },
  {
    id: 'l5',
    status: 'ACCEPTED',
    collector_id: OTHER_COLLECTOR,
    category_id: 'cat-paper',
    subcategory_id: null,
    pickup_zone: 'Mumbai',
    condition: 'Used',
    category: { name: 'Paper' },
    subcategory: null,
    updated_at: '2026-11-24T10:00:00Z',
  },
];

describe('filterListings', () => {
  it('returns everything when no filters are supplied', () => {
    expect(filterListings(listings, {})).toHaveLength(5);
  });

  it('filters by category', () => {
    const result = filterListings(listings, { categoryId: 'cat-metals' });
    expect(result.map((l) => l.id)).toEqual(['l2', 'l3']);
  });

  it('filters by subcategory', () => {
    const result = filterListings(listings, { subcategoryId: 'sub-pcb' });
    expect(result.map((l) => l.id)).toEqual(['l1']);
  });

  it('filters by zone case-insensitively', () => {
    const result = filterListings(listings, { zone: 'pune west' });
    expect(result.map((l) => l.id)).toEqual(['l1', 'l4']);
  });

  it('filters by status', () => {
    const result = filterListings(listings, { status: 'ACCEPTED' });
    expect(result.map((l) => l.id)).toEqual(['l3', 'l5']);
  });

  it('searches category, subcategory, zone and condition', () => {
    expect(filterListings(listings, { search: 'copper' }).map((l) => l.id)).toEqual(['l2', 'l3']);
    expect(filterListings(listings, { search: 'mumbai' }).map((l) => l.id)).toEqual(['l5']);
    expect(filterListings(listings, { search: 'new' }).map((l) => l.id)).toEqual(['l2']);
  });

  it('combines filters', () => {
    const result = filterListings(listings, { categoryId: 'cat-metals', zone: 'Pune East' });
    expect(result.map((l) => l.id)).toEqual(['l2', 'l3']);
  });

  it('handles null and undefined input', () => {
    expect(filterListings(null)).toEqual([]);
    expect(filterListings(undefined, { search: 'x' })).toEqual([]);
  });
});

describe('status transitions', () => {
  it('allows the documented collector workflow', () => {
    expect(canTransition(LISTING_STATUS.LISTED, LISTING_STATUS.PICKUP_REQUESTED)).toBe(true);
    expect(canTransition(LISTING_STATUS.LISTED, LISTING_STATUS.ACCEPTED)).toBe(true);
    expect(canTransition(LISTING_STATUS.PICKUP_REQUESTED, LISTING_STATUS.ACCEPTED)).toBe(true);
    expect(canTransition(LISTING_STATUS.ACCEPTED, LISTING_STATUS.COLLECTED)).toBe(true);
  });

  it('allows a consumer to cancel only before acceptance', () => {
    expect(canTransition(LISTING_STATUS.LISTED, LISTING_STATUS.CANCELLED)).toBe(true);
    expect(canTransition(LISTING_STATUS.PICKUP_REQUESTED, LISTING_STATUS.CANCELLED)).toBe(true);
    expect(canTransition(LISTING_STATUS.ACCEPTED, LISTING_STATUS.CANCELLED)).toBe(false);
  });

  it('treats collected and cancelled as terminal', () => {
    expect(canTransition(LISTING_STATUS.COLLECTED, LISTING_STATUS.LISTED)).toBe(false);
    expect(canTransition(LISTING_STATUS.COLLECTED, LISTING_STATUS.ACCEPTED)).toBe(false);
    expect(canTransition(LISTING_STATUS.CANCELLED, LISTING_STATUS.LISTED)).toBe(false);
  });

  it('rejects no-op and unknown transitions', () => {
    expect(canTransition('LISTED', 'LISTED')).toBe(false);
    expect(canTransition('NOT_A_STATUS', 'ACCEPTED')).toBe(false);
    expect(canTransition(null, 'ACCEPTED')).toBe(false);
  });
});

describe('actor permissions', () => {
  it('only lets collectors claim unassigned marketplace listings', () => {
    expect(canCollectorClaim(listings[0], COLLECTOR)).toBe(true);
    expect(canCollectorClaim(listings[1], COLLECTOR)).toBe(true);
    expect(canCollectorClaim(listings[2], COLLECTOR)).toBe(false);
    expect(canCollectorClaim(listings[0], null)).toBe(false);
  });

  it('only lets the assigned collector complete the pickup', () => {
    expect(canCollectorComplete(listings[2], COLLECTOR)).toBe(true);
    expect(canCollectorComplete(listings[2], OTHER_COLLECTOR)).toBe(false);
    expect(canCollectorComplete(listings[1], COLLECTOR)).toBe(false);
  });

  it('lets consumers edit or cancel only unclaimed listings', () => {
    expect(canConsumerEdit(listings[0])).toBe(true);
    expect(canConsumerEdit(listings[1])).toBe(true);
    expect(canConsumerEdit(listings[2])).toBe(false);
    expect(canConsumerEdit(listings[3])).toBe(false);
    expect(canConsumerCancel(listings[0])).toBe(true);
    expect(canConsumerCancel(listings[2])).toBe(false);
  });

  it('lets consumers request a pickup only while the listing is open', () => {
    expect(canConsumerRequestPickup(listings[0])).toBe(true);
    expect(canConsumerRequestPickup(listings[1])).toBe(false);
    expect(canConsumerRequestPickup(listings[2])).toBe(false);
  });
});

describe('indicative price', () => {
  it('multiplies weight by rate and rounds to two decimals', () => {
    expect(calculateIndicativePrice(10, 28)).toBe(280);
    expect(calculateIndicativePrice('2.5', '14.33')).toBe(35.83);
  });

  it('returns null for missing or invalid input', () => {
    expect(calculateIndicativePrice('', 10)).toBeNull();
    expect(calculateIndicativePrice(10, undefined)).toBeNull();
    expect(calculateIndicativePrice(0, 10)).toBeNull();
    expect(calculateIndicativePrice(-5, 10)).toBeNull();
    expect(calculateIndicativePrice('abc', 10)).toBeNull();
  });

  it('formats amounts and weights for display', () => {
    expect(formatAmount(35.8)).toBe('₹35.80');
    expect(formatAmount(null)).toBe('—');
    expect(formatWeight(12)).toBe('12 kg');
    expect(formatWeight('')).toBe('—');
  });
});

describe('collector dashboard summary', () => {
  const summary = summariseCollectorListings(listings, COLLECTOR);

  it('counts available, pending, accepted and completed rows', () => {
    expect(summary.availableCount).toBe(2);
    expect(summary.pendingRequestCount).toBe(1);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.completedCount).toBe(1);
  });

  it('excludes pickups assigned to another collector', () => {
    expect(summary.accepted.map((l) => l.id)).toEqual(['l3']);
    expect(summary.completed.map((l) => l.id)).toEqual(['l4']);
  });

  it('builds recent activity newest first with at most five rows', () => {
    expect(summary.recentActivity.map((l) => l.id)).toEqual(['l4', 'l3']);
  });

  it('handles empty input', () => {
    const empty = summariseCollectorListings([], COLLECTOR);
    expect(empty.availableCount).toBe(0);
    expect(empty.recentActivity).toEqual([]);
  });
});

describe('pagination', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('splits items into pages', () => {
    expect(paginate(items, 1, 10).items).toHaveLength(10);
    expect(paginate(items, 3, 10).items).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps out-of-range pages', () => {
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it('reports totals', () => {
    const result = paginate(items, 2, 10);
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
  });
});

describe('labels and query building', () => {
  it('maps status codes to readable labels', () => {
    expect(statusLabel('PICKUP_REQUESTED')).toBe('Pickup requested');
    expect(statusLabel('SOMETHING')).toBe('SOMETHING');
    expect(statusLabel(null)).toBe('Unknown');
  });

  it('drops empty filters and keeps valid ones', () => {
    expect(
      buildMarketplaceFilters({ categoryId: 'cat-1', zone: '  ', search: '', status: 'ACCEPTED' }),
    ).toEqual({ category_id: 'cat-1' });
    expect(
      buildMarketplaceFilters({ categoryId: 'cat-1', zone: ' Pune ', search: ' pcb ', status: 'LISTED' }),
    ).toEqual({ category_id: 'cat-1', pickup_zone: 'Pune', status: 'LISTED', search: 'pcb' });
  });
});
