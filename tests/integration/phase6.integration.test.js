import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Phase 6 backend integration tests: recycler response, handover, payment and
// public verification. Local only; refuses any non-loopback URL because it
// creates and deletes users and records.

const url = process.env.INTEGRATION_SUPABASE_URL;
const anonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
if (url && !isLocal) {
  throw new Error(`Refusing to run destructive integration tests against non-local URL: ${url}`);
}
const configured = Boolean(url && anonKey && serviceKey && isLocal);
if (!configured) {
  console.warn(
    '[integration] Skipping Phase 6 backend tests: set INTEGRATION_SUPABASE_URL, ' +
      'INTEGRATION_SUPABASE_ANON_KEY and INTEGRATION_SUPABASE_SERVICE_KEY to run them.',
  );
}

const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const PASSWORD = 'local-test-password-123';
const emails = {
  consumer: `phase6-consumer-${run}@test.local`,
  collector: `phase6-collector-${run}@test.local`,
  aggregator: `phase6-agg-${run}@test.local`,
  recycler: `phase6-recycler-${run}@test.local`,
  otherRecycler: `phase6-other-${run}@test.local`,
};

let admin;
let anon;
let consumer;
let collector;
let aggregator;
let recycler;
let otherRecycler;
const userIds = {};
let categoryId;
let listingId;
let lotId;
let facilityId;
let otherFacilityId;
let offerId;
let handoverId;
let qrToken;

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(key, email, fullName, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  expect(error, `create user ${email}`).toBeNull();
  userIds[key] = data.user.id;
  if (role) await admin.from('profiles').update({ active_role: role }).eq('id', data.user.id);
  const session = client();
  const { error: signInError } = await session.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInError, `sign in ${email}`).toBeNull();
  return session;
}

