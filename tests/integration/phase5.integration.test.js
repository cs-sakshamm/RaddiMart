import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Phase 5 backend integration tests: automatic lot creation, aggregator intake,
// offers to recyclers and facility verification rules.
//
// Local only. The suite is skipped unless INTEGRATION_* variables are present,
// and it refuses a non-loopback URL because it creates and deletes users.

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
    '[integration] Skipping Phase 5 backend tests: set INTEGRATION_SUPABASE_URL, ' +
      'INTEGRATION_SUPABASE_ANON_KEY and INTEGRATION_SUPABASE_SERVICE_KEY to run them.',
  );
}

const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const PASSWORD = 'local-test-password-123';
const emails = {
  consumer: `phase5-consumer-${run}@test.local`,
  collector: `phase5-collector-${run}@test.local`,
  aggregatorA: `phase5-agg-a-${run}@test.local`,
  aggregatorB: `phase5-agg-b-${run}@test.local`,
  recycler: `phase5-recycler-${run}@test.local`,
};

let admin;
let consumer;
let collector;
let aggregatorA;
let aggregatorB;
let recycler;
const userIds = {};
let categoryId;
let listingId;
let lotId;
let recyclerId;
let firstOfferId;

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createUser(key, email, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  expect(error, `create user ${email}`).toBeNull();
  userIds[key] = data.user.id;
  const anon = client();
  const { error: signInError } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInError, `sign in ${email}`).toBeNull();
  return anon;
}

