// Shared, side-effect-free listing rules for the consumer and collector flows.
// The database (supabase/migrations/20261124000400_*.sql and 00500) enforces the
// same transitions and column ownership; this module keeps the UI honest and is
// covered by unit tests.

export const LISTING_STATUS = {
  LISTED: 'LISTED',
  PICKUP_REQUESTED: 'PICKUP_REQUESTED',
  ACCEPTED: 'ACCEPTED',
  COLLECTED: 'COLLECTED',
  CANCELLED: 'CANCELLED',
};

export const STATUS_LABELS = {
  LISTED: 'Available',
  PICKUP_REQUESTED: 'Pickup requested',
  ACCEPTED: 'Accepted',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
};

// Marketplace statuses: a listing is discoverable by collectors while it is
// open and not yet claimed.
export const MARKETPLACE_STATUSES = [LISTING_STATUS.LISTED, LISTING_STATUS.PICKUP_REQUESTED];

const TRANSITIONS = {
  LISTED: [LISTING_STATUS.PICKUP_REQUESTED, LISTING_STATUS.ACCEPTED, LISTING_STATUS.CANCELLED],
  PICKUP_REQUESTED: [LISTING_STATUS.LISTED, LISTING_STATUS.ACCEPTED, LISTING_STATUS.CANCELLED],
  ACCEPTED: [LISTING_STATUS.COLLECTED, LISTING_STATUS.PICKUP_REQUESTED, LISTING_STATUS.LISTED],
  COLLECTED: [],
  CANCELLED: [],
};

export function canTransition(from, to) {
  if (!from || !to || from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Unknown';
}

export function isMarketplaceListing(listing) {
  return Boolean(listing) && MARKETPLACE_STATUSES.includes(listing.status);
}

export function canCollectorClaim(listing, userId) {
  if (!listing || !userId) return false;
  return isMarketplaceListing(listing) && !listing.collector_id;
}

export function canCollectorComplete(listing, userId) {
  if (!listing || !userId) return false;
  return listing.status === LISTING_STATUS.ACCEPTED && listing.collector_id === userId;
}

export function canCollectorRelease(listing, userId) {
  return canCollectorComplete(listing, userId);
}

export function canConsumerEdit(listing) {
  if (!listing) return false;
  return (
    !listing.collector_id &&
    (listing.status === LISTING_STATUS.LISTED || listing.status === LISTING_STATUS.PICKUP_REQUESTED)
  );
}

export function canConsumerCancel(listing) {
  return canConsumerEdit(listing);
}

export function canConsumerRequestPickup(listing) {
  if (!listing) return false;
  return listing.status === LISTING_STATUS.LISTED && !listing.collector_id;
}

// Indicative amount = estimated weight x active rate for the chosen category.
// The result is never a guaranteed payment; callers must label it as indicative.
export function calculateIndicativePrice(weight, ratePerKg) {
  const w = Number.parseFloat(weight);
  const r = Number.parseFloat(ratePerKg);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r < 0) return null;
  return Math.round(w * r * 100) / 100;
}

export function formatAmount(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toFixed(2)}`;
}

export function formatWeight(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  return `${n} kg`;
}

// Dates use the product's Indian context and never show raw seconds.
const DATE_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDateTime(value) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  return DATE_TIME_FORMAT.format(date);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMAT.format(date);
}

export function filterListings(listings, filters = {}) {
  const { categoryId, subcategoryId, zone, status, search } = filters;
  const term = (search || '').trim().toLowerCase();

  return (listings || []).filter((listing) => {
    if (categoryId && listing.category_id !== categoryId) return false;
    if (subcategoryId && listing.subcategory_id !== subcategoryId) return false;
    if (zone && (listing.pickup_zone || '').toLowerCase() !== zone.toLowerCase()) return false;
    if (status && listing.status !== status) return false;
    if (term) {
      const haystack = [
        listing.category?.name,
        listing.subcategory?.name,
        listing.pickup_zone,
        listing.condition,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function paginate(items, page, pageSize) {
  const list = items || [];
  const size = Math.max(1, pageSize || 1);
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page || 1), totalPages);
  return {
    items: list.slice((current - 1) * size, current * size),
    page: current,
    totalPages,
    total: list.length,
  };
}

export function summariseCollectorListings(listings, userId) {
  const list = listings || [];
  const available = list.filter((l) => isMarketplaceListing(l) && !l.collector_id);
  const pendingRequests = list.filter(
    (l) => l.status === LISTING_STATUS.PICKUP_REQUESTED && !l.collector_id,
  );
  const accepted = list.filter(
    (l) => l.status === LISTING_STATUS.ACCEPTED && l.collector_id === userId,
  );
  const completed = list.filter(
    (l) => l.status === LISTING_STATUS.COLLECTED && l.collector_id === userId,
  );
  const recentActivity = [...accepted, ...completed]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 5);

  return {
    availableCount: available.length,
    pendingRequestCount: pendingRequests.length,
    acceptedCount: accepted.length,
    completedCount: completed.length,
    available,
    pendingRequests,
    accepted,
    completed,
    recentActivity,
  };
}

// Server-side filter description, shared by the marketplace page and its tests.
export function buildMarketplaceFilters(filters = {}) {
  const query = {
    category_id: filters.categoryId || null,
    subcategory_id: filters.subcategoryId || null,
    pickup_zone: filters.zone ? filters.zone.trim() : null,
    status: filters.status && MARKETPLACE_STATUSES.includes(filters.status) ? filters.status : null,
    search: filters.search ? filters.search.trim() : null,
  };
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v));
}