describe.skipIf(!configured)('Phase 6 recycler response, handover and verification (local Supabase)', () => {
  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    anon = client();

    consumer = await createUser('consumer', emails.consumer, 'Phase 6 Consumer');
    collector = await createUser('collector', emails.collector, 'Phase 6 Collector', 'collector');
    aggregator = await createUser('aggregator', emails.aggregator, 'Phase 6 Aggregator', 'aggregator');
    recycler = await createUser('recycler', emails.recycler, 'Phase 6 Recycler', 'recycler');
    otherRecycler = await createUser('otherRecycler', emails.otherRecycler, 'Other Recycler', 'recycler');

    const { data: category, error: categoryError } = await consumer
      .from('material_categories')
      .select('id')
      .eq('name', 'E-waste')
      .single();
    expect(categoryError).toBeNull();
    categoryId = category.id;

    const { data: facility, error: facilityError } = await admin
      .from('recyclers')
      .insert({
        profile_id: userIds.recycler,
        facility_name: 'Phase 6 Eco Facility',
        location: 'Pune',
        accepted_categories: ['E-waste'],
        verification_status: 'pending',
      })
      .select('id')
      .single();
    expect(facilityError).toBeNull();
    facilityId = facility.id;

    const { data: otherFacility, error: otherFacilityError } = await admin
      .from('recyclers')
      .insert({
        profile_id: userIds.otherRecycler,
        facility_name: 'Phase 6 Other Facility',
        location: 'Mumbai',
        accepted_categories: ['Metals'],
        verification_status: 'pending',
      })
      .select('id')
      .single();
    expect(otherFacilityError).toBeNull();
    otherFacilityId = otherFacility.id;

    const { data: listing, error: listingError } = await admin
      .from('scrap_listings')
      .insert({
        consumer_id: userIds.consumer,
        collector_id: userIds.collector,
        category_id: categoryId,
        approximate_weight: 10,
        condition: 'Used',
        pickup_zone: 'Pune West',
        status: 'ACCEPTED',
      })
      .select('id')
      .single();
    expect(listingError).toBeNull();
    listingId = listing.id;

    await admin.from('scrap_listing_addresses').insert({
      listing_id: listingId,
      address: '81 Private Phase Six Road, Pune',
    });

    const { error: completeError } = await collector
      .from('scrap_listings')
      .update({ status: 'COLLECTED', actual_weight: 9.5 })
      .eq('id', listingId)
      .eq('collector_id', userIds.collector);
    expect(completeError).toBeNull();

    const { data: lot, error: lotError } = await admin
      .from('material_lots')
      .select('id, actual_weight')
      .eq('source_listing_id', listingId)
      .single();
    expect(lotError).toBeNull();
    expect(Number(lot.actual_weight)).toBe(9.5);
    lotId = lot.id;

    const { error: claimError } = await aggregator
      .from('material_lots')
      .update({ aggregator_id: userIds.aggregator })
      .eq('id', lotId)
      .is('aggregator_id', null);
    expect(claimError).toBeNull();

    const { data: offer, error: offerError } = await aggregator
      .from('transactions')
      .insert({
        lot_id: lotId,
        recycler_id: facilityId,
        offered_rate: 95,
        status: 'OFFERED_TO_RECYCLER',
        payment_status: 'PENDING',
      })
      .select('id')
      .single();
    expect(offerError).toBeNull();
    offerId = offer.id;
  }, 120000);

  afterAll(async () => {
    if (!admin) return;
    if (offerId) await admin.from('transactions').delete().eq('id', offerId);
    if (lotId) await admin.from('material_lots').delete().eq('id', lotId);
    if (listingId) await admin.from('scrap_listings').delete().eq('id', listingId);
    if (facilityId) await admin.from('recyclers').delete().eq('id', facilityId);
    if (otherFacilityId) await admin.from('recyclers').delete().eq('id', otherFacilityId);
    for (const id of Object.values(userIds)) {
      await admin.from('scrap_listings').delete().eq('consumer_id', id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 60000);

  it('shows the offer only to its addressed facility', async () => {
    const own = await recycler.from('transactions').select('id').eq('id', offerId);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);

    const other = await otherRecycler.from('transactions').select('id').eq('id', offerId);
    expect(other.error).toBeNull();
    expect(other.data).toHaveLength(0);

    const otherUpdate = await otherRecycler
      .from('transactions')
      .update({ status: 'ACCEPTED_BY_RECYCLER' })
      .eq('id', offerId)
      .select('id');
    expect(otherUpdate.error).toBeNull();
    expect(otherUpdate.data).toHaveLength(0);
  });

  it('accepts once and rejects a duplicate response', async () => {
    const response = await recycler
      .from('transactions')
      .update({ status: 'ACCEPTED_BY_RECYCLER' })
      .eq('id', offerId)
      .eq('status', 'OFFERED_TO_RECYCLER')
      .select('id, status')
      .maybeSingle();
    expect(response.error).toBeNull();
    expect(response.data.status).toBe('ACCEPTED_BY_RECYCLER');

    const duplicate = await recycler
      .from('transactions')
      .update({ status: 'REJECTED_BY_RECYCLER' })
      .eq('id', offerId)
      .eq('status', 'OFFERED_TO_RECYCLER')
      .select('id')
      .maybeSingle();
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toBeNull();
  });

  it('rejects an invalid direct status jump and records no automatic payment', async () => {
    const jump = await aggregator
      .from('transactions')
      .update({ status: 'COMPLETED' })
      .eq('id', offerId);
    expect(jump.error).not.toBeNull();

    const { data: offer } = await admin
      .from('transactions')
      .select('status, payment_status')
      .eq('id', offerId)
      .single();
    expect(offer.status).toBe('ACCEPTED_BY_RECYCLER');
    expect(offer.payment_status).toBe('PENDING');
  });

  it('records handover with a separate final weight and immutable references', async () => {
    const handover = await aggregator
      .from('handover_records')
      .insert({
        transaction_id: offerId,
        received_weight: 12.7,
        handover_timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        notes: 'Weighed at the facility gate.',
      })
      .select('id, qr_token, lot_id, aggregator_id, recycler_id, received_weight')
      .single();
    expect(handover.error).toBeNull();
    handoverId = handover.data.id;
    qrToken = handover.data.qr_token;
    expect(handover.data.lot_id).toBe(lotId);
    expect(handover.data.aggregator_id).toBe(userIds.aggregator);
    expect(handover.data.recycler_id).toBe(facilityId);
    expect(Number(handover.data.received_weight)).toBe(12.7);

    const { data: offer } = await admin
      .from('transactions')
      .select('status, final_value, payment_status')
      .eq('id', offerId)
      .single();
    expect(offer.status).toBe('HANDOVER_CONFIRMED');
    expect(Number(offer.final_value)).toBe(1206.5);
    expect(offer.payment_status).toBe('PENDING');

    const { data: lot } = await admin
      .from('material_lots')
      .select('actual_weight, status')
      .eq('id', lotId)
      .single();
    expect(Number(lot.actual_weight)).toBe(9.5);
    expect(lot.status).toBe('HANDOVER_CONFIRMED');

    const rewrite = await aggregator
      .from('handover_records')
      .update({ received_weight: 99 })
      .eq('id', handoverId)
      .select('id')
      .maybeSingle();
    expect(rewrite.error).toBeNull();
    expect(rewrite.data).toBeNull();
    const { data: unchanged } = await admin
      .from('handover_records')
      .select('received_weight')
      .eq('id', handoverId)
      .single();
    expect(Number(unchanged.received_weight)).toBe(12.7);
  });

  it('keeps public verification unavailable until receipt is confirmed', async () => {
    const { data, error } = await anon.rpc('get_handover_verification', { p_token: qrToken });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('records payment separately and only by the aggregator', async () => {
    const recyclerAttempt = await recycler
      .from('transactions')
      .update({ payment_status: 'PAID' })
      .eq('id', offerId)
      .select('id');
    expect(recyclerAttempt.error).toBeNull();
    expect(recyclerAttempt.data).toHaveLength(0);

    const payment = await aggregator
      .from('transactions')
      .update({ payment_status: 'PAID' })
      .eq('id', offerId)
      .select('payment_status')
      .single();
    expect(payment.error).toBeNull();
    expect(payment.data.payment_status).toBe('PAID');

    const { data: offer } = await admin
      .from('transactions')
      .select('status, payment_status')
      .eq('id', offerId)
      .single();
    expect(offer.status).toBe('HANDOVER_CONFIRMED');
    expect(offer.payment_status).toBe('PAID');
  });

  it('completes only after the recycler confirms receipt, then exposes safe public fields', async () => {
    const confirm = await recycler
      .from('handover_records')
      .update({ recycler_confirmation: true })
      .eq('id', handoverId)
      .eq('recycler_confirmation', false)
      .select('id, recycler_confirmed_at')
      .single();
    expect(confirm.error).toBeNull();
    expect(confirm.data.recycler_confirmed_at).toBeTruthy();

    const { data: offer } = await admin
      .from('transactions')
      .select('status')
      .eq('id', offerId)
      .single();
    expect(offer.status).toBe('COMPLETED');

    const { data: lot } = await admin
      .from('material_lots')
      .select('status')
      .eq('id', lotId)
      .single();
    expect(lot.status).toBe('COMPLETED');

    const { data: record, error } = await anon.rpc('get_handover_verification', { p_token: qrToken });
    expect(error).toBeNull();
    expect(record).toBeTruthy();
    expect(record.received_weight).toBe(12.7);
    expect(record.category).toBe('E-waste');
    expect(record.facility_name).toBe('Phase 6 Eco Facility');
    expect(record).not.toHaveProperty('address');
    expect(record).not.toHaveProperty('contact_email');
    expect(record).not.toHaveProperty('offered_rate');
    expect(record).not.toHaveProperty('payment_status');

    const { data: history } = await admin
      .from('transaction_events')
      .select('to_status')
      .eq('transaction_id', offerId)
      .order('created_at');
    expect(history.map((event) => event.to_status)).toEqual([
      'OFFERED_TO_RECYCLER',
      'ACCEPTED_BY_RECYCLER',
      'HANDOVER_CONFIRMED',
      'COMPLETED',
    ]);
  });
});