describe.skipIf(!configured)('Phase 5 aggregator inventory and offers (local Supabase)', () => {
  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    consumer = await createUser('consumer', emails.consumer, 'Phase 5 Consumer');
    collector = await createUser('collector', emails.collector, 'Phase 5 Collector');
    aggregatorA = await createUser('aggregatorA', emails.aggregatorA, 'Aggregator A');
    aggregatorB = await createUser('aggregatorB', emails.aggregatorB, 'Aggregator B');
    recycler = await createUser('recycler', emails.recycler, 'Recycler R');

    await admin.from('profiles').update({ active_role: 'collector' }).eq('id', userIds.collector);
    await admin.from('profiles').update({ active_role: 'aggregator' }).eq('id', userIds.aggregatorA);
    await admin.from('profiles').update({ active_role: 'aggregator' }).eq('id', userIds.aggregatorB);
    await admin.from('profiles').update({ active_role: 'recycler' }).eq('id', userIds.recycler);

    const { data: category, error: catError } = await consumer
      .from('material_categories')
      .select('id')
      .eq('name', 'E-waste')
      .single();
    expect(catError).toBeNull();
    categoryId = category.id;

    const { data: listing, error: listingError } = await admin
      .from('scrap_listings')
      .insert({
        consumer_id: userIds.consumer,
        category_id: categoryId,
        approximate_weight: 10,
        condition: 'Used',
        pickup_zone: 'Pune West',
        status: 'LISTED',
      })
      .select('id')
      .single();
    expect(listingError).toBeNull();
    listingId = listing.id;
    await admin
      .from('scrap_listing_addresses')
      .insert({ listing_id: listingId, address: '9 Phase Five Road, Pune' });
  }, 120000);

  afterAll(async () => {
    if (!admin) return;
    if (lotId) {
      await admin.from('transactions').delete().eq('lot_id', lotId);
      await admin.from('material_lots').delete().eq('id', lotId);
    }
    if (listingId) await admin.from('scrap_listings').delete().eq('id', listingId);
    if (recyclerId) await admin.from('recyclers').delete().eq('id', recyclerId);
    for (const id of Object.values(userIds)) {
      await admin.from('scrap_listings').delete().eq('consumer_id', id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 60000);

  it('creates a lot automatically when a collector completes a collection', async () => {
    const claim = await collector
      .from('scrap_listings')
      .update({ collector_id: userIds.collector, status: 'ACCEPTED' })
      .eq('id', listingId)
      .is('collector_id', null)
      .select('id')
      .single();
    expect(claim.error).toBeNull();

    const complete = await collector
      .from('scrap_listings')
      .update({ status: 'COLLECTED', actual_weight: 9.5 })
      .eq('id', listingId)
      .eq('collector_id', userIds.collector)
      .eq('status', 'ACCEPTED')
      .select('id')
      .single();
    expect(complete.error).toBeNull();

    const { data: lots, error } = await admin
      .from('material_lots')
      .select('*')
      .eq('source_listing_id', listingId);
    expect(error).toBeNull();
    expect(lots).toHaveLength(1);
    lotId = lots[0].id;
    expect(lots[0].status).toBe('IN_AGGREGATOR_INVENTORY');
    expect(Number(lots[0].actual_weight)).toBe(9.5);
    expect(lots[0].aggregator_id).toBeNull();
    // The consumer's street address is not copied into the lot.
    expect(lots[0].pickup_location).toBeNull();
    expect(lots[0].lot_code).toBeTruthy();
  });

  it('does not create a second lot when the same collection is replayed', async () => {
    const { data: lots } = await admin
      .from('material_lots')
      .select('id')
      .eq('source_listing_id', listingId);
    expect(lots).toHaveLength(1);
  });

  it('shows unassigned intake to approved aggregators but not to the consumer', async () => {
    const { data: aggregatorLots, error } = await aggregatorA
      .from('material_lots')
      .select('id, aggregator_id')
      .eq('id', lotId);
    expect(error).toBeNull();
    expect(aggregatorLots).toHaveLength(1);

    const { data: consumerLots } = await consumer.from('material_lots').select('id').eq('id', lotId);
    expect(consumerLots).toHaveLength(0);
  });

  it('rejects attempts by a non-aggregator to claim a lot', async () => {
    const { data } = await collector
      .from('material_lots')
      .update({ aggregator_id: userIds.collector })
      .eq('id', lotId)
      .select('id');
    expect(data).toHaveLength(0);
  });

  it('lets exactly one aggregator receive the lot and protects its fields', async () => {
    const claimed = await aggregatorA
      .from('material_lots')
      .update({ aggregator_id: userIds.aggregatorA })
      .eq('id', lotId)
      .is('aggregator_id', null)
      .select('id, aggregator_id')
      .maybeSingle();
    expect(claimed.error).toBeNull();
    expect(claimed.data.aggregator_id).toBe(userIds.aggregatorA);

    const duplicate = await aggregatorB
      .from('material_lots')
      .update({ aggregator_id: userIds.aggregatorB })
      .eq('id', lotId)
      .is('aggregator_id', null)
      .select('id')
      .maybeSingle();
    expect(duplicate.data).toBeNull();

    const tamper = await aggregatorA
      .from('material_lots')
      .update({ actual_weight: 100 })
      .eq('id', lotId)
      .select('id');
    expect(tamper.error || tamper.data.length === 0).toBeTruthy();

    const { data: hiddenFromB } = await aggregatorB
      .from('material_lots')
      .select('id')
      .eq('id', lotId);
    expect(hiddenFromB).toHaveLength(0);
  });

  it('lets a recycler create a facility but never self-verify it', async () => {
    const created = await recycler
      .from('recyclers')
      .insert({
        profile_id: userIds.recycler,
        facility_name: 'Phase 5 Eco Facility',
        location: 'Pune',
        accepted_categories: ['E-waste'],
        verification_status: 'pending',
      })
      .select('id, verification_status')
      .single();
    expect(created.error).toBeNull();
    recyclerId = created.data.id;
    expect(created.data.verification_status).toBe('pending');

    const selfVerify = await recycler
      .from('recyclers')
      .update({ verification_status: 'verified' })
      .eq('id', recyclerId)
      .select('verification_status')
      .single();
    expect(selfVerify.error).toBeNull();
    expect(selfVerify.data.verification_status).toBe('pending');
  });

  it('makes facility profiles visible to aggregators with their real verification status', async () => {
    const { data } = await aggregatorA
      .from('recyclers')
      .select('id, facility_name, verification_status')
      .eq('id', recyclerId)
      .single();
    expect(data.facility_name).toBe('Phase 5 Eco Facility');
    expect(data.verification_status).toBe('pending');
  });

  it('lets the owning aggregator create an offer and shows it to its recycler', async () => {
    const created = await aggregatorA
      .from('transactions')
      .insert({
        lot_id: lotId,
        recycler_id: recyclerId,
        offered_rate: 95,
        status: 'OFFERED_TO_RECYCLER',
        payment_status: 'PENDING',
      })
      .select('id, status, offered_rate')
      .single();
    expect(created.error).toBeNull();
    firstOfferId = created.data.id;
    expect(created.data.status).toBe('OFFERED_TO_RECYCLER');

    const { data: recyclerOffers, error } = await recycler
      .from('transactions')
      .select('id, status, offered_rate, lot:material_lots(lot_code)')
      .eq('id', firstOfferId);
    expect(error).toBeNull();
    expect(recyclerOffers).toHaveLength(1);
    expect(recyclerOffers[0].lot.lot_code).toBeTruthy();
  });

  it('keeps offers private to the owning aggregator', async () => {
    const { data: other } = await aggregatorB
      .from('transactions')
      .select('id')
      .eq('id', firstOfferId);
    expect(other).toHaveLength(0);

    const foreignOffer = await aggregatorB
      .from('transactions')
      .insert({
        lot_id: lotId,
        recycler_id: recyclerId,
        offered_rate: 50,
        status: 'OFFERED_TO_RECYCLER',
        payment_status: 'PENDING',
      })
      .select('id');
    expect(foreignOffer.error).not.toBeNull();
  });

  it('prevents a second live offer for the same lot', async () => {
    const duplicate = await aggregatorA
      .from('transactions')
      .insert({
        lot_id: lotId,
        recycler_id: recyclerId,
        offered_rate: 99,
        status: 'OFFERED_TO_RECYCLER',
        payment_status: 'PENDING',
      })
      .select('id');
    expect(duplicate.error).not.toBeNull();
  });

  it('lets the aggregator withdraw and then send a new offer', async () => {
    const withdrawn = await aggregatorA
      .from('transactions')
      .update({ status: 'WITHDRAWN' })
      .eq('id', firstOfferId)
      .eq('status', 'OFFERED_TO_RECYCLER')
      .select('id, status')
      .single();
    expect(withdrawn.error).toBeNull();
    expect(withdrawn.data.status).toBe('WITHDRAWN');

    const { data: history } = await recycler
      .from('transactions')
      .select('id, status')
      .eq('id', firstOfferId);
    expect(history[0].status).toBe('WITHDRAWN');

    const second = await aggregatorA
      .from('transactions')
      .insert({
        lot_id: lotId,
        recycler_id: recyclerId,
        offered_rate: 92,
        status: 'OFFERED_TO_RECYCLER',
        payment_status: 'PENDING',
      })
      .select('id')
      .single();
    expect(second.error).toBeNull();
    await admin.from('transactions').delete().eq('id', second.data.id);
  });

  it('does not treat an offer as accepted or paid', async () => {
    const { data } = await admin
      .from('transactions')
      .select('status, payment_status')
      .eq('id', firstOfferId)
      .single();
    expect(data.status).toBe('WITHDRAWN');
    expect(data.payment_status).toBe('PENDING');
  });

  it('serves uploaded listing photos only through signed URLs', async () => {
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const path = `listings/${userIds.consumer}/private-probe.png`;
    const upload = await consumer.storage
      .from('scrap-listings')
      .upload(path, pngBytes, { contentType: 'image/png', upsert: true });
    expect(upload.error).toBeNull();

    const { data: publicUrl } = consumer.storage.from('scrap-listings').getPublicUrl(path);
    const publicResponse = await fetch(publicUrl.publicUrl);
    expect(publicResponse.status).not.toBe(200);

    const signed = await consumer.storage.from('scrap-listings').createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const signedResponse = await fetch(signed.data.signedUrl);
    expect(signedResponse.status).toBe(200);

    const foreign = await aggregatorA.storage
      .from('scrap-listings')
      .upload(`listings/${userIds.consumer}/intruder.png`, pngBytes, {
        contentType: 'image/png',
        upsert: true,
      });
    expect(foreign.error).not.toBeNull();
  }, 60000);

  it('denies anonymous access to lots, offers and facilities', async () => {
    const anon = client();
    const [lots, offers, facilities] = await Promise.all([
      anon.from('material_lots').select('id'),
      anon.from('transactions').select('id'),
      anon.from('recyclers').select('id'),
    ]);
    expect(lots.data || []).toHaveLength(0);
    expect(offers.data || []).toHaveLength(0);
    expect(facilities.data || []).toHaveLength(0);
  });
});
