import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Backend integration tests for the Phase 3 consumer flow and the Phase 4
// collector marketplace. These talk to a real LOCAL Supabase instance over HTTP
// (PostgREST, GoTrue and Storage) — no mocks.
//
// Required environment variables:
//   INTEGRATION_SUPABASE_URL          e.g. http://127.0.0.1:54321
//   INTEGRATION_SUPABASE_ANON_KEY     local publishable/anon key
//   INTEGRATION_SUPABASE_SERVICE_KEY  local secret/service key (test fixture setup only)
//
// The suite is skipped when they are absent so `npm run test` works without a
// running local stack. Never point these at production.

const url = process.env.INTEGRATION_SUPABASE_URL;
const anonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY;
const serviceKey = process.env.INTEGRATION_SUPABASE_SERVICE_KEY;
// Hard guard: these tests create and delete users, so they may only ever run
// against a loopback Supabase instance.
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url || '');
if (url && !isLocal) {
  throw new Error(
    `Refusing to run destructive integration tests against non-local URL: ${url}`,
  );
}
const configured = Boolean(url && anonKey && serviceKey && isLocal);

if (!configured) {
  console.warn(
    '[integration] Skipping backend integration tests: set INTEGRATION_SUPABASE_URL, ' +
      'INTEGRATION_SUPABASE_ANON_KEY and INTEGRATION_SUPABASE_SERVICE_KEY to run them.',
  );
}

const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const emails = {
  consumerA: `phase4-consumer-a-${run}@test.local`,
  consumerB: `phase4-consumer-b-${run}@test.local`,
  collector: `phase4-collector-${run}@test.local`,
  otherCollector: `phase4-collector2-${run}@test.local`,
  aggregator: `phase4-aggregator-${run}@test.local`,
};
const PASSWORD = 'local-test-password-123';
const testZone = `Phase4 Zone ${run}`;

let admin;
let consumerA;
let consumerB;
let collector;
let otherCollector;
let aggregator;
const userIds = {};
let listingId;
let categoryId;

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

