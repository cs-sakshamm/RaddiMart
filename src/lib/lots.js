// Shared, side-effect-free rules for aggregator inventory and recycler offers.
// The database (migration 20261124000600) enforces the same rules; this module
// keeps the UI honest and is covered by unit tests.

export const LOT_STATUS = {
  IN_AGGREGATOR_INVENTORY: 'IN_AGGREGATOR_INVENTORY',
};

export const LOT_STATUS_LABELS = {
  IN_AGGREGATOR_INVENTORY: 'In aggregator inventory',
};

export const OFFER_STATUS = {
  OFFERED_TO_RECYCLER: 'OFFERED_TO_RECYCLER',
  REJECTED_BY_RECYCLER: 'REJECTED_BY_RECYCLER',
  ACCEPTED_BY_RECYCLER: 'ACCEPTED_BY_RECYCLER',
  HANDOVER_CONFIRMED: 'HANDOVER_CONFIRMED',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
};

export const OFFER_STATUS_LABELS = {
  OFFERED_TO_RECYCLER: 'Awaiting recycler',
  REJECTED_BY_RECYCLER: 'Declined by recycler',
  ACCEPTED_BY_RECYCLER: 'Accepted by recycler',
  HANDOVER_CONFIRMED: 'Awaiting receipt confirmation',
  COMPLETED: 'Completed',
  WITHDRAWN: 'Withdrawn',
};

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
};

export const PAYMENT_STATUS_LABELS = {
  PENDING: 'Payment pending',
  PAID: 'Payment recorded',
};

export const VERIFICATION_LABELS = {
  pending: 'Verification pending',
  verified: 'Verified by administrator',
  rejected: 'Verification rejected',
};

export function lotStatusLabel(status) {
  return LOT_STATUS_LABELS[status] || status || 'Unknown';
}

export function offerStatusLabel(status) {
  return OFFER_STATUS_LABELS[status] || status || 'Unknown';
}

export function verificationLabel(status) {
  return VERIFICATION_LABELS[status] || 'Verification not recorded';
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] || 'Payment not recorded';
}

// Short, human-readable reference derived from the database lot_code UUID.
export function formatLotCode(code) {
  if (!code) return 'Lot —';
  return `Lot ${String(code).slice(0, 8).toUpperCase()}`;
}

export function isLotIntake(lot) {
  return Boolean(lot) && !lot.aggregator_id && lot.status === LOT_STATUS.IN_AGGREGATOR_INVENTORY;
}

export function isLotOwnedBy(lot, userId) {
  return Boolean(lot && userId) && lot.aggregator_id === userId;
}

export function canClaimLot(lot, userId, role) {
  return role === 'aggregator' && isLotIntake(lot) && Boolean(userId);
}

export function canCreateOffer(lot, userId, role, hasBlockingOffer) {
  if (role !== 'aggregator' || !userId || !lot) return false;
  return isLotOwnedBy(lot, userId) && !hasBlockingOffer;
}

export function hasLiveOffer(offers = []) {
  return (offers || []).some((offer) => offer.status === OFFER_STATUS.OFFERED_TO_RECYCLER);
}

// An accepted offer keeps the lot committed until its handover completes. A
// declined or withdrawn offer does not block a new offer.
export function hasActiveOffer(offers = []) {
  return (offers || []).some((offer) =>
    [
      OFFER_STATUS.OFFERED_TO_RECYCLER,
      OFFER_STATUS.ACCEPTED_BY_RECYCLER,
      OFFER_STATUS.HANDOVER_CONFIRMED,
      OFFER_STATUS.COMPLETED,
    ].includes(offer.status),
  );
}

// A lot's saleable weight is the recorded actual weight, falling back to the
// consumer's estimate when a collector could not weigh it.
export function saleableWeight(lot) {
  const actual = Number.parseFloat(lot?.actual_weight);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const estimate = Number.parseFloat(lot?.approximate_weight);
  if (Number.isFinite(estimate) && estimate > 0) return estimate;
  return null;
}

export function calculateOfferValue(ratePerKg, weight) {
  const rate = Number.parseFloat(ratePerKg);
  const kg = Number.parseFloat(weight);
  if (!Number.isFinite(rate) || !Number.isFinite(kg) || rate <= 0 || kg <= 0) return null;
  return Math.round(rate * kg * 100) / 100;
}

