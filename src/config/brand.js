export const BRAND = Object.freeze({
  name: 'RADDIMART',
  tagline: 'Connecting Every Scrap Collector to a Greener Tomorrow.',
  primaryColor: '#107357',
});

export const ROLES = Object.freeze([
  'consumer',
  'collector',
  'aggregator',
  'recycler',
]);

// Roles a user may request. These are the role_requests.requested_role values:
// local_collector maps to profiles.active_role = 'collector' on approval.
export const REQUESTABLE_ROLES = Object.freeze([
  { value: 'local_collector', label: 'Local Kabadiwala (collector)' },
  { value: 'aggregator', label: 'Aggregator' },
  { value: 'recycler', label: 'Recycler' },
]);

export const TRANSACTION_STATUSES = Object.freeze([
  'LISTED',
  'PICKUP_REQUESTED',
  'ACCEPTED',
  'COLLECTED',
  'IN_AGGREGATOR_INVENTORY',
  'OFFERED_TO_RECYCLER',
  'ACCEPTED_BY_RECYCLER',
  'HANDOVER_CONFIRMED',
  'COMPLETED',
]);

export const PAYMENT_STATUSES = Object.freeze(['PENDING', 'PAID']);