describe.skipIf(!configured)('Phase 3/4 backend integration (local Supabase)', () => {
  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    consumerA = await createUser('consumerA', emails.consumerA, 'Consumer A');
    consumerB = await createUser('consumerB', emails.consumerB, 'Consumer B');
    collector = await createUser('collector', emails.collector, 'Collector C');
    otherCollector = await createUser('otherCollector', emails.otherCollector, 'Collector D');
    aggregator = await createUser('aggregator', emails.aggregator, 'Aggregator E');

    // Approve the collector roles the way approve_role_request() would.
    await admin.from('profiles').update({ active_role: 'collector' }).eq('id', userIds.collector);
    await admin.from('profiles').update({ active_role: 'collector' }).eq('id', userIds.otherCollector);
    await admin.from('profiles').update({ active_role: 'aggregator' }).eq('id', userIds.aggregator);

    const { data: categories, error: catError } = await consumerA
      .from('material_categories')
      .select('id, name, parent_id')
      .eq('name', 'E-waste')
      .single();
    expect(catError).toBeNull();
    categoryId = categories.id;
  }, 120000);

  afterAll(async () => {
    if (!admin) return;
    for (const id of Object.values(userIds)) {
      await admin.from('scrap_listings').delete().eq('consumer_id', id);
      await admin.auth.admin.deleteUser(id);
    }
  }, 60000);

  it('creates a profile for every new auth user (trigger)', async () => {
    const { data, error } = await admin
      .from('profiles')
      .select('id, active_role')
      .in('id', Object.values(userIds));
    expect(error).toBeNull();
    expect(data).toHaveLength(5);
    expect(data.find((p) => p.id === userIds.consumerA).active_role).toBe('consumer');
  });

  it('lets a consumer request a collector role but never approve it', async () => {
    const { data: created, error } = await consumerA
      .from('role_requests')
      .insert({
        user_id: userIds.consumerB,
        requested_role: 'local_collector',
        applicant_name: 'Consumer B',
        city_or_operating_area: 'Pune',
        status: 'pending',
      })
      .select('id')
      .single();
    // user_id must be the caller: this insert claims to be consumer B and must fail.
    expect(error).not.toBeNull();

    const own = await consumerB
      .from('role_requests')
      .insert({
        user_id: userIds.consumerB,
        requested_role: 'local_collector',
        applicant_name: 'Consumer B',
        city_or_operating_area: 'Pune',
        status: 'pending',
      })
      .select('id')
      .single();
    expect(own.error).toBeNull();

    const { data: visible } = await consumerB.from('role_requests').select('id, status');
    expect(visible).toHaveLength(1);
    expect(visible[0].status).toBe('pending');

    const { data: others } = await consumerA.from('role_requests').select('id');
    expect(others).toHaveLength(0);

    const { error: approveError } = await consumerB.rpc('approve_role_request', {
      p_request_id: own.data.id,
      p_status: 'approved',
      p_review_note: 'self',
    });
    expect(approveError).not.toBeNull();

    await admin.from('role_requests').delete().eq('id', own.data.id);
    expect(created).toBeNull();
  });

  it('consumer A can create a listing and its private address', async () => {
    const { data, error } = await consumerA
      .from('scrap_listings')
      .insert({
        consumer_id: userIds.consumerA,
        category_id: categoryId,
        approximate_weight: 12,
        condition: 'Used',
        pickup_zone: testZone,
        preferred_pickup_time: new Date(Date.now() + 86400000).toISOString(),
        status: 'LISTED',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    listingId = data.id;

    const { error: addressError } = await consumerA
      .from('scrap_listing_addresses')
      .insert({ listing_id: listingId, address: '12 Test Street, Pune' });
    expect(addressError).toBeNull();
  });

  it('rejects a listing created on behalf of another consumer', async () => {
    const { error } = await consumerB.from('scrap_listings').insert({
      consumer_id: userIds.consumerA,
      category_id: categoryId,
      approximate_weight: 1,
      condition: 'Used',
      status: 'LISTED',
    });
    expect(error).not.toBeNull();
  });

  it('hides consumer A listings from consumer B and from aggregators', async () => {
    const { data: bData } = await consumerB.from('scrap_listings').select('id');
    expect(bData).toHaveLength(0);

    const { data: aggData } = await aggregator.from('scrap_listings').select('id');
    expect(aggData).toHaveLength(0);
  });

  it('shows the open listing to an approved collector with its zone but no address', async () => {
    const { data, error } = await collector
      .from('scrap_listings')
      .select('id, pickup_zone, status')
      .eq('id', listingId)
      .single();
    expect(error).toBeNull();
    expect(data.pickup_zone).toBe(testZone);

    const { data: address } = await collector
      .from('scrap_listing_addresses')
      .select('address')
      .eq('listing_id', listingId)
      .maybeSingle();
    expect(address).toBeNull();
  });

  it('lets the collector claim the pickup exactly once', async () => {
    const first = await collector
      .from('scrap_listings')
      .update({ collector_id: userIds.collector, status: 'ACCEPTED' })
      .eq('id', listingId)
      .is('collector_id', null)
      .in('status', ['LISTED', 'PICKUP_REQUESTED'])
      .select('id');
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);

    const second = await collector
      .from('scrap_listings')
      .update({ collector_id: userIds.collector, status: 'ACCEPTED' })
      .eq('id', listingId)
      .is('collector_id', null)
      .in('status', ['LISTED', 'PICKUP_REQUESTED'])
      .select('id');
    expect(second.error).toBeNull();
    expect(second.data).toHaveLength(0);
  });

  it('reveals the pickup address to the assigned collector only', async () => {
    const { data } = await collector
      .from('scrap_listing_addresses')
      .select('address')
      .eq('listing_id', listingId)
      .maybeSingle();
    expect(data?.address).toBe('12 Test Street, Pune');

    const { data: other } = await otherCollector
      .from('scrap_listing_addresses')
      .select('address')
      .eq('listing_id', listingId)
      .maybeSingle();
    expect(other).toBeNull();
  });

  it('prevents another collector from taking over or completing the pickup', async () => {
    const { data: stolen } = await otherCollector
      .from('scrap_listings')
      .update({ collector_id: userIds.otherCollector })
      .eq('id', listingId)
      .select('id');
    expect(stolen).toHaveLength(0);

    const { data } = await otherCollector
      .from('scrap_listings')
      .update({ status: 'COLLECTED' })
      .eq('id', listingId)
      .eq('collector_id', userIds.otherCollector)
      .select('id');
    expect(data).toHaveLength(0);
  });

  it('prevents the consumer from changing the pickup once it is accepted', async () => {
    const { data, error } = await consumerA
      .from('scrap_listings')
      .update({ status: 'CANCELLED' })
      .eq('id', listingId)
      .select('id');
    // Either the RLS WITH CHECK rejects the write (error) or it matches no rows.
    const blocked = error !== null || (data || []).length === 0;
    expect(blocked).toBe(true);
  });

  it('lets the assigned collector record the collection', async () => {
    const { data, error } = await collector
      .from('scrap_listings')
      .update({ status: 'COLLECTED', actual_weight: 11.4 })
      .eq('id', listingId)
      .eq('collector_id', userIds.collector)
      .eq('status', 'ACCEPTED')
      .select('id, status, actual_weight')
      .single();
    expect(error).toBeNull();
    expect(data.status).toBe('COLLECTED');
    expect(Number(data.actual_weight)).toBe(11.4);
  });

  it('removes the completed pickup from the open marketplace', async () => {
    const { data } = await collector
      .from('scrap_listings')
      .select('id')
      .in('status', ['LISTED', 'PICKUP_REQUESTED'])
      .is('collector_id', null)
      .eq('pickup_zone', testZone);
    expect(data).toHaveLength(0);
  });

  it('allows a consumer to upload a photo only into their own storage folder', async () => {
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const ownPath = `listings/${userIds.consumerA}/probe.png`;
    const own = await consumerA.storage
      .from('scrap-listings')
      .upload(ownPath, pngBytes, { contentType: 'image/png', upsert: true });
    expect(own.error).toBeNull();

    // Photos are private: the permanent public URL must not serve the object.
    const { data: publicUrl } = consumerA.storage.from('scrap-listings').getPublicUrl(ownPath);
    const response = await fetch(publicUrl.publicUrl);
    expect(response.status).not.toBe(200);

    const signed = await consumerA.storage.from('scrap-listings').createSignedUrl(ownPath, 60);
    expect(signed.error).toBeNull();
    const signedResponse = await fetch(signed.data.signedUrl);
    expect(signedResponse.status).toBe(200);

    const foreignPath = `listings/${userIds.consumerA}/intruder.png`;
    const foreign = await consumerB.storage
      .from('scrap-listings')
      .upload(foreignPath, pngBytes, { contentType: 'image/png', upsert: true });
    expect(foreign.error).not.toBeNull();
  }, 60000);

  it('denies anonymous access to listings', async () => {
    const anon = client();
    const { data } = await anon.from('scrap_listings').select('id');
    expect(data).toHaveLength(0);
  });
});