export function validateOffer({ recyclerId, ratePerKg } = {}) {
  if (!recyclerId) return 'Choose a recycler for this offer.';
  const rate = Number.parseFloat(ratePerKg);
  if (!Number.isFinite(rate) || rate <= 0) return 'Enter a buying rate above zero.';
  return null;
}

export function filterLots(lots, { scope = 'all', categoryId = '', search = '' } = {}) {
  const term = (search || '').trim().toLowerCase();
  return (lots || []).filter((lot) => {
    if (scope === 'intake' && !isLotIntake(lot)) return false;
    if (scope === 'mine' && lot.aggregator_id === null) return false;
    if (categoryId && lot.category_id !== categoryId) return false;
    if (term) {
      const haystack = [
        lot.lot_code,
        lot.category?.name,
        lot.subcategory?.name,
        lot.pickup_zone,
        lot.condition,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function summariseAggregatorLots(lots, userId) {
  const list = lots || [];
  const intake = list.filter(isLotIntake);
  const inventory = list.filter((lot) => isLotOwnedBy(lot, userId));
  const weight = inventory.reduce((total, lot) => total + (saleableWeight(lot) || 0), 0);
  return {
    intake,
    inventory,
    intakeCount: intake.length,
    inventoryCount: inventory.length,
    inventoryWeight: Math.round(weight * 100) / 100,
  };
}

export function summariseOffers(offers) {
  const list = offers || [];
  const live = list.filter((offer) => offer.status === OFFER_STATUS.OFFERED_TO_RECYCLER);
  const rejected = list.filter((offer) => offer.status === OFFER_STATUS.REJECTED_BY_RECYCLER);
  const accepted = list.filter((offer) => offer.status === OFFER_STATUS.ACCEPTED_BY_RECYCLER);
  const handover = list.filter((offer) => offer.status === OFFER_STATUS.HANDOVER_CONFIRMED);
  const completed = list.filter((offer) => offer.status === OFFER_STATUS.COMPLETED);
  const withdrawn = list.filter((offer) => offer.status === OFFER_STATUS.WITHDRAWN);
  return {
    live,
    rejected,
    accepted,
    handover,
    completed,
    withdrawn,
    liveCount: live.length,
    rejectedCount: rejected.length,
    acceptedCount: accepted.length,
    handoverCount: handover.length,
    completedCount: completed.length,
    totalCount: list.length,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 response and handover rules. The database enforces the same states.
// ---------------------------------------------------------------------------

export function canRecyclerRespond(offer, facilityId, role) {
  return Boolean(
    offer &&
      facilityId &&
      role === 'recycler' &&
      offer.recycler_id === facilityId &&
      offer.status === OFFER_STATUS.OFFERED_TO_RECYCLER,
  );
}

export function canRecordHandover(offer, userId, role) {
  return Boolean(
    offer && userId && role === 'aggregator' && offer.status === OFFER_STATUS.ACCEPTED_BY_RECYCLER,
  );
}

export function canConfirmHandover(handover, offer, facilityId, role) {
  return Boolean(
    handover &&
      offer &&
      facilityId &&
      role === 'recycler' &&
      offer.recycler_id === facilityId &&
      offer.status === OFFER_STATUS.HANDOVER_CONFIRMED &&
      !handover.recycler_confirmation,
  );
}

export function canRecordPayment(offer, role) {
  return Boolean(
    offer &&
      role === 'aggregator' &&
      offer.status !== OFFER_STATUS.OFFERED_TO_RECYCLER &&
      offer.status !== OFFER_STATUS.REJECTED_BY_RECYCLER &&
      offer.status !== OFFER_STATUS.WITHDRAWN &&
      offer.payment_status === PAYMENT_STATUS.PENDING,
  );
}

// Final received weight is deliberately separate from collected and estimated
// weights. It is what the aggregator and recycler agree at handover.
export function validateHandover({ receivedWeight, handoverDate } = {}, now = new Date()) {
  const weight = Number.parseFloat(receivedWeight);
  if (!Number.isFinite(weight) || weight <= 0) return 'Enter the final received weight above zero.';
  if (!handoverDate) return 'Choose the handover date and time.';
  const date = new Date(handoverDate);
  if (Number.isNaN(date.getTime())) return 'Enter a valid handover date and time.';
  if (date.getTime() > now.getTime() + 5 * 60 * 1000) {
    return 'The handover date cannot be in the future.';
  }
  return null;
}
